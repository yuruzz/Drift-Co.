import { searchDeliveryAddresses } from '../lib/delivery.js';

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ success: false, error: 'Method not allowed.' });
  }

  try {
    const query = typeof req.query?.q === 'string' ? req.query.q : '';
    const addresses = await searchDeliveryAddresses(query);
    return res.status(200).json({ success: true, addresses });
  } catch (error) {
    console.error('Delivery address search API error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Unable to search addresses right now.',
    });
  }
}
