export const defaultSettings = {
  ownerPhone: '09171234567',
  ownerName: 'Drift & Co. Store Admin',
  ownerEmail: 'concierge@driftandco.ph',
  webhookUrl: '',
  telegramBotToken: '',
  telegramChatId: '',
  semaphoreApiKey: '',
  semaphoreSenderName: 'DriftAndCo',
  twilioAccountSid: '',
  twilioAuthToken: '',
  twilioFromNumber: '',
  ntfyTopic: 'drift-co-orders-alert',
  notifyOwnerOnOrder: true,
  notifyCustomerOnOrder: true,
  notifyOwnerOnInquiry: true,
  soundAlertsEnabled: true,
};

export function normalizeNtfyTopic(value = defaultSettings.ntfyTopic) {
  const input = String(value || defaultSettings.ntfyTopic).trim();
  if (!/^https?:\/\//i.test(input)) {
    return input;
  }

  let url;
  try {
    url = new URL(input);
  } catch {
    const error = new Error('Enter an ntfy topic name or a valid ntfy.sh topic URL.');
    error.statusCode = 400;
    throw error;
  }

  const segments = url.pathname.split('/').filter(Boolean);
  if (url.protocol !== 'https:' || url.hostname !== 'ntfy.sh' || segments.length !== 1 || url.search || url.hash) {
    const error = new Error('Enter an ntfy topic name or a URL in the form https://ntfy.sh/<topic>.');
    error.statusCode = 400;
    throw error;
  }

  try {
    return decodeURIComponent(segments[0]);
  } catch {
    const error = new Error('The ntfy URL contains an invalid topic name.');
    error.statusCode = 400;
    throw error;
  }
}

export function publicSettings(settings) {
  const {
    telegramBotToken,
    semaphoreApiKey,
    twilioAuthToken,
    ...publicValues
  } = settings;

  return {
    ...publicValues,
    telegramBotTokenMasked: maskSecret(telegramBotToken),
    semaphoreApiKeyMasked: maskSecret(semaphoreApiKey),
    twilioAuthTokenMasked: maskSecret(twilioAuthToken),
  };
}

function maskSecret(value = '') {
  return value ? `••••••••${value.slice(-4)}` : '';
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

async function postNotification(channel, url, options, recipient) {
  try {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(5000) });
    return {
      channel,
      recipient,
      status: response.ok ? 'Sent' : 'Failed',
      ...(response.ok ? {} : { error: `HTTP ${response.status}` }),
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      channel,
      recipient,
      status: 'Failed',
      error: errorMessage(error),
      timestamp: new Date().toISOString(),
    };
  }
}

export async function dispatchOrderNotifications(order, settings) {
  const logs = [];
  const pending = [];
  const itemsText = order.items
    .map(item => `• ${item.qty}x ${item.name} (${item.volume || '50ml'}) — ₱${(item.price * item.qty).toFixed(2)}`)
    .join('\n');
  const ownerSummary = `🛍️ *DRIFT & CO. — NEW CUSTOMER ORDER!*\n\n` +
    `*Order ID:* \`${order.id}\`\n` +
    `*Customer:* ${order.customerName}\n` +
    `*Phone:* ${order.phone}\n` +
    `*Address:* ${order.address || 'N/A'}\n` +
    `*Payment:* ${order.paymentMethod}${order.paymentReference ? ` (Ref: \`${order.paymentReference}\`)` : ''}\n` +
    (order.notes ? `*Notes:* ${order.notes}\n` : '') +
    `\n*Bottles Ordered:*\n${itemsText}\n\n` +
    `*Total Amount:* ₱${order.total.toFixed(2)}\n` +
    `*Status:* ${order.status}\n` +
    `*Time:* ${new Date(order.createdAt).toLocaleString('en-US', { timeZone: 'Asia/Manila' })}`;
  const customerSms = `Drift & Co.: Hello ${order.customerName}! Your order #${order.id} for ₱${order.total.toFixed(2)} (${order.paymentMethod}) has been received! Our concierge will contact you shortly regarding delivery to: ${order.address}.`;

  if (settings.telegramBotToken && settings.telegramChatId && settings.notifyOwnerOnOrder) {
    pending.push((async () => {
      try {
        const response = await fetch(`https://api.telegram.org/bot${settings.telegramBotToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: settings.telegramChatId, text: ownerSummary, parse_mode: 'Markdown' }),
          signal: AbortSignal.timeout(5000),
        });
        const result = await response.json();
        logs.push({
          channel: 'Telegram Bot',
          recipient: `Chat ${settings.telegramChatId}`,
          status: response.ok && result.ok ? 'Sent' : 'Failed',
          ...(!response.ok || !result.ok ? { error: result.description || `HTTP ${response.status}` } : {}),
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        logs.push({ channel: 'Telegram Bot', recipient: `Chat ${settings.telegramChatId}`, status: 'Failed', error: errorMessage(error), timestamp: new Date().toISOString() });
      }
    })());
  }

  if (settings.webhookUrl && settings.notifyOwnerOnOrder) {
    const isDiscord = settings.webhookUrl.includes('discord.com');
    const body = isDiscord
      ? { content: `🚨 **New Drift & Co. Perfume Order!**\n**Order #:** \`${order.id}\`\n**Customer:** **${order.customerName}** (📞 \`${order.phone}\`)\n**Total:** **₱${order.total.toFixed(2)}** via *${order.paymentMethod}*\n**Address:** ${order.address}\n**Items Ordered:**\n${order.items.map(item => `> • **${item.qty}x ${item.name}** (${item.volume || '50ml'}) — ₱${(item.price * item.qty).toFixed(2)}`).join('\n')}` }
      : { event: 'order.created', order, textSummary: ownerSummary, customerSms };
    pending.push(postNotification('Webhook Alert', settings.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, 'Configured Webhook').then(log => logs.push(log)));
  }

  if (settings.semaphoreApiKey) {
    const sendSemaphore = async (number, message, channel) => {
      const params = new URLSearchParams({
        apikey: settings.semaphoreApiKey,
        number,
        message,
      });
      if (settings.semaphoreSenderName) params.set('sendername', settings.semaphoreSenderName);
      return postNotification(channel, 'https://api.semaphore.co/api/v4/messages', {
        method: 'POST',
        body: params,
      }, number).then(log => logs.push(log));
    };

    if (settings.notifyOwnerOnOrder && settings.ownerPhone) {
      pending.push(sendSemaphore(settings.ownerPhone, `[Drift & Co. New Order] #${order.id} from ${order.customerName} (${order.phone}), Total: P${order.total.toFixed(2)} (${order.paymentMethod}). Address: ${order.address}`, 'Semaphore SMS (Owner)'));
    }
    if (settings.notifyCustomerOnOrder && order.phone) {
      pending.push(sendSemaphore(order.phone, customerSms, 'Semaphore SMS (Customer)'));
    }
  }

  if (settings.twilioAccountSid && settings.twilioAuthToken && settings.twilioFromNumber) {
    const auth = Buffer.from(`${settings.twilioAccountSid}:${settings.twilioAuthToken}`).toString('base64');
    const sendTwilio = async (number, message, label) => {
      const formattedTo = number.startsWith('+') ? number : `+63${number.replace(/^0/, '')}`;
      const params = new URLSearchParams({ From: settings.twilioFromNumber, To: formattedTo, Body: message });
      return postNotification(`Twilio SMS (${label})`, `https://api.twilio.com/2010-04-01/Accounts/${settings.twilioAccountSid}/Messages.json`, {
        method: 'POST',
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params,
      }, number).then(log => logs.push(log));
    };

    if (settings.notifyOwnerOnOrder && settings.ownerPhone) {
      pending.push(sendTwilio(settings.ownerPhone, `[Drift & Co.] New Order #${order.id} from ${order.customerName}: P${order.total.toFixed(2)}`, 'Owner'));
    }
    if (settings.notifyCustomerOnOrder && order.phone) {
      pending.push(sendTwilio(order.phone, customerSms, 'Customer'));
    }
  }

  if (settings.notifyOwnerOnOrder) {
    const topic = normalizeNtfyTopic(settings.ntfyTopic);
    pending.push(postNotification(`Instant Phone Alert (ntfy.sh/${topic})`, `https://ntfy.sh/${encodeURIComponent(topic)}`, {
      method: 'POST',
      headers: {
        Title: `New Drift & Co. Order: ${order.customerName} (₱${order.total.toFixed(2)})`,
        Priority: 'urgent',
        Tags: 'shopping_bags,perfume,moneybag',
      },
      body: `Order Reference: ${order.id}\nCustomer: ${order.customerName} (${order.phone})\nTotal: ₱${order.total.toFixed(2)} (${order.paymentMethod})\nDelivery Address: ${order.address || 'N/A'}\n\nBottles:\n${order.items.map(item => `${item.name} (x${item.qty})`).join(', ')}`,
    }, `Topic: ${topic}`).then(log => logs.push(log)));
  }

  await Promise.all(pending);
  logs.push({
    channel: 'Store Notifications & SMS Hub',
    recipient: `${order.customerName} (${order.phone})`,
    status: 'Sent',
    timestamp: new Date().toISOString(),
  });

  return logs;
}

export async function dispatchInquiryNotifications(inquiry, settings) {
  const logs = [];
  const pending = [];
  const summary = `🤝 *DRIFT & CO. — NEW RESELLER INQUIRY!*\n\n` +
    `*Inquiry ID:* \`${inquiry.id}\`\n` +
    `*Applicant:* ${inquiry.name}\n` +
    `*Phone:* ${inquiry.phone}\n` +
    `*Email:* ${inquiry.email || 'N/A'}\n` +
    `*Location:* ${inquiry.location || 'N/A'}\n` +
    `*Package:* ${inquiry.packageType}\n` +
    (inquiry.message ? `*Message:* ${inquiry.message}\n` : '') +
    `*Date:* ${new Date(inquiry.createdAt).toLocaleString('en-US', { timeZone: 'Asia/Manila' })}`;
  const plainText = `Applicant: ${inquiry.name} (Phone: ${inquiry.phone})\nEmail: ${inquiry.email || 'N/A'}\nLocation: ${inquiry.location || 'N/A'}\nPackage: ${inquiry.packageType}\nMessage: ${inquiry.message || 'None'}`;

  if (settings.notifyOwnerOnInquiry && settings.webhookUrl) {
    const isDiscord = settings.webhookUrl.includes('discord.com');
    const body = isDiscord
      ? { content: `💼 **New Reseller Application!**\n**Applicant:** ${inquiry.name} (📞 \`${inquiry.phone}\`)\n**Location:** ${inquiry.location || 'N/A'}\n**Package:** ${inquiry.packageType}\n${inquiry.message ? `**Notes:** ${inquiry.message}` : ''}` }
      : { event: 'inquiry.created', inquiry, summary };
    pending.push(postNotification('Webhook Alert', settings.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, 'Store Webhook').then(log => logs.push(log)));
  }

  if (settings.notifyOwnerOnInquiry && settings.telegramBotToken && settings.telegramChatId) {
    pending.push((async () => {
      try {
        const response = await fetch(`https://api.telegram.org/bot${settings.telegramBotToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: settings.telegramChatId, text: summary, parse_mode: 'Markdown' }),
          signal: AbortSignal.timeout(5000),
        });
        const result = await response.json();
        logs.push({
          channel: 'Telegram Bot',
          recipient: `Chat ${settings.telegramChatId}`,
          status: response.ok && result.ok ? 'Sent' : 'Failed',
          ...(!response.ok || !result.ok ? { error: result.description || `HTTP ${response.status}` } : {}),
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        logs.push({ channel: 'Telegram Bot', recipient: `Chat ${settings.telegramChatId}`, status: 'Failed', error: errorMessage(error), timestamp: new Date().toISOString() });
      }
    })());
  }

  if (settings.notifyOwnerOnInquiry) {
    const topic = normalizeNtfyTopic(settings.ntfyTopic);
    pending.push(postNotification(`Instant Phone Alert (ntfy.sh/${topic})`, `https://ntfy.sh/${encodeURIComponent(topic)}`, {
      method: 'POST',
      headers: {
        Title: `New Drift & Co. Reseller Inquiry: ${inquiry.name}`,
        Priority: 'high',
        Tags: 'briefcase,handshake',
      },
      body: plainText,
    }, `Topic: ${topic}`).then(log => logs.push(log)));
  }

  await Promise.all(pending);
  logs.push({
    channel: 'App & Reseller Hub',
    recipient: `${inquiry.name} (${inquiry.phone})`,
    status: 'Sent',
    timestamp: new Date().toISOString(),
  });
  return logs;
}

export async function sendTestNotification(settings) {
  const order = {
    id: `TEST-${Math.floor(1000 + Math.random() * 9000)}`,
    customerName: 'Test Customer (Verification Alert)',
    phone: settings.ownerPhone || '09171234567',
    address: 'Drift & Co. Headquarters, BGC Taguig',
    paymentMethod: 'Cash on Delivery (COD)',
    items: [{ name: 'Baccarat Rouge (Tester Verification)', price: 450, image: '', volume: '50ml', qty: 1 }],
    total: 450,
    status: 'Pending',
    createdAt: new Date().toISOString(),
    notes: 'This is a test notification to verify your alert configuration.',
  };

  return dispatchOrderNotifications(order, settings);
}
