import { getDeliveryQuote } from '../lib/delivery.js';

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ success: false, error: 'Method not allowed.' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const quote = await getDeliveryQuote(body.latitude, body.longitude, body.items);
    return res.status(200).json({ success: true, ...quote });
  } catch (error) {
    console.error('Delivery quote API error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Unable to calculate the delivery charge.',
    });
  }
}
