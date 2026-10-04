import { defaultSettings, dispatchInquiryNotifications } from '../lib/notifications.js';
import { getHash, redisCommand, saveRecord } from '../lib/redis.js';
import { requireStudioAccess } from '../lib/studio-auth.js';

const INQUIRIES_KEY = 'drift:inquiries';

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization, X-Studio-Pin');
}

function respondWithError(res, error) {
  console.error('Partner inquiries API error:', error);
  return res.status(error.statusCode || 500).json({
    success: false,
    error: error.message || 'Unable to process partner inquiry.',
  });
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      if (!requireStudioAccess(req, res)) return;
      const inquiries = Object.values(await getHash(INQUIRIES_KEY))
        .sort((first, second) => new Date(second.createdAt) - new Date(first.createdAt));
      return res.status(200).json({ success: true, inquiries });
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST, OPTIONS');
      return res.status(405).json({ success: false, error: 'Method not allowed.' });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { name, phone, email, location, message, packageType } = body;
    if (!name || !phone) {
      return res.status(400).json({ success: false, error: 'Name and phone number are required.' });
    }

    const savedSettings = await redisCommand('GET', 'drift:notification-settings');
    const settings = savedSettings ? { ...defaultSettings, ...JSON.parse(savedSettings) } : { ...defaultSettings };
    const inquiry = {
      id: `PTR-${Math.floor(10000 + Math.random() * 90000)}`,
      name: String(name).trim(),
      phone: String(phone).trim(),
      ...(email ? { email: String(email).trim() } : {}),
      ...(location ? { location: String(location).trim() } : {}),
      ...(message ? { message: String(message).trim() } : {}),
      packageType: String(packageType || 'Starter Package ₱988'),
      status: 'New',
      createdAt: new Date().toISOString(),
      notificationsSent: [],
    };

    await saveRecord(INQUIRIES_KEY, inquiry.id, inquiry);

    try {
      inquiry.notificationsSent = await dispatchInquiryNotifications(inquiry, settings);
      await saveRecord(INQUIRIES_KEY, inquiry.id, inquiry);
    } catch (error) {
      console.error(`Inquiry notification or log persistence failed for ${inquiry.id}:`, error);
      inquiry.notificationsSent = [{
        channel: 'Inquiry notification',
        recipient: 'Store notification settings',
        status: 'Failed',
        error: error.message || 'Unable to dispatch inquiry notifications.',
        timestamp: new Date().toISOString(),
      }];
    }

    return res.status(201).json({
      success: true,
      message: 'Partner inquiry submitted successfully!',
      inquiry,
    });
  } catch (error) {
    return respondWithError(res, error);
  }
}
