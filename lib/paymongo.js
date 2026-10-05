import { createHmac, timingSafeEqual } from 'node:crypto';

const PAYMONGO_API = 'https://api.paymongo.com/v1';

function createApiError(message, statusCode = 502) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function basicAuthorization(apiKey) {
  return `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`;
}

async function paymongoRequest(path, apiKey, body) {
  const response = await fetch(`${PAYMONGO_API}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: basicAuthorization(apiKey),
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw createApiError('PayMongo returned an invalid response.');
  }
  if (!response.ok || data.errors) {
    throw createApiError('PayMongo could not process the QR Ph payment.');
  }
  return data.data;
}

export function paymongoQrPhReady() {
  if (process.env.PAYMONGO_QRPH_ENABLED !== 'true') return false;
  const mode = process.env.PAYMONGO_SECRET_KEY?.match(/^sk_(test|live)_/)?.[1];
  return Boolean(
    mode
      && process.env.PAYMONGO_PUBLIC_KEY?.startsWith(`pk_${mode}_`)
      && process.env.PAYMONGO_WEBHOOK_SECRET,
  );
}

export async function createQrPhPayment(totalPesos, orderId) {
  if (!paymongoQrPhReady()) {
    throw createApiError(
      'QR Ph is not configured. Add the PayMongo secret key, public key, and webhook secret.',
      503,
    );
  }
  const amount = Math.round(totalPesos * 100);
  if (!Number.isSafeInteger(amount) || amount < 100) {
    throw createApiError('QR Ph payments must be at least PHP 1.00.', 400);
  }

  const intent = await paymongoRequest('/payment_intents', process.env.PAYMONGO_SECRET_KEY, {
    data: {
      attributes: {
        amount,
        currency: 'PHP',
        payment_method_allowed: ['qrph'],
        description: `Drift & Co. Order ${orderId}`,
        metadata: { order_id: orderId },
      },
    },
  });
  const clientKey = intent.attributes?.client_key;
  if (!intent.id || !clientKey) {
    throw createApiError('PayMongo did not return the required payment details.');
  }

  const paymentMethod = await paymongoRequest('/payment_methods', process.env.PAYMONGO_PUBLIC_KEY, {
    data: { attributes: { type: 'qrph', expiry_seconds: 1800 } },
  });
  if (!paymentMethod.id) {
    throw createApiError('PayMongo did not return a QR Ph payment method.');
  }

  const attachedIntent = await paymongoRequest(
    `/payment_intents/${encodeURIComponent(intent.id)}/attach`,
    process.env.PAYMONGO_PUBLIC_KEY,
    {
      data: {
        attributes: {
          payment_method: paymentMethod.id,
          client_key: clientKey,
        },
      },
    },
  );
  const imageUrl = attachedIntent.attributes?.next_action?.code?.image_url;
  if (
    attachedIntent.attributes?.status !== 'awaiting_next_action'
    || typeof imageUrl !== 'string'
    || !/^data:image\/(?:png|jpeg|jpg);base64,[A-Za-z0-9+/=]+$/i.test(imageUrl)
  ) {
    throw createApiError('PayMongo did not return a valid QR Ph image.');
  }

  return { paymentIntentId: intent.id, qrCodeDataUrl: imageUrl };
}

export function verifyPaymongoWebhook(rawBody, signatureHeader) {
  const webhookSecret = process.env.PAYMONGO_WEBHOOK_SECRET;
  if (!webhookSecret || !Buffer.isBuffer(rawBody) || typeof signatureHeader !== 'string') return false;
  const signature = Object.fromEntries(
    signatureHeader.split(',').map(part => {
      const separator = part.indexOf('=');
      return separator < 0 ? ['', ''] : [part.slice(0, separator).trim(), part.slice(separator + 1).trim()];
    }),
  );
  const signatureValue = process.env.PAYMONGO_SECRET_KEY?.startsWith('sk_test_')
    ? signature.te
    : signature.li;
  if (!signature.t || !signatureValue) return false;

  const expected = createHmac('sha256', webhookSecret)
    .update(`${signature.t}.${rawBody.toString('utf8')}`)
    .digest();
  let received;
  try {
    received = Buffer.from(signatureValue, 'hex');
  } catch {
    return false;
  }
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export async function getVerifiedQrPhPayment(paymentIntentId) {
  const intent = await paymongoRequest(
    `/payment_intents/${encodeURIComponent(paymentIntentId)}`,
    process.env.PAYMONGO_SECRET_KEY,
  );
  const attributes = intent.attributes || {};
  return {
    orderId: attributes.metadata?.order_id,
    paymentIntentId: intent.id,
    amount: attributes.amount,
    currency: attributes.currency,
    status: attributes.status,
  };
}
