import { timingSafeEqual } from 'node:crypto';

export function requireStudioAccess(req, res) {
  const expectedPin = process.env.STUDIO_ADMIN_PIN;
  if (!expectedPin || Buffer.byteLength(expectedPin) < 32) {
    res.status(503).json({
      success: false,
      error: 'Studio API access is not configured securely. Set STUDIO_ADMIN_PIN to a unique secret of at least 32 characters in the hosting provider environment.',
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
