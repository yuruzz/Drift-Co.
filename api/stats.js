import { getHash } from '../lib/redis.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ success: false, error: 'Method not allowed.' });
  }

  try {
    const [ordersById, inquiriesById] = await Promise.all([
      getHash('drift:orders'),
      getHash('drift:inquiries'),
    ]);
    const orders = Object.values(ordersById);
    return res.status(200).json({
      success: true,
      stats: {
        totalOrders: orders.length,
        totalRevenue: orders.reduce((sum, order) => (
          order.shippingConfirmationRequired
            || order.paymentMethod === 'QR Ph' && order.paymentStatus !== 'Paid'
            ? sum
            : sum + (Number(order.total) || 0)
        ), 0),
        totalInquiries: Object.keys(inquiriesById).length,
      },
    });
  } catch (error) {
    console.error('Stats API error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Unable to load store statistics.',
    });
  }
}
