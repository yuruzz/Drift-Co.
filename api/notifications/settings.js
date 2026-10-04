import { defaultSettings, publicSettings } from '../../lib/notifications.js';
import { redisCommand } from '../../lib/redis.js';
import { requireStudioAccess } from '../../lib/studio-auth.js';

const SETTINGS_KEY = 'drift:notification-settings';
const SECRET_FIELDS = ['telegramBotToken', 'semaphoreApiKey', 'twilioAuthToken'];

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization, X-Studio-Pin');
}

function respondWithError(res, error) {
  console.error('Notification settings API error:', error);
  const status = error.statusCode || 500;
  return res.status(status).json({ success: false, error: error.message || 'Unable to access notification settings.' });
}

async function readSettings() {
  const value = await redisCommand('GET', SETTINGS_KEY);
  return value ? { ...defaultSettings, ...JSON.parse(value) } : { ...defaultSettings };
}

function normalizeSettings(current, body) {
  const updated = { ...current };
  const textFields = [
    'ownerPhone', 'ownerName', 'ownerEmail', 'webhookUrl', 'telegramChatId',
    'semaphoreSenderName', 'twilioAccountSid', 'twilioFromNumber', 'ntfyTopic',
  ];

  for (const field of textFields) {
    if (body[field] !== undefined) updated[field] = String(body[field]).trim();
  }
  for (const field of SECRET_FIELDS) {
    if (body[field] && !String(body[field]).includes('••••')) {
      updated[field] = String(body[field]).trim();
    }
  }
  for (const field of ['notifyOwnerOnOrder', 'notifyCustomerOnOrder', 'notifyOwnerOnInquiry', 'soundAlertsEnabled']) {
    if (body[field] !== undefined) updated[field] = body[field] === true || body[field] === 'true';
  }

  return updated;
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      if (!requireStudioAccess(req, res)) return;
      return res.status(200).json({ success: true, settings: publicSettings(await readSettings()) });
    }

    if (req.method === 'POST') {
      if (!requireStudioAccess(req, res)) return;
      const current = await readSettings();
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const settings = normalizeSettings(current, body);
      await redisCommand('SET', SETTINGS_KEY, JSON.stringify(settings));
      return res.status(200).json({
        success: true,
        message: 'Notification settings updated successfully!',
        settings: publicSettings(settings),
      });
    }

    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return res.status(405).json({ success: false, error: 'Method not allowed.' });
  } catch (error) {
    return respondWithError(res, error);
  }
}
