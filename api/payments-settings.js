import { redisCommand } from '../lib/redis.js';
import { requireStudioAccess } from '../lib/studio-auth.js';
import { paymongoQrPhReady } from '../lib/paymongo.js';

const SETTINGS_KEY = 'drift:payment-settings';
const defaultSettings = {
  bdoEnabled: false,
  bdoAccountName: '',
  bdoAccountNumber: '',
  bdoQrUrl: '',
  bpiEnabled: false,
  bpiAccountName: '',
  bpiAccountNumber: '',
  bpiQrUrl: '',
  gcashEnabled: false,
  gcashAccountName: '',
  gcashNumber: '',
  gcashQrUrl: '',
  instructions: 'Please transfer the exact amount and save a screenshot of your transfer receipt.',
  gatewayProvider: 'manual',
  paymongoPublicKey: '',
};
const stringLimits = {
  bdoAccountName: 120,
  bdoAccountNumber: 80,
  bdoQrUrl: 2048,
  bpiAccountName: 120,
  bpiAccountNumber: 80,
  bpiQrUrl: 2048,
  gcashAccountName: 120,
  gcashNumber: 80,
  gcashQrUrl: 2048,
  instructions: 1000,
  paymongoPublicKey: 256,
};
const allowedGateways = new Set(['manual', 'paymongo', 'maya', 'xendit']);

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, X-Studio-Pin');
}

function respondWithError(res, error) {
  console.error('Payment settings API error:', error);
  return res.status(error.statusCode || 500).json({
    success: false,
    error: error.message || 'Unable to access payment settings.',
  });
}

function parseBody(body) {
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      const error = new Error('Request body must contain valid JSON.');
      error.statusCode = 400;
      throw error;
    }
  }
  return body && typeof body === 'object' && !Array.isArray(body) ? body : {};
}

function validateSettings(body, current) {
  const updated = { ...current };
  for (const key of Object.keys(defaultSettings)) {
    if (!(key in body)) continue;
    const value = body[key];

    if (key.endsWith('Enabled')) {
      if (typeof value !== 'boolean') {
        const error = new Error(`${key} must be a boolean.`);
        error.statusCode = 400;
        throw error;
      }
      updated[key] = value;
      continue;
    }

    if (key === 'gatewayProvider') {
      if (!allowedGateways.has(value)) {
        const error = new Error('Unsupported payment gateway.');
        error.statusCode = 400;
        throw error;
      }
      updated[key] = value;
      continue;
    }

    if (typeof value !== 'string' || value.length > stringLimits[key]) {
      const error = new Error(`${key} must be text no longer than ${stringLimits[key]} characters.`);
      error.statusCode = 400;
      throw error;
    }
    const trimmed = value.trim();
    if (key.endsWith('QrUrl') && trimmed) {
      let parsedUrl;
      try {
        parsedUrl = new URL(trimmed);
      } catch {
        const error = new Error(`${key} must be an HTTPS or HTTP URL.`);
        error.statusCode = 400;
        throw error;
      }
      if (parsedUrl.protocol !== 'https:') {
        const error = new Error(`${key} must be an HTTPS URL.`);
        error.statusCode = 400;
        throw error;
      }
    }
    updated[key] = trimmed;
  }
  for (const [enabledKey, nameKey, numberKey] of [
    ['bdoEnabled', 'bdoAccountName', 'bdoAccountNumber'],
    ['bpiEnabled', 'bpiAccountName', 'bpiAccountNumber'],
    ['gcashEnabled', 'gcashAccountName', 'gcashNumber'],
  ]) {
    if (updated[enabledKey] && (!updated[nameKey] || !updated[numberKey])) {
      const error = new Error(`Set the account name and destination for ${enabledKey.replace('Enabled', '')} before enabling it.`);
      error.statusCode = 400;
      throw error;
    }
  }
  return updated;
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const saved = await redisCommand('GET', SETTINGS_KEY);
      const settings = saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings;
      return res.status(200).json({
        success: true,
        settings: { ...settings, qrphEnabled: paymongoQrPhReady() },
      });
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST, OPTIONS');
      return res.status(405).json({ success: false, error: 'Method not allowed.' });
    }
    if (!requireStudioAccess(req, res)) return;

    const saved = await redisCommand('GET', SETTINGS_KEY);
    const current = saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings;
    const settings = validateSettings(parseBody(req.body), current);
    await redisCommand('SET', SETTINGS_KEY, JSON.stringify(settings));

    return res.status(200).json({
      success: true,
      message: 'Bank and payment accounts updated successfully.',
      settings,
    });
  } catch (error) {
    return respondWithError(res, error);
  }
}
