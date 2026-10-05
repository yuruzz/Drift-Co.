import { defaultSettings, dispatchOrderNotifications } from './notifications.js';
import { getRecord, redisCommand, saveRecord } from './redis.js';
import { requireStudioAccess } from './studio-auth.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization, X-Studio-Pin');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ success: false, error: 'Method not allowed.' });
  }
  if (!requireStudioAccess(req, res)) return;

  try {
    const id = String(req.query.id || '');
    const order = await getRecord('drift:orders', id);
    if (!order) return res.status(404).json({ success: false, error: 'Order not found.' });
    const saved = await redisCommand('GET', 'drift:notification-settings');
    const settings = saved ? { ...defaultSettings, ...JSON.parse(saved) } : { ...defaultSettings };
    const logs = await dispatchOrderNotifications(order, settings);
    order.notificationsSent = [...(order.notificationsSent || []), ...logs];
    await saveRecord('drift:orders', id, order);
    return res.status(200).json({ success: true, message: 'Notification dispatched!', logs });
  } catch (error) {
    console.error('Order notification API error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Unable to dispatch notifications.',
    });
  }
}
