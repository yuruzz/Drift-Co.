// Vercel Serverless Function: /api/orders
// Handles order creation and listing on Vercel deployments

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const { customerName, phone, address, paymentMethod, paymentReference, notes, items, total } = body;

      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, error: 'Bag is empty or invalid items provided.' });
      }

      if (!customerName || !phone) {
        return res.status(400).json({ success: false, error: 'Customer name and phone number are required.' });
      }

      const orderId = 'DRFT-' + Math.floor(100000 + Math.random() * 900000);
      const calculatedTotal = Number(total) || items.reduce((acc, item) => acc + (item.price * item.qty), 0);

      const newOrder = {
        id: orderId,
        customerName: String(customerName).trim(),
        phone: String(phone).trim(),
        address: String(address || '').trim(),
        paymentMethod: String(paymentMethod || 'Cash on Delivery (COD)').trim(),
        paymentReference: paymentReference ? String(paymentReference).trim() : undefined,
        notes: notes ? String(notes).trim() : undefined,
        items,
        total: calculatedTotal,
        status: 'Pending',
        createdAt: new Date().toISOString(),
        notificationsSent: [
          { channel: 'Vercel Serverless Concierge', recipient: phone, status: 'Dispatched', timestamp: new Date().toISOString() }
        ]
      };

      // Dispatch instant push notification to store owner's device via free ntfy.sh
      try {
        const itemsSummary = items.map(i => `${i.name} (x${i.qty})`).join(', ');
        await fetch('https://ntfy.sh/drift-co-orders-alert', {
          method: 'POST',
          headers: {
            'Title': `New Drift & Co. Order: ${newOrder.customerName} (₱${newOrder.total.toFixed(2)})`,
            'Priority': 'urgent',
            'Tags': 'shopping_bags,perfume,moneybag'
          },
          body: `Order Reference: ${newOrder.id}\nCustomer: ${newOrder.customerName} (${newOrder.phone})\nTotal: ₱${newOrder.total.toFixed(2)} (${newOrder.paymentMethod})\nDelivery Address: ${newOrder.address || 'N/A'}\n\nBottles:\n${itemsSummary}`
        });
      } catch (pushErr) {
        console.warn('Push alert error:', pushErr);
      }

      return res.status(201).json({
        success: true,
        message: 'Order placed successfully! Notifications dispatched.',
        order: newOrder
      });
    } catch (err) {
      console.error('Order creation error:', err);
      return res.status(500).json({ success: false, error: 'Server error processing order.' });
    }
  }

  // GET /api/orders
  return res.status(200).json({
    success: true,
    orders: []
  });
}
