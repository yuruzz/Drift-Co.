import { requireStudioAccess } from '../lib/studio-auth.js';
import { resetSiteImages } from '../lib/site-images.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, X-Studio-Pin');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ success: false, error: 'Method not allowed.' });
  }
  if (!requireStudioAccess(req, res)) return;

  try {
    const siteImages = await resetSiteImages(req.body);
    return res.status(200).json({
      success: true,
      message: 'Image reset successfully.',
      siteImages,
    });
  } catch (error) {
    console.error('Site image reset API error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Unable to reset site images.',
    });
  }
}
