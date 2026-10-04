import { defaultSettings, sendTestNotification } from '../../lib/notifications.js';
import { redisCommand } from '../../lib/redis.js';
import { requireStudioAccess } from '../../lib/studio-auth.js';

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
    const saved = await redisCommand('GET', 'drift:notification-settings');
    const settings = saved ? { ...defaultSettings, ...JSON.parse(saved) } : { ...defaultSettings };
    const logs = await sendTestNotification(settings);
    return res.status(200).json({ success: true, message: 'Test notification completed.', logs });
  } catch (error) {
    console.error('Test notification API error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Unable to send test notification.',
    });
  }
}
