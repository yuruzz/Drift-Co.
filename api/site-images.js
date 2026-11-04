import { requireStudioAccess } from '../lib/studio-auth.js';
import { getSiteImages, saveSiteImageChanges } from '../lib/site-images.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, X-Studio-Pin');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return res.status(405).json({ success: false, error: 'Method not allowed.' });
  }
  if (req.method === 'POST' && !requireStudioAccess(req, res)) return;

  try {
    const siteImages = req.method === 'GET'
      ? await getSiteImages()
      : await saveSiteImageChanges(req.body);
    return res.status(200).json({
      success: true,
      ...(req.method === 'POST' ? { message: 'Images saved permanently in database!' } : {}),
      siteImages,
    });
  } catch (error) {
    console.error('Site images API error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Unable to access site images.',
    });
  }
}
