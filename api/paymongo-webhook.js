import { getRecord, saveRecord } from '../lib/redis.js';
import { getVerifiedQrPhPayment, verifyPaymongoWebhook } from '../lib/paymongo.js';

export const config = { api: { bodyParser: false } };

async function readRawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body);
  if (Buffer.isBuffer(req.rawBody)) return req.rawBody;
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed.' });
  }

  try {
    const rawBody = await readRawBody(req);
    const signature = req.headers?.['paymongo-signature'];
    if (!verifyPaymongoWebhook(rawBody, signature)) {
      return res.status(401).json({ success: false, error: 'Invalid webhook signature.' });
    }

    const event = JSON.parse(rawBody.toString('utf8'));
    const eventAttributes = event.data?.attributes || {};
    const payment = eventAttributes.data || {};
    const paymentAttributes = payment.attributes || {};
    const paymentIntentId = paymentAttributes.payment_intent_id
      || (typeof payment.id === 'string' && payment.id.startsWith('pi_') ? payment.id : '');
    if (!paymentIntentId) return res.status(200).json({ success: true, ignored: true });

    const verifiedPayment = await getVerifiedQrPhPayment(paymentIntentId);
    if (!verifiedPayment.orderId) return res.status(200).json({ success: true, ignored: true });

    const order = await getRecord('drift:orders', verifiedPayment.orderId);
    if (!order || order.paymentIntentId !== verifiedPayment.paymentIntentId) {
      return res.status(200).json({ success: true, ignored: true });
    }
    if (
      verifiedPayment.amount !== Math.round(Number(order.total) * 100)
      || verifiedPayment.currency !== 'PHP'
    ) {
      console.error(`PayMongo amount or currency mismatch for order ${order.id}.`);
      return res.status(400).json({ success: false, error: 'Payment details do not match the order.' });
    }

    if (verifiedPayment.status === 'succeeded') {
      order.paymentStatus = 'Paid';
      if (order.status === 'Pending') order.status = 'Confirmed';
    } else if (eventAttributes.type === 'qrph.expired') {
      order.paymentStatus = 'Expired';
    } else if (eventAttributes.type === 'payment.failed') {
      order.paymentStatus = 'Failed';
    } else {
      return res.status(200).json({ success: true, ignored: true });
    }
    await saveRecord('drift:orders', order.id, order);
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('PayMongo webhook error:', error);
    return res.status(500).json({ success: false, error: 'Unable to process the payment notification.' });
  }
}
