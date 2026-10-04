import { timingSafeEqual } from 'node:crypto';

export function requireStudioAccess(req, res) {
  const expectedPin = process.env.STUDIO_ADMIN_PIN;
  if (!expectedPin) {
    res.status(503).json({
      success: false,
      error: 'Studio API access is not configured. Set STUDIO_ADMIN_PIN in the Vercel project environment variables.',
    });
    return false;
  }

  const suppliedPin = req.headers?.['x-studio-pin'];
  if (typeof suppliedPin !== 'string') {
    res.status(401).json({ success: false, error: 'Studio access denied. Unlock Studio Mode with the configured PIN.' });
    return false;
  }

  const expected = Buffer.from(expectedPin);
  const supplied = Buffer.from(suppliedPin);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    res.status(401).json({ success: false, error: 'Studio access denied. Unlock Studio Mode with the configured PIN.' });
    return false;
  }

  return true;
}
