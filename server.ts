import express, { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { normalizeNtfyTopic } from './lib/notifications.js';
import { requireStudioAccess } from './lib/studio-auth.js';
import { createQrPhPayment, getVerifiedQrPhPayment, paymongoQrPhReady, verifyPaymongoWebhook } from './lib/paymongo.js';
import {
  getDeliveryQuote,
  getPickupDetails,
  searchDeliveryAddresses,
  verifyDeliveryQuote,
} from './lib/delivery.js';
import { calculateOrderSubtotal } from './lib/order-pricing.js';

dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';
const PORT = 3000;

interface OrderItem {
  name: string;
  price: number;
  image: string;
  volume: string;
  qty: number;
}

interface NotificationLog {
  channel: string;
  recipient: string;
  status: 'Sent' | 'Failed' | 'Simulated';
  timestamp: string;
  error?: string;
}

interface Order {
  id: string;
  customerName: string;
  phone: string;
  fulfillmentMethod?: 'delivery' | 'pickup';
  address: string;
  paymentMethod: string;
  paymentReference?: string;
  paymentIntentId?: string;
  paymentStatus?: 'Pending' | 'Paid' | 'Failed' | 'Expired';
  notes?: string;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number | null;
  deliveryDistanceKm: number;
  shippingWeightGrams?: number;
  shippingZone?: string | null;
  shippingOrigin?: string;
  shippingConfirmationRequired?: boolean;
  shippingConfirmationReasons?: string[];
  total: number;
  status: 'Pending' | 'Confirmed' | 'Shipped' | 'Delivered';
  createdAt: string;
  notificationsSent?: NotificationLog[];
}

interface PartnerInquiry {
  id: string;
  name: string;
  phone: string;
  email?: string;
  location?: string;
  message?: string;
  packageType: string;
  status: 'New' | 'Contacted' | 'Completed';
  createdAt: string;
  notificationsSent?: NotificationLog[];
}

interface NotificationSettings {
  ownerPhone: string;
  ownerName: string;
  ownerEmail?: string;
  webhookUrl: string;
  telegramBotToken: string;
  telegramChatId: string;
  semaphoreApiKey: string;
  semaphoreSenderName: string;
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioFromNumber: string;
  ntfyTopic?: string;
  notifyOwnerOnOrder: boolean;
  notifyCustomerOnOrder: boolean;
  notifyOwnerOnInquiry: boolean;
  soundAlertsEnabled: boolean;
}

interface SiteImagesData {
  hero?: string;
  partner?: string;
  favicon?: string;
  products?: Record<string, string>;
}

interface PaymentSettings {
  bdoEnabled: boolean;
  bdoAccountName: string;
  bdoAccountNumber: string;
  bdoQrUrl?: string;
  bpiEnabled: boolean;
  bpiAccountName: string;
  bpiAccountNumber: string;
  bpiQrUrl?: string;
  gcashEnabled: boolean;
  gcashAccountName: string;
  gcashNumber: string;
  gcashQrUrl?: string;
  instructions?: string;
  gatewayProvider?: 'manual' | 'paymongo' | 'maya' | 'xendit';
  paymongoPublicKey?: string;
}

function calculateQrPhTotal(items: OrderItem[]): number {
  return items.reduce((sum, item) => {
    const price = item.volume === '40ml' ? 380 : item.volume === '50ml' ? 450 : 0;
    const quantity = Number(item.qty);
    if (!price || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100) {
      throw Object.assign(new Error('The bag contains an invalid item or quantity.'), { statusCode: 400 });
    }
    return sum + price * quantity;
  }, 0);
}

interface DatabaseSchema {
  orders: Order[];
  inquiries: PartnerInquiry[];
  notificationSettings?: NotificationSettings;
  siteImages?: SiteImagesData;
  paymentSettings?: PaymentSettings;
}

async function startServer() {
  const app = express();
  
  // CORS support for cross-origin and local API client calls
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Studio-Pin');
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
      return;
    }
    next();
  });

  app.use(express.json({
    limit: '10mb',
    verify: (req, _res, buffer) => {
      (req as Request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
    },
  }));

  app.post('/api/studio/auth', (req: Request, res: Response) => {
    if (!requireStudioAccess(req, res)) return;
    res.json({ success: true });
  });

  app.get('/api/delivery/search', async (req: Request, res: Response) => {
    try {
      const addresses = await searchDeliveryAddresses(String(req.query.q || ''));
      res.json({ success: true, addresses });
    } catch (error) {
      console.error('Delivery address search error:', error);
      const statusCode = typeof error === 'object' && error && 'statusCode' in error
        ? Number(error.statusCode) || 500
        : 500;
      const message = error instanceof Error ? error.message : 'Unable to search addresses right now.';
      res.status(statusCode).json({ success: false, error: message });
    }
  });

  app.post('/api/delivery-quote', async (req: Request, res: Response) => {
    try {
      const quote = await getDeliveryQuote(
        req.body.latitude,
        req.body.longitude,
        req.body.items,
      );
      res.json({ success: true, ...quote });
    } catch (error) {
      console.error('Delivery quote error:', error);
      const statusCode = typeof error === 'object' && error && 'statusCode' in error
        ? Number(error.statusCode) || 500
        : 500;
      const message = error instanceof Error ? error.message : 'Unable to calculate the delivery charge.';
      res.status(statusCode).json({ success: false, error: message });
    }
  });

  const DATA_DIR = path.resolve(process.cwd(), 'data');
  const DB_FILE = path.join(DATA_DIR, 'db.json');

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const defaultSettings: NotificationSettings = {
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

  const defaultPaymentSettings: PaymentSettings = {
    bdoEnabled: false,
    bdoAccountName: '',
    bdoAccountNumber: '',
    bdoQrUrl: '',
    bpiEnabled: false,
    bpiAccountName: '',
    bpiAccountNumber: '',
    bpiQrUrl: '',
    gcashEnabled: false,
    gcashAccountName: '',
    gcashNumber: '',
    gcashQrUrl: '',
    instructions: 'Please transfer the exact amount and save a screenshot of your transfer receipt. You may paste your transaction reference number below or send proof of payment to our concierge.',
    gatewayProvider: 'manual',
    paymongoPublicKey: '',
  };

  function getDB(): DatabaseSchema {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (!parsed.notificationSettings) {
          parsed.notificationSettings = { ...defaultSettings };
        }
        if (!parsed.paymentSettings) {
          parsed.paymentSettings = { ...defaultPaymentSettings };
        }
        return parsed;
      }
    } catch (e) {
      console.error('Failed reading DB file, initializing empty db', e);
    }
    return { orders: [], inquiries: [], notificationSettings: { ...defaultSettings }, paymentSettings: { ...defaultPaymentSettings } };
  }

  function saveDB(data: DatabaseSchema) {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {
      console.error('Failed writing DB file', e);
    }

    app.post('/api/payments/paymongo/webhook', async (req: Request & { rawBody?: Buffer }, res: Response) => {
      if (!req.rawBody || !verifyPaymongoWebhook(req.rawBody, req.header('paymongo-signature'))) {
        res.status(401).json({ success: false, error: 'Invalid webhook signature.' });
        return;
      }

      try {
        const eventAttributes = req.body?.data?.attributes || {};
        const payment = eventAttributes.data || {};
        const paymentAttributes = payment.attributes || {};
        const paymentIntentId = paymentAttributes.payment_intent_id
          || (typeof payment.id === 'string' && payment.id.startsWith('pi_') ? payment.id : '');
        if (!paymentIntentId) {
          res.json({ success: true, ignored: true });
          return;
        }

        const verifiedPayment = await getVerifiedQrPhPayment(paymentIntentId);
        const db = getDB();
        const order = db.orders.find(candidate => candidate.id === verifiedPayment.orderId);
        if (!order || order.paymentIntentId !== verifiedPayment.paymentIntentId) {
          res.json({ success: true, ignored: true });
          return;
        }
        if (
          verifiedPayment.amount !== Math.round(order.total * 100)
          || verifiedPayment.currency !== 'PHP'
        ) {
          console.error(`PayMongo amount or currency mismatch for order ${order.id}.`);
          res.status(400).json({ success: false, error: 'Payment details do not match the order.' });
          return;
        }

        if (verifiedPayment.status === 'succeeded') {
          order.paymentStatus = 'Paid';
          if (order.status === 'Pending') order.status = 'Confirmed';
        } else if (eventAttributes.type === 'qrph.expired') {
          order.paymentStatus = 'Expired';
        } else if (eventAttributes.type === 'payment.failed') {
          order.paymentStatus = 'Failed';
        } else {
          res.json({ success: true, ignored: true });
          return;
        }
        saveDB(db);
        res.json({ success: true });
      } catch (error) {
        console.error('PayMongo webhook error:', error);
        res.status(500).json({ success: false, error: 'Unable to process the payment notification.' });
      }
    });
  }

  // Helper: Dispatch Order Notifications (Telegram, Discord/Webhooks, Semaphore PH SMS, Twilio)
  async function dispatchOrderNotifications(order: Order, db: DatabaseSchema): Promise<NotificationLog[]> {
    const settings = db.notificationSettings || defaultSettings;
    const logs: NotificationLog[] = [];

    const itemsText = order.items.map(it => `• ${it.qty}x ${it.name} (${it.volume || '50ml'}) — ₱${(it.price * it.qty).toFixed(2)}`).join('\n');
    const amountSummary = order.shippingConfirmationRequired
      ? `Items subtotal: ₱${order.subtotal.toFixed(2)}; shipping to be confirmed`
      : `Total amount: ₱${order.total.toFixed(2)}`;
    const isPickup = order.fulfillmentMethod === 'pickup';
    const fulfillmentLabel = isPickup ? 'Pickup location' : 'Delivery address';
    
    // Detailed message for store owner / concierge
    const ownerSummary = `🛍️ *DRIFT & CO. — NEW CUSTOMER ORDER!*\n\n` +
      `*Order ID:* \`${order.id}\`\n` +
      `*Customer:* ${order.customerName}\n` +
      `*Phone:* ${order.phone}\n` +
      `*${fulfillmentLabel}:* ${order.address || 'N/A'}\n` +
      `*Fulfillment:* ${isPickup ? 'Pickup (no delivery fee)' : 'Delivery'}\n` +
      `*Payment:* ${order.paymentMethod}${order.paymentReference ? ` (Ref: \`${order.paymentReference}\`)` : ''}\n` +
      (order.notes ? `*Notes:* ${order.notes}\n` : '') +
      `\n*Items Ordered:*\n${itemsText}\n\n` +
      `*${amountSummary}*\n` +
      (order.shippingConfirmationRequired ? `*Shipping:* ${order.shippingConfirmationReasons?.join(' ')}\n` : '') +
      `*Dispatch office:* ${order.shippingOrigin || 'To be assigned'}\n` +
      `*Status:* ${order.status}\n` +
      `*Time:* ${new Date(order.createdAt).toLocaleString('en-US', { timeZone: 'Asia/Manila' })}`;

    // Concise, friendly SMS/text for customer
    const customerSms = isPickup
      ? `Drift & Co.: Hello ${order.customerName}! Your order #${order.id} for ₱${order.total.toFixed(2)} (${order.paymentMethod}) has been received. We will contact you when it is ready for pickup at our office in Bulilan Norte, Pila, Laguna.`
      : order.shippingConfirmationRequired
      ? `Drift & Co.: Hello ${order.customerName}! Your order #${order.id} has been received. Items subtotal: ₱${order.subtotal.toFixed(2)}; shipping is to be confirmed by our concierge before dispatch. Delivery to: ${order.address}.`
      : `Drift & Co.: Hello ${order.customerName}! Your order #${order.id} for ₱${order.total.toFixed(2)} (${order.paymentMethod}) has been received! Our concierge will contact you shortly regarding delivery to: ${order.address}.`;

    // 1. Telegram Bot (Free, Instant Push Notification with Audio)
    if (settings.telegramBotToken && settings.telegramChatId && settings.notifyOwnerOnOrder) {
      try {
        const res = await fetch(`https://api.telegram.org/bot${settings.telegramBotToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: settings.telegramChatId,
            text: ownerSummary,
            parse_mode: 'Markdown',
          }),
        });
        const data = await res.json() as any;
        if (data.ok) {
          logs.push({ channel: 'Telegram Bot', recipient: `Chat ${settings.telegramChatId}`, status: 'Sent', timestamp: new Date().toISOString() });
        } else {
          logs.push({ channel: 'Telegram Bot', recipient: `Chat ${settings.telegramChatId}`, status: 'Failed', error: data.description || 'API Error', timestamp: new Date().toISOString() });
        }
      } catch (err: any) {
        logs.push({ channel: 'Telegram Bot', recipient: `Chat ${settings.telegramChatId}`, status: 'Failed', error: err.message, timestamp: new Date().toISOString() });
      }
    }

    // 2. Webhook (Discord, Slack, Zapier, Make)
    if (settings.webhookUrl && settings.notifyOwnerOnOrder) {
      try {
        const isDiscord = settings.webhookUrl.includes('discord.com');
        let bodyPayload: any;
        if (isDiscord) {
          bodyPayload = {
            content: `🚨 **New Drift & Co. Perfume Order!**\n**Order #:** \`${order.id}\`\n**Customer:** **${order.customerName}** (📞 \`${order.phone}\`)\n**${amountSummary}** via *${order.paymentMethod}*\n**Fulfillment:** ${isPickup ? 'Pickup (no delivery fee)' : 'Delivery'}\n${order.shippingConfirmationRequired ? `**Shipping:** ${order.shippingConfirmationReasons?.join(' ')}\n` : ''}**${fulfillmentLabel}:** ${order.address}\n**Items Ordered:**\n${order.items.map(it => `> • **${it.qty}x ${it.name}** (${it.volume || '50ml'}) — ₱${(it.price * it.qty).toFixed(2)}`).join('\n')}`
          };
        } else {
          bodyPayload = { event: 'order.created', order, textSummary: ownerSummary, customerSms };
        }

        const res = await fetch(settings.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyPayload),
        });
        if (res.ok) {
          logs.push({ channel: 'Webhook Alert', recipient: 'Configured Webhook', status: 'Sent', timestamp: new Date().toISOString() });
        } else {
          logs.push({ channel: 'Webhook Alert', recipient: 'Configured Webhook', status: 'Failed', error: `HTTP ${res.status}`, timestamp: new Date().toISOString() });
        }
      } catch (err: any) {
        logs.push({ channel: 'Webhook Alert', recipient: 'Configured Webhook', status: 'Failed', error: err.message, timestamp: new Date().toISOString() });
      }
    }

    // 3. Semaphore SMS (Philippines SMS Gateway)
    if (settings.semaphoreApiKey) {
      if (settings.notifyOwnerOnOrder && settings.ownerPhone) {
        try {
          const ownerMsg = `[Drift & Co. New Order] #${order.id} from ${order.customerName} (${order.phone}), ${amountSummary} (${order.paymentMethod}). Address: ${order.address}`;
          const params = new URLSearchParams();
          params.append('apikey', settings.semaphoreApiKey);
          params.append('number', settings.ownerPhone);
          params.append('message', ownerMsg);
          if (settings.semaphoreSenderName) params.append('sendername', settings.semaphoreSenderName);

          const res = await fetch('https://api.semaphore.co/api/v4/messages', { method: 'POST', body: params });
          logs.push({ channel: 'Semaphore SMS (Owner)', recipient: settings.ownerPhone, status: res.ok ? 'Sent' : 'Failed', timestamp: new Date().toISOString() });
        } catch (err: any) {
          logs.push({ channel: 'Semaphore SMS (Owner)', recipient: settings.ownerPhone, status: 'Failed', error: err.message, timestamp: new Date().toISOString() });
        }
      }

      if (settings.notifyCustomerOnOrder && order.phone) {
        try {
          const params = new URLSearchParams();
          params.append('apikey', settings.semaphoreApiKey);
          params.append('number', order.phone);
          params.append('message', customerSms);
          if (settings.semaphoreSenderName) params.append('sendername', settings.semaphoreSenderName);

          const res = await fetch('https://api.semaphore.co/api/v4/messages', { method: 'POST', body: params });
          logs.push({ channel: 'Semaphore SMS (Customer)', recipient: order.phone, status: res.ok ? 'Sent' : 'Failed', timestamp: new Date().toISOString() });
        } catch (err: any) {
          logs.push({ channel: 'Semaphore SMS (Customer)', recipient: order.phone, status: 'Failed', error: err.message, timestamp: new Date().toISOString() });
        }
      }
    }

    // 4. Twilio SMS
    if (settings.twilioAccountSid && settings.twilioAuthToken && settings.twilioFromNumber) {
      const auth = Buffer.from(`${settings.twilioAccountSid}:${settings.twilioAuthToken}`).toString('base64');
      const sendTwilio = async (to: string, msg: string, targetLabel: string) => {
        try {
          const formattedTo = to.startsWith('+') ? to : `+63${to.replace(/^0/, '')}`;
          const params = new URLSearchParams();
          params.append('From', settings.twilioFromNumber);
          params.append('To', formattedTo);
          params.append('Body', msg);

          const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${settings.twilioAccountSid}/Messages.json`, {
            method: 'POST',
            headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params
          });
          logs.push({ channel: `Twilio SMS (${targetLabel})`, recipient: to, status: res.ok ? 'Sent' : 'Failed', timestamp: new Date().toISOString() });
        } catch (err: any) {
          logs.push({ channel: `Twilio SMS (${targetLabel})`, recipient: to, status: 'Failed', error: err.message, timestamp: new Date().toISOString() });
        }
      };

      if (settings.notifyOwnerOnOrder && settings.ownerPhone) {
        await sendTwilio(settings.ownerPhone, `[Drift & Co.] New Order #${order.id} from ${order.customerName}: ${amountSummary}`, 'Owner');
      }
      if (settings.notifyCustomerOnOrder && order.phone) {
        await sendTwilio(order.phone, customerSms, 'Customer');
      }
    }

    // 5. Free Direct Phone Push (ntfy.sh - Zero Setup, Zero Cost, Works on Any Phone)
    if (settings.notifyOwnerOnOrder) {
      const topic = normalizeNtfyTopic(settings.ntfyTopic);
      try {
        const ntfyRes = await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
          method: 'POST',
          headers: {
            'Title': 'New Drift & Co. Order',
            'Priority': 'urgent',
            'Tags': 'shopping_bags,perfume,moneybag',
          },
          body: 'A new order was received. Open the authenticated Studio dashboard to review it.',
        });
        if (ntfyRes.ok) {
          logs.push({ channel: `Instant Phone Alert (ntfy.sh/${topic})`, recipient: `Topic: ${topic}`, status: 'Sent', timestamp: new Date().toISOString() });
        }
      } catch (err: any) {
        logs.push({ channel: 'Instant Phone Alert', recipient: topic, status: 'Failed', error: err.message, timestamp: new Date().toISOString() });
      }
    }

    // Default In-App Hub Record
    logs.push({
      channel: 'Store Notifications & SMS Hub',
      recipient: `${order.customerName} (${order.phone})`,
      status: 'Sent',
      timestamp: new Date().toISOString()
    });

    return logs;
  }

  // Helper: Dispatch Reseller / Partner Inquiry Notifications
  async function dispatchInquiryNotifications(inquiry: PartnerInquiry, db: DatabaseSchema): Promise<NotificationLog[]> {
    const settings = db.notificationSettings || defaultSettings;
    const logs: NotificationLog[] = [];

    const summary = `🤝 *DRIFT & CO. — NEW RESELLER INQUIRY!*\n\n` +
      `*Inquiry ID:* \`${inquiry.id}\`\n` +
      `*Applicant:* ${inquiry.name}\n` +
      `*Phone:* ${inquiry.phone}\n` +
      `*Email:* ${inquiry.email || 'N/A'}\n` +
      `*Location:* ${inquiry.location || 'N/A'}\n` +
      `*Package:* ${inquiry.packageType}\n` +
      (inquiry.message ? `*Message:* ${inquiry.message}\n` : '') +
      `*Date:* ${new Date(inquiry.createdAt).toLocaleString('en-US', { timeZone: 'Asia/Manila' })}`;

    if (settings.notifyOwnerOnInquiry) {
      const topic = (settings.ntfyTopic || 'drift-co-orders-alert').trim();
      try {
        await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
          method: 'POST',
          headers: {
            'Title': 'New Drift & Co. Reseller Inquiry',
            'Priority': 'high',
            'Tags': 'briefcase,handshake',
          },
          body: 'A new reseller inquiry was received. Open the authenticated Studio dashboard to review it.'
        });
        logs.push({ channel: `Instant Phone Alert (ntfy.sh/${topic})`, recipient: `Topic: ${topic}`, status: 'Sent', timestamp: new Date().toISOString() });
      } catch (e: any) {
        // ignore
      }
    }

    if (settings.telegramBotToken && settings.telegramChatId && settings.notifyOwnerOnInquiry) {
      try {
        const res = await fetch(`https://api.telegram.org/bot${settings.telegramBotToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: settings.telegramChatId, text: summary, parse_mode: 'Markdown' }),
        });
        const data = await res.json() as any;
        logs.push({ channel: 'Telegram Bot', recipient: `Chat ${settings.telegramChatId}`, status: data.ok ? 'Sent' : 'Failed', timestamp: new Date().toISOString() });
      } catch (e: any) {
        logs.push({ channel: 'Telegram Bot', recipient: `Chat ${settings.telegramChatId}`, status: 'Failed', error: e.message, timestamp: new Date().toISOString() });
      }
    }

    if (settings.webhookUrl && settings.notifyOwnerOnInquiry) {
      try {
        const isDiscord = settings.webhookUrl.includes('discord.com');
        const payload = isDiscord ? {
          content: `💼 **New Reseller Application!**\n**Applicant:** ${inquiry.name} (📞 \`${inquiry.phone}\`)\n**Location:** ${inquiry.location || 'N/A'}\n**Package:** ${inquiry.packageType}\n${inquiry.message ? `**Notes:** ${inquiry.message}` : ''}`
        } : { event: 'inquiry.created', inquiry, summary };

        const res = await fetch(settings.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        logs.push({ channel: 'Webhook Alert', recipient: 'Store Webhook', status: res.ok ? 'Sent' : 'Failed', timestamp: new Date().toISOString() });
      } catch (e: any) {
        logs.push({ channel: 'Webhook Alert', recipient: 'Store Webhook', status: 'Failed', error: e.message, timestamp: new Date().toISOString() });
      }
    }

    logs.push({
      channel: 'App & Reseller Hub',
      recipient: `${inquiry.name} (${inquiry.phone})`,
      status: 'Sent',
      timestamp: new Date().toISOString()
    });

    return logs;
  }

  // --- REST API ENDPOINTS ---

  // Health check
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'Drift & Co. Perfume API',
      timestamp: new Date().toISOString(),
    });
  });

  // Get Store Statistics
  app.get('/api/stats', (_req: Request, res: Response) => {
    const db = getDB();
    const totalOrders = db.orders.length;
    const totalRevenue = db.orders.reduce((sum, order) => (
      order.shippingConfirmationRequired
        || order.paymentMethod === 'QR Ph' && order.paymentStatus !== 'Paid'
        ? sum
        : sum + (order.total || 0)
    ), 0);
    const totalInquiries = db.inquiries.length;
    res.json({
      success: true,
      stats: {
        totalOrders,
        totalRevenue,
        totalInquiries,
      },
    });
  });

  // Orders: List all
  app.get('/api/orders', (req: Request, res: Response) => {
    if (!requireStudioAccess(req, res)) return;
    const db = getDB();
    res.json({ success: true, orders: db.orders });
  });

  // Orders: Create new order
  app.post('/api/orders', async (req: Request, res: Response) => {
    try {
      const {
        customerName,
        phone,
        addressDetails,
        deliveryQuoteToken,
        fulfillmentMethod: requestedFulfillmentMethod,
        paymentMethod,
        paymentReference,
        notes,
        items,
      } = req.body;

      if (!items || !Array.isArray(items) || items.length === 0) {
        res.status(400).json({ success: false, error: 'Bag is empty or invalid items provided.' });
        return;
      }

      if (!customerName || !phone) {
        res.status(400).json({ success: false, error: 'Customer name and phone number are required.' });
        return;
      }
      const fulfillmentMethod = requestedFulfillmentMethod || 'delivery';
      if (fulfillmentMethod !== 'delivery' && fulfillmentMethod !== 'pickup') {
        res.status(400).json({ success: false, error: 'Choose delivery or pickup.' });
        return;
      }

      const orderId = `DRFT-${randomUUID().toUpperCase()}`;
      const isQrPhPayment = paymentMethod === 'QR Ph';
      const subtotal = isQrPhPayment ? calculateQrPhTotal(items) : calculateOrderSubtotal(items);
      const delivery = fulfillmentMethod === 'pickup'
        ? getPickupDetails(items)
        : verifyDeliveryQuote(deliveryQuoteToken, items);
      if (isQrPhPayment && delivery.shippingConfirmationRequired) {
        throw Object.assign(new Error('QR Ph is unavailable until shipping charges are confirmed. Please choose Cash on Delivery or contact the store.'), { statusCode: 400 });
      }
      const cleanAddressDetails = fulfillmentMethod === 'delivery'
        ? String(addressDetails || '').trim().slice(0, 200)
        : '';
      const calculatedTotal = subtotal + (delivery.deliveryFee || 0);

      const newOrder: Order = {
        id: orderId,
        customerName: String(customerName).trim(),
        phone: String(phone).trim(),
        fulfillmentMethod,
        address: [delivery.address, cleanAddressDetails].filter(Boolean).join(', '),
        paymentMethod: String(paymentMethod || 'Cash on Delivery (COD)').trim(),
        paymentReference: paymentReference ? String(paymentReference).trim() : undefined,
        notes: notes ? String(notes).trim() : undefined,
        items,
        subtotal,
        deliveryFee: delivery.deliveryFee,
        deliveryDistanceKm: delivery.distanceKm,
        shippingWeightGrams: delivery.shippingWeightGrams,
        shippingZone: delivery.zone,
        shippingOrigin: delivery.origin,
        shippingConfirmationRequired: delivery.shippingConfirmationRequired,
        shippingConfirmationReasons: delivery.shippingConfirmationReasons,
        total: calculatedTotal,
        status: 'Pending',
        ...(isQrPhPayment ? { paymentStatus: 'Pending' as const } : {}),
        createdAt: new Date().toISOString(),
        notificationsSent: [],
      };

      const db = getDB();
      const payment = isQrPhPayment ? await createQrPhPayment(calculatedTotal, orderId) : null;
      if (payment) newOrder.paymentIntentId = payment.paymentIntentId;
      db.orders.unshift(newOrder);
      saveDB(db);

      res.status(201).json({
        success: true,
        message: 'Order placed successfully! Notifications dispatched.',
        order: newOrder,
        ...(payment ? { payment: { qrCodeDataUrl: payment.qrCodeDataUrl } } : {}),
      });

      dispatchOrderNotifications(newOrder, db).then(logs => {
        newOrder.notificationsSent = logs;
        saveDB(db);
      }).catch(notifErr => {
        console.error('Background notification dispatch error:', notifErr);
      });
    } catch (error) {
      console.error('Order creation error:', error);
      const statusCode = typeof error === 'object' && error && 'statusCode' in error
        ? Number(error.statusCode) || 500
        : 500;
      const message = error instanceof Error ? error.message : 'Unable to create order.';
      res.status(statusCode).json({ success: false, error: message });
    }
  });

  // Orders: Track order by full reference ID
  app.get('/api/orders/track/:query', (req: Request, res: Response) => {
    const rawQuery = String(req.params.query || '').trim();
    if (!rawQuery) {
      res.status(400).json({ success: false, error: 'Please provide the full Order Reference ID.' });
      return;
    }

    const cleanQuery = rawQuery.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const db = getDB();
    const order = db.orders.find(o => {
      const oIdClean = o.id.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      return oIdClean === cleanQuery;
    });

    if (!order) {
      res.status(404).json({
        success: false,
        error: 'No order found with that full reference ID.',
      });
      return;
    }

    // Build timeline stages
    const createdDate = new Date(order.createdAt || Date.now());
    const formatDate = (d: Date) => d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    // Step dates based on creation
    const step2Date = new Date(createdDate.getTime() + 1000 * 60 * 60 * 4); // +4h
    const step3Date = new Date(createdDate.getTime() + 1000 * 60 * 60 * 20); // +20h
    const step4Date = new Date(createdDate.getTime() + 1000 * 60 * 60 * 48); // +48h

    // Estimated delivery window: 2 to 4 days from order
    const estDeliveryMin = new Date(createdDate.getTime() + 1000 * 60 * 60 * 24 * 2);
    const estDeliveryMax = new Date(createdDate.getTime() + 1000 * 60 * 60 * 24 * 4);
    const estDeliveryStr = `${estDeliveryMin.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} – ${estDeliveryMax.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    const isPickup = order.fulfillmentMethod === 'pickup';
    const arrivalEstimate = isPickup ? 'We will contact you when your order is ready for pickup.' : estDeliveryStr;

    const statusOrderMap: Record<Order['status'], number> = {
      Pending: 1,
      Confirmed: 2,
      Shipped: 3,
      Delivered: 4,
    };
    const currentStep = statusOrderMap[order.status] || 1;

    const timeline = [
      {
        step: 1,
        title: 'Order Placed & Logged',
        description: 'Order registered in our bespoke compounding queue. Notification sent to concierge.',
        status: currentStep >= 1 ? 'completed' : 'upcoming',
        timestamp: formatDate(createdDate),
        location: 'Drift & Co. Atelier Hub, Metro Manila',
      },
      {
        step: 2,
        title: 'Hand-Compounded & Quality Checked',
        description: 'Formulated with 30% oil concentration from USA & Germany. Bottle sealed with crimped gold atomizer.',
        status: currentStep > 2 ? 'completed' : currentStep === 2 ? 'in_progress' : currentStep === 1 ? 'in_progress' : 'upcoming',
        timestamp: currentStep >= 2 ? formatDate(step2Date) : 'In progress',
        location: 'Drift & Co. Perfumery Lab',
      },
      {
        step: 3,
        title: isPickup ? 'Ready for Pickup' : 'Dispatched & Handed to Courier',
        description: isPickup
          ? 'We will contact you when your order is ready for collection at the office.'
          : 'Protected with luxury shock-absorbent cushioning and handed over to courier dispatch.',
        status: currentStep >= 3 ? 'completed' : currentStep === 2 ? 'in_progress' : 'upcoming',
        timestamp: currentStep >= 3 ? formatDate(step3Date) : 'Awaiting courier handover',
        location: isPickup ? order.shippingOrigin : 'J&T Express / Drift Priority Courier Hub',
      },
      {
        step: 4,
        title: isPickup ? 'Picked Up / Completed' : 'Out for Delivery / Delivered',
        description: currentStep === 4
          ? (isPickup ? 'Order successfully collected by customer.' : 'Package successfully received by customer.')
          : (isPickup ? 'Collect your order from the Drift & Co. Office.' : 'Courier will notify via SMS or call prior to arrival.'),
        status: currentStep === 4 ? 'completed' : currentStep === 3 ? 'in_progress' : 'upcoming',
        timestamp: currentStep === 4 ? formatDate(step4Date) : arrivalEstimate,
        location: isPickup ? order.shippingOrigin : 'Delivery destination',
      },
    ];

    const digitsOnly = order.id.replace(/\D/g, '') || '882194';
    const trackingNumber = isPickup ? `PICKUP-${digitsOnly}` : `PH-JT-${digitsOnly}EXP`;
    const trackingOrder = {
      id: order.id,
      status: order.status,
      fulfillmentMethod: isPickup ? 'pickup' : 'delivery',
      createdAt: order.createdAt,
      total: order.total,
      shippingConfirmationRequired: Boolean(order.shippingConfirmationRequired),
      shippingConfirmationReasons: order.shippingConfirmationReasons || [],
      deliveryFee: order.deliveryFee,
      shippingZone: order.shippingZone,
      shippingOrigin: order.shippingOrigin,
      ...(order.paymentStatus ? { paymentStatus: order.paymentStatus } : {}),
    };

    res.json({
      success: true,
      order: trackingOrder,
      tracking: {
        trackingNumber,
        courier: isPickup ? 'Drift & Co. Office Pickup' : 'J&T Express PH / Drift Priority Courier',
        estimatedDelivery: arrivalEstimate,
        currentStep,
        statusLabel: order.status,
        timeline,
      },
    });
  });

  // Orders: Update order status
  app.patch('/api/orders/:id/status', (req: Request, res: Response) => {
    if (!requireStudioAccess(req, res)) return;
    const { id } = req.params;
    const { status } = req.body;
    const validStatuses = ['Pending', 'Confirmed', 'Shipped', 'Delivered'];

    if (!validStatuses.includes(status)) {
      res.status(400).json({ success: false, error: 'Invalid status.' });
      return;
    }

    const db = getDB();
    const order = db.orders.find(o => o.id === id);
    if (!order) {
      res.status(404).json({ success: false, error: 'Order not found.' });
      return;
    }
    if (order.paymentMethod === 'QR Ph' && order.paymentStatus !== 'Paid' && status !== 'Pending') {
      res.status(409).json({ success: false, error: 'QR Ph orders can only be fulfilled after payment is verified.' });
      return;
    }

    order.status = status as Order['status'];
    saveDB(db);

    res.json({ success: true, order });
  });

  // Orders: Manual Re-send / Send Custom SMS Alert
  app.post('/api/orders/:id/notify', async (req: Request, res: Response) => {
    if (!requireStudioAccess(req, res)) return;
    const { id } = req.params;
    const { customMessage } = req.body;
    const db = getDB();
    const order = db.orders.find(o => o.id === id);
    if (!order) {
      res.status(404).json({ success: false, error: 'Order not found.' });
      return;
    }

    try {
      const logs = await dispatchOrderNotifications(order, db);
      if (!order.notificationsSent) order.notificationsSent = [];
      order.notificationsSent.push(...logs);
      saveDB(db);
      res.json({ success: true, message: 'Notification dispatched!', logs });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Business Partner Inquiries: List
  app.get('/api/partner-inquiries', (req: Request, res: Response) => {
    if (!requireStudioAccess(req, res)) return;
    const db = getDB();
    res.json({ success: true, inquiries: db.inquiries });
  });

  // Business Partner Inquiries: Submit
  app.post('/api/partner-inquiries', async (req: Request, res: Response) => {
    const { name, phone, email, location, message, packageType } = req.body;

    if (!name || !phone) {
      res.status(400).json({ success: false, error: 'Name and phone number are required.' });
      return;
    }

    const inquiryId = 'PTR-' + Math.floor(10000 + Math.random() * 90000);
    const newInquiry: PartnerInquiry = {
      id: inquiryId,
      name: String(name).trim(),
      phone: String(phone).trim(),
      email: email ? String(email).trim() : undefined,
      location: location ? String(location).trim() : undefined,
      message: message ? String(message).trim() : undefined,
      packageType: packageType || 'Starter Package ₱988',
      status: 'New',
      createdAt: new Date().toISOString(),
      notificationsSent: [],
    };

    const db = getDB();

    try {
      const logs = await dispatchInquiryNotifications(newInquiry, db);
      newInquiry.notificationsSent = logs;
    } catch (err) {
      console.error('Inquiry notification error:', err);
    }

    db.inquiries.unshift(newInquiry);
    saveDB(db);

    res.status(201).json({
      success: true,
      message: 'Business partner inquiry submitted successfully!',
      inquiry: newInquiry,
    });
  });

  // Notification Settings: Get
  app.get('/api/notifications/settings', (req: Request, res: Response) => {
    if (!requireStudioAccess(req, res)) return;
    const db = getDB();
    const settings = { ...(db.notificationSettings || defaultSettings) };
    
    // Mask sensitive tokens for safe display in UI
    const masked = {
      ...settings,
      telegramBotTokenMasked: settings.telegramBotToken ? '••••••••' + settings.telegramBotToken.slice(-4) : '',
      semaphoreApiKeyMasked: settings.semaphoreApiKey ? '••••••••' + settings.semaphoreApiKey.slice(-4) : '',
      twilioAuthTokenMasked: settings.twilioAuthToken ? '••••••••' + settings.twilioAuthToken.slice(-4) : '',
    };
    res.json({ success: true, settings: masked });
  });

  // Notification Settings: Save
  app.post('/api/notifications/settings', (req: Request, res: Response) => {
    if (!requireStudioAccess(req, res)) return;
    const db = getDB();
    const current = db.notificationSettings || defaultSettings;
    const body = req.body || {};

    // Keep existing secret if user didn't enter a new one (or sent placeholder)
    const updated: NotificationSettings = {
      ownerPhone: body.ownerPhone !== undefined ? String(body.ownerPhone).trim() : current.ownerPhone,
      ownerName: body.ownerName !== undefined ? String(body.ownerName).trim() : current.ownerName,
      ownerEmail: body.ownerEmail !== undefined ? String(body.ownerEmail).trim() : current.ownerEmail,
      webhookUrl: body.webhookUrl !== undefined ? String(body.webhookUrl).trim() : current.webhookUrl,
      telegramBotToken: body.telegramBotToken && !body.telegramBotToken.includes('••••') ? String(body.telegramBotToken).trim() : current.telegramBotToken,
      telegramChatId: body.telegramChatId !== undefined ? String(body.telegramChatId).trim() : current.telegramChatId,
      semaphoreApiKey: body.semaphoreApiKey && !body.semaphoreApiKey.includes('••••') ? String(body.semaphoreApiKey).trim() : current.semaphoreApiKey,
      semaphoreSenderName: body.semaphoreSenderName !== undefined ? String(body.semaphoreSenderName).trim() : current.semaphoreSenderName,
      twilioAccountSid: body.twilioAccountSid !== undefined ? String(body.twilioAccountSid).trim() : current.twilioAccountSid,
      twilioAuthToken: body.twilioAuthToken && !body.twilioAuthToken.includes('••••') ? String(body.twilioAuthToken).trim() : current.twilioAuthToken,
      twilioFromNumber: body.twilioFromNumber !== undefined ? String(body.twilioFromNumber).trim() : current.twilioFromNumber,
      ntfyTopic: normalizeNtfyTopic(body.ntfyTopic !== undefined ? body.ntfyTopic : current.ntfyTopic),
      notifyOwnerOnOrder: body.notifyOwnerOnOrder !== undefined ? Boolean(body.notifyOwnerOnOrder) : current.notifyOwnerOnOrder,
      notifyCustomerOnOrder: body.notifyCustomerOnOrder !== undefined ? Boolean(body.notifyCustomerOnOrder) : current.notifyCustomerOnOrder,
      notifyOwnerOnInquiry: body.notifyOwnerOnInquiry !== undefined ? Boolean(body.notifyOwnerOnInquiry) : current.notifyOwnerOnInquiry,
      soundAlertsEnabled: body.soundAlertsEnabled !== undefined ? Boolean(body.soundAlertsEnabled) : current.soundAlertsEnabled,
    };

    db.notificationSettings = updated;
    saveDB(db);

    res.json({ success: true, message: 'Notification settings updated successfully!', settings: updated });
  });

  // Notification: Send Test Alert
  app.post('/api/notifications/test', async (req: Request, res: Response) => {
    if (!requireStudioAccess(req, res)) return;
    const db = getDB();
    const dummyOrder: Order = {
      id: 'TEST-' + Math.floor(1000 + Math.random() * 9000),
      customerName: 'Test Customer (Verification Alert)',
      phone: db.notificationSettings?.ownerPhone || '09171234567',
      address: 'Drift & Co. Headquarters, BGC Taguig',
      paymentMethod: 'Cash on Delivery (COD)',
      notes: 'This is a test notification to verify your SMS & Webhook alert configuration.',
      items: [
        {
          name: 'Baccarat Rouge (Tester Verification)',
          price: 450,
          image: '',
          volume: '50ml',
          qty: 1,
        }
      ],
      subtotal: 450,
      deliveryFee: 0,
      deliveryDistanceKm: 0,
      total: 450,
      status: 'Pending',
      createdAt: new Date().toISOString(),
    };

    try {
      const logs = await dispatchOrderNotifications(dummyOrder, db);
      res.json({ success: true, message: 'Test notification fired!', logs });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // --- SITE CUSTOM IMAGES PERSISTENCE (Survives refreshes, cache clears, and cross-device) ---
  app.get('/api/site-images', (_req: Request, res: Response) => {
    const db = getDB();
    res.json({
      success: true,
      siteImages: db.siteImages || { hero: null, partner: null, products: {} },
    });
  });

  app.post('/api/site-images', (req: Request, res: Response) => {
    if (!requireStudioAccess(req, res)) return;
    const db = getDB();
    if (!db.siteImages) {
      db.siteImages = { products: {} };
    }
    if (!db.siteImages.products) {
      db.siteImages.products = {};
    }

    const { target, image, siteImages, hero, partner, products } = req.body || {};

    if (siteImages && typeof siteImages === 'object') {
      if (siteImages.hero !== undefined) db.siteImages.hero = siteImages.hero;
      if (siteImages.partner !== undefined) db.siteImages.partner = siteImages.partner;
      if (siteImages.products && typeof siteImages.products === 'object') {
        db.siteImages.products = { ...db.siteImages.products, ...siteImages.products };
      }
    } else if (target !== undefined && image !== undefined) {
      if (target === 'hero') {
        db.siteImages.hero = String(image);
      } else if (target === 'partner') {
        db.siteImages.partner = String(image);
      } else if (target === 'favicon') {
        db.siteImages.favicon = String(image);
        if (typeof image === 'string' && image.startsWith('data:image/')) {
          try {
            const matches = image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (matches && matches[2]) {
              const buffer = Buffer.from(matches[2], 'base64');
              fs.writeFileSync(path.resolve(process.cwd(), 'public', 'download.jpg'), buffer);
            }
          } catch (e) {
            console.error('Error writing download.jpg:', e);
          }
        }
      } else {
        const prodId = String(target);
        db.siteImages.products[prodId] = String(image);
      }
    } else {
      if (hero !== undefined) db.siteImages.hero = hero;
      if (partner !== undefined) db.siteImages.partner = partner;
      if (products && typeof products === 'object') {
        db.siteImages.products = { ...db.siteImages.products, ...products };
      }
    }

    saveDB(db);
    res.json({
      success: true,
      message: 'Images saved permanently in database!',
      siteImages: db.siteImages,
    });
  });

  app.post('/api/site-images/reset', (req: Request, res: Response) => {
    if (!requireStudioAccess(req, res)) return;
    const db = getDB();
    const { target } = req.body || {};
    if (!db.siteImages) {
      db.siteImages = { products: {} };
    }

    if (!target || target === 'all') {
      db.siteImages = { hero: undefined, partner: undefined, products: {} };
    } else if (target === 'hero') {
      delete db.siteImages.hero;
    } else if (target === 'partner') {
      delete db.siteImages.partner;
    } else if (target === 'favicon') {
      delete db.siteImages.favicon;
      try {
        const dlPath = path.resolve(process.cwd(), 'public', 'download.jpg');
        if (fs.existsSync(dlPath)) fs.unlinkSync(dlPath);
      } catch (e) {}
    } else {
      const prodId = String(target);
      if (db.siteImages.products) {
        delete db.siteImages.products[prodId];
      }
    }

    saveDB(db);
    res.json({
      success: true,
      message: 'Image reset successfully',
      siteImages: db.siteImages,
    });
  });

  // --- BANK & PAYMENT SETTINGS (BDO, BPI, GCash, and Gateways) ---
  app.get('/api/payments/settings', (_req: Request, res: Response) => {
    const db = getDB();
    res.json({
      success: true,
      settings: { ...(db.paymentSettings || defaultPaymentSettings), qrphEnabled: paymongoQrPhReady() },
    });
  });

  app.post('/api/payments/settings', (req: Request, res: Response) => {
    if (!requireStudioAccess(req, res)) return;
    const db = getDB();
    const current = db.paymentSettings || defaultPaymentSettings;
    const body = req.body || {};

    const updated: PaymentSettings = {
      bdoEnabled: body.bdoEnabled !== undefined ? Boolean(body.bdoEnabled) : current.bdoEnabled,
      bdoAccountName: body.bdoAccountName !== undefined ? String(body.bdoAccountName).trim() : current.bdoAccountName,
      bdoAccountNumber: body.bdoAccountNumber !== undefined ? String(body.bdoAccountNumber).trim() : current.bdoAccountNumber,
      bdoQrUrl: body.bdoQrUrl !== undefined ? String(body.bdoQrUrl).trim() : (current.bdoQrUrl || ''),

      bpiEnabled: body.bpiEnabled !== undefined ? Boolean(body.bpiEnabled) : current.bpiEnabled,
      bpiAccountName: body.bpiAccountName !== undefined ? String(body.bpiAccountName).trim() : current.bpiAccountName,
      bpiAccountNumber: body.bpiAccountNumber !== undefined ? String(body.bpiAccountNumber).trim() : current.bpiAccountNumber,
      bpiQrUrl: body.bpiQrUrl !== undefined ? String(body.bpiQrUrl).trim() : (current.bpiQrUrl || ''),

      gcashEnabled: body.gcashEnabled !== undefined ? Boolean(body.gcashEnabled) : current.gcashEnabled,
      gcashAccountName: body.gcashAccountName !== undefined ? String(body.gcashAccountName).trim() : current.gcashAccountName,
      gcashNumber: body.gcashNumber !== undefined ? String(body.gcashNumber).trim() : current.gcashNumber,
      gcashQrUrl: body.gcashQrUrl !== undefined ? String(body.gcashQrUrl).trim() : (current.gcashQrUrl || ''),

      instructions: body.instructions !== undefined ? String(body.instructions).trim() : current.instructions,
      gatewayProvider: body.gatewayProvider || current.gatewayProvider || 'manual',
      paymongoPublicKey: body.paymongoPublicKey !== undefined ? String(body.paymongoPublicKey).trim() : (current.paymongoPublicKey || ''),
    };

    const missingDestination = updated.bdoEnabled && (!updated.bdoAccountName || !updated.bdoAccountNumber)
      ? 'BDO'
      : updated.bpiEnabled && (!updated.bpiAccountName || !updated.bpiAccountNumber)
        ? 'BPI'
        : updated.gcashEnabled && (!updated.gcashAccountName || !updated.gcashNumber)
          ? 'GCash'
          : '';
    if (missingDestination) {
      return res.status(400).json({
        success: false,
        error: `Set the account name and destination for ${missingDestination} before enabling it.`,
      });
    }

    db.paymentSettings = updated;
    saveDB(db);

    res.json({
      success: true,
      message: 'Bank and payment accounts updated successfully!',
      settings: updated,
    });
  });

  // --- SEAMLESS PERFUME ASSET FALLBACK ---
  // If an older link or client requests /<Perfume>.jfif directly at root, serve from /perfumes/<Perfume>.jfif
  app.get('/:name.jfif', (req: Request, res: Response, next: NextFunction) => {
    const filename = `${req.params.name}.jfif`;
    const perfumePath = path.resolve(process.cwd(), 'public', 'perfumes', filename);
    if (fs.existsSync(perfumePath)) {
      return res.sendFile(perfumePath);
    }
    next();
  });

  // Serve public assets directly (favicons, images, js scripts)
  app.use(express.static(path.resolve(process.cwd(), 'public'), {
    setHeaders: (res, filePath) => {
      if (path.extname(filePath).toLowerCase() === '.jfif') {
        res.setHeader('Content-Type', 'image/jpeg');
      }
    },
  }));

  // --- VITE MIDDLEWARE / STATIC FILES ---
  if (!isProduction) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        host: '0.0.0.0',
        port: PORT,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(process.cwd(), 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(process.cwd(), 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Drift & Co. Server listening at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal error starting server:', err);
  process.exit(1);
});
