import { defaultSettings, dispatchOrderNotifications } from '../lib/notifications.js';
import { getHash, redisCommand, saveRecord } from '../lib/redis.js';
import { requireStudioAccess } from '../lib/studio-auth.js';

const ORDERS_KEY = 'drift:orders';

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization, X-Studio-Pin');
}

function respondWithError(res, error) {
  console.error('Orders API error:', error);
  return res.status(error.statusCode || 500).json({
    success: false,
    error: error.message || 'Unable to access orders.',
  });
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      if (!requireStudioAccess(req, res)) return;
      const orders = Object.values(await getHash(ORDERS_KEY))
        .sort((first, second) => new Date(second.createdAt) - new Date(first.createdAt));
      return res.status(200).json({ success: true, orders });
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST, OPTIONS');
      return res.status(405).json({ success: false, error: 'Method not allowed.' });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { customerName, phone, address, paymentMethod, paymentReference, notes, items, total } = body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Bag is empty or invalid items provided.' });
    }
    if (!customerName || !phone) {
      return res.status(400).json({ success: false, error: 'Customer name and phone number are required.' });
    }

    const savedSettings = await redisCommand('GET', 'drift:notification-settings');
    const settings = savedSettings ? { ...defaultSettings, ...JSON.parse(savedSettings) } : { ...defaultSettings };
    const order = {
      id: `DRFT-${Math.floor(100000 + Math.random() * 900000)}`,
      customerName: String(customerName).trim(),
      phone: String(phone).trim(),
      address: String(address || '').trim(),
      paymentMethod: String(paymentMethod || 'Cash on Delivery (COD)').trim(),
      ...(paymentReference ? { paymentReference: String(paymentReference).trim() } : {}),
      ...(notes ? { notes: String(notes).trim() } : {}),
      items,
      total: Number(total) || items.reduce((sum, item) => sum + (Number(item.price) * Number(item.qty)), 0),
      status: 'Pending',
      createdAt: new Date().toISOString(),
      notificationsSent: [],
    };

    await saveRecord(ORDERS_KEY, order.id, order);

    try {
      order.notificationsSent = await dispatchOrderNotifications(order, settings);
      await saveRecord(ORDERS_KEY, order.id, order);
    } catch (error) {
      console.error(`Notification dispatch or log persistence failed for order ${order.id}:`, error);
      order.notificationsSent = [{
        channel: 'Notification dispatch',
        recipient: 'Store notification settings',
        status: 'Failed',
        error: error.message || 'Unable to dispatch notifications.',
        timestamp: new Date().toISOString(),
      }];
    }

    return res.status(201).json({
      success: true,
      message: 'Order placed successfully!',
      order,
    });
  } catch (error) {
    return respondWithError(res, error);
  }
}
