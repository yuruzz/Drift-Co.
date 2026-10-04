// Vercel Serverless Function: /api/partner-inquiries
// Handles reseller and partner inquiries on Vercel deployments

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const { name, phone, email, location, message, packageType } = body;

      if (!name || !phone) {
        return res.status(400).json({ success: false, error: 'Name and phone number are required.' });
      }

      const inqId = 'INQ-' + Math.floor(100000 + Math.random() * 900000);
      const inquiry = {
        id: inqId,
        name: String(name).trim(),
        phone: String(phone).trim(),
        email: email ? String(email).trim() : undefined,
        location: location ? String(location).trim() : undefined,
        message: message ? String(message).trim() : undefined,
        packageType: packageType || 'Starter Package ₱988',
        status: 'New',
        createdAt: new Date().toISOString()
      };

      try {
        await fetch('https://ntfy.sh/drift-co-orders-alert', {
          method: 'POST',
          headers: {
            'Title': `New Drift & Co. Reseller Inquiry: ${inquiry.name}`,
            'Priority': 'high',
            'Tags': 'briefcase,handshake'
          },
          body: `Applicant: ${inquiry.name} (${inquiry.phone})\nLocation: ${inquiry.location || 'N/A'}\nPackage: ${inquiry.packageType}\nMessage: ${inquiry.message || 'None'}`
        });
      } catch (e) {}

      return res.status(201).json({
        success: true,
        message: 'Partner inquiry submitted successfully!',
        inquiry
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: 'Server error processing inquiry.' });
    }
  }

  return res.status(200).json({ success: true, inquiries: [] });
}
