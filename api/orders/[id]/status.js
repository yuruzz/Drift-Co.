import { saveRecord, getRecord } from '../../../lib/redis.js';
import { requireStudioAccess } from '../../../lib/studio-auth.js';

const VALID_STATUSES = ['Pending', 'Confirmed', 'Shipped', 'Delivered'];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization, X-Studio-Pin');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH, OPTIONS');
    return res.status(405).json({ success: false, error: 'Method not allowed.' });
  }
  if (!requireStudioAccess(req, res)) return;

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    if (!VALID_STATUSES.includes(body.status)) {
      return res.status(400).json({ success: false, error: 'Invalid status.' });
    }

    const id = String(req.query.id || '');
    const order = await getRecord('drift:orders', id);
    if (!order) return res.status(404).json({ success: false, error: 'Order not found.' });
    order.status = body.status;
    await saveRecord('drift:orders', id, order);
    return res.status(200).json({ success: true, order });
  } catch (error) {
    console.error('Order status API error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Unable to update order status.',
    });
  }
}
