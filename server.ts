import express, { Request, Response, NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

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
  address: string;
  paymentMethod: string;
  paymentReference?: string;
  notes?: string;
  items: OrderItem[];
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
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
      return;
    }
    next();
  });

  app.use(express.json({ limit: '10mb' }));

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
    bdoAccountName: 'Drift & Co. Fragrances',
    bdoAccountNumber: '0068-1234-5678',
    bdoQrUrl: '',
    bpiEnabled: false,
    bpiAccountName: 'Drift & Co. Fragrances',
    bpiAccountNumber: '0019-2834-51',
    bpiQrUrl: '',
    gcashEnabled: false,
    gcashAccountName: 'Drift & Co. Store',
    gcashNumber: '0917-123-4567',
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
  }

  // Helper: Dispatch Order Notifications (Telegram, Discord/Webhooks, Semaphore PH SMS, Twilio)
  async function dispatchOrderNotifications(order: Order, db: DatabaseSchema): Promise<NotificationLog[]> {
    const settings = db.notificationSettings || defaultSettings;
    const logs: NotificationLog[] = [];

    const itemsText = order.items.map(it => `• ${it.qty}x ${it.name} (${it.volume || '50ml'}) — ₱${(it.price * it.qty).toFixed(2)}`).join('\n');
    
    // Detailed message for store owner / concierge
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

    // Concise, friendly SMS/text for customer
    const customerSms = `Drift & Co.: Hello ${order.customerName}! Your order #${order.id} for ₱${order.total.toFixed(2)} (${order.paymentMethod}) has been received! Our concierge will contact you shortly regarding delivery to: ${order.address}.`;

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
            content: `🚨 **New Drift & Co. Perfume Order!**\n**Order #:** \`${order.id}\`\n**Customer:** **${order.customerName}** (📞 \`${order.phone}\`)\n**Total:** **₱${order.total.toFixed(2)}** via *${order.paymentMethod}*\n**Address:** ${order.address}\n**Items Ordered:**\n${order.items.map(it => `> • **${it.qty}x ${it.name}** (${it.volume || '50ml'}) — ₱${(it.price * it.qty).toFixed(2)}`).join('\n')}`
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
          const ownerMsg = `[Drift & Co. New Order] #${order.id} from ${order.customerName} (${order.phone}), Total: P${order.total.toFixed(2)} (${order.paymentMethod}). Address: ${order.address}`;
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
        await sendTwilio(settings.ownerPhone, `[Drift & Co.] New Order #${order.id} from ${order.customerName}: P${order.total.toFixed(2)}`, 'Owner');
      }
      if (settings.notifyCustomerOnOrder && order.phone) {
        await sendTwilio(order.phone, customerSms, 'Customer');
      }
    }

    // 5. Free Direct Phone Push (ntfy.sh - Zero Setup, Zero Cost, Works on Any Phone)
    if (settings.notifyOwnerOnOrder) {
      const topic = (settings.ntfyTopic || 'drift-co-orders-alert').trim();
      try {
        const ntfyRes = await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
          method: 'POST',
          headers: {
            'Title': `New Drift & Co. Order: ${order.customerName} (PHP ${order.total.toFixed(2)})`,
            'Priority': 'urgent',
            'Tags': 'shopping_bags,perfume,moneybag',
          },
          body: `Order Reference: ${order.id}\nCustomer: ${order.customerName} (Phone: ${order.phone})\nTotal: ₱${order.total.toFixed(2)} (${order.paymentMethod})\nDelivery Address: ${order.address || 'N/A'}\n\nBottles:\n${itemsText}\n\nNotes: ${order.notes || 'None'}`
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
            'Title': `New Drift & Co. Reseller Inquiry: ${inquiry.name}`,
            'Priority': 'high',
            'Tags': 'briefcase,handshake',
          },
          body: `Applicant: ${inquiry.name} (Phone: ${inquiry.phone})\nEmail: ${inquiry.email || 'N/A'}\nLocation: ${inquiry.location || 'N/A'}\nPackage: ${inquiry.packageType}\nMessage: ${inquiry.message || 'None'}`
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
    const totalRevenue = db.orders.reduce((sum, o) => sum + (o.total || 0), 0);
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
  app.get('/api/orders', (_req: Request, res: Response) => {
    const db = getDB();
    res.json({ success: true, orders: db.orders });
  });

  // Orders: Create new order
  app.post('/api/orders', async (req: Request, res: Response) => {
    const { customerName, phone, address, paymentMethod, paymentReference, notes, items, total } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ success: false, error: 'Bag is empty or invalid items provided.' });
      return;
    }

    if (!customerName || !phone) {
      res.status(400).json({ success: false, error: 'Customer name and phone number are required.' });
      return;
    }

    const orderId = 'DRFT-' + Math.floor(100000 + Math.random() * 900000);
    const calculatedTotal = Number(total) || items.reduce((acc: number, item: OrderItem) => acc + (item.price * item.qty), 0);

    const newOrder: Order = {
      id: orderId,
      customerName: String(customerName).trim(),
      phone: String(phone).trim(),
      address: String(address || '').trim(),
      paymentMethod: String(paymentMethod || 'Cash on Delivery (COD)').trim(),
      paymentReference: paymentReference ? String(paymentReference).trim() : undefined,
      notes: notes ? String(notes).trim() : undefined,
      items,
      total: calculatedTotal,
      status: 'Pending',
      createdAt: new Date().toISOString(),
      notificationsSent: [],
    };

    const db = getDB();
    db.orders.unshift(newOrder);
    saveDB(db);

    // Return instant success response to client immediately (no timeout/network lag)
    res.status(201).json({
      success: true,
      message: 'Order placed successfully! Notifications dispatched.',
      order: newOrder,
    });

    // Asynchronously dispatch external notifications in background
    dispatchOrderNotifications(newOrder, db).then(logs => {
      newOrder.notificationsSent = logs;
      saveDB(db);
    }).catch(notifErr => {
      console.error('Background notification dispatch error:', notifErr);
    });
  });

  // Orders: Track order by ID or phone number
  app.get('/api/orders/track/:query', (req: Request, res: Response) => {
    const rawQuery = String(req.params.query || '').trim();
    if (!rawQuery) {
      res.status(400).json({ success: false, error: 'Please provide an Order Reference ID or Phone Number.' });
      return;
    }

    const cleanQuery = rawQuery.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const db = getDB();

    // Match order ID (e.g. "DRFT-444818", "444818", "drft444818") or phone number
    const order = db.orders.find(o => {
      const oIdClean = o.id.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      const oPhoneClean = (o.phone || '').replace(/[^0-9]/g, '');
      const queryDigits = cleanQuery.replace(/\D/g, '');

      if (oIdClean === cleanQuery || oIdClean.endsWith(cleanQuery) || cleanQuery.endsWith(oIdClean)) return true;
      if (queryDigits.length >= 7 && (oPhoneClean.endsWith(queryDigits) || queryDigits.endsWith(oPhoneClean))) return true;
      return false;
    });

    if (!order) {
      res.status(404).json({
        success: false,
        error: `No order found matching "${rawQuery}". Please check your Order ID from your confirmation receipt or SMS.`,
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
        title: 'Dispatched & Handed to Courier',
        description: 'Protected with luxury shock-absorbent cushioning and handed over to courier dispatch.',
        status: currentStep >= 3 ? 'completed' : currentStep === 2 ? 'in_progress' : 'upcoming',
        timestamp: currentStep >= 3 ? formatDate(step3Date) : 'Awaiting courier handover',
        location: 'J&T Express / Drift Priority Courier Hub',
      },
      {
        step: 4,
        title: 'Out for Delivery / Delivered',
        description: currentStep === 4 ? 'Package successfully received by customer.' : 'Courier will notify via SMS or call prior to arrival.',
        status: currentStep === 4 ? 'completed' : currentStep === 3 ? 'in_progress' : 'upcoming',
        timestamp: currentStep === 4 ? formatDate(step4Date) : estDeliveryStr,
        location: order.address || 'Customer Delivery Address',
      },
    ];

    const digitsOnly = order.id.replace(/\D/g, '') || '882194';
    const trackingNumber = `PH-JT-${digitsOnly}EXP`;

    res.json({
      success: true,
      order,
      tracking: {
        trackingNumber,
        courier: 'J&T Express PH / Drift Priority Courier',
        estimatedDelivery: estDeliveryStr,
        currentStep,
        statusLabel: order.status,
        timeline,
      },
    });
  });

  // Orders: Update order status
  app.patch('/api/orders/:id/status', (req: Request, res: Response) => {
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

    order.status = status as Order['status'];
    saveDB(db);

    res.json({ success: true, order });
  });

  // Orders: Manual Re-send / Send Custom SMS Alert
  app.post('/api/orders/:id/notify', async (req: Request, res: Response) => {
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
  app.get('/api/partner-inquiries', (_req: Request, res: Response) => {
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
  app.get('/api/notifications/settings', (_req: Request, res: Response) => {
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
      ntfyTopic: body.ntfyTopic !== undefined ? String(body.ntfyTopic).trim() : (current.ntfyTopic || 'drift-co-orders-alert'),
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
      settings: db.paymentSettings || defaultPaymentSettings,
    });
  });

  app.post('/api/payments/settings', (req: Request, res: Response) => {
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
