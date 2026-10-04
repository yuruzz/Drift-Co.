// Vercel Serverless Function: /api/payments/settings

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Return payment settings with BDO, BPI, GCash disabled by default
  return res.status(200).json({
    success: true,
    settings: {
      bdoEnabled: false,
      bdoAccountName: 'Drift & Co. Fragrances',
      bdoAccountNumber: '0068-1234-5678',
      bdoQrUrl: '',
      bpiEnabled: false,
      bpiAccountName: 'Drift & Co. Fragrances',
      bpiAccountNumber: '0019-2834-51',
      bpiQrUrl: '',
      gcashEnabled: false,
      gcashAccountName: 'Drift & Co. Store',
      gcashNumber: '0917-123-4567',
      gcashQrUrl: '',
      instructions: 'Please transfer the exact amount and save a screenshot of your transfer receipt.',
      gatewayProvider: 'manual',
      paymongoPublicKey: ''
    }
  });
}
