import { getHash } from './redis.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ success: false, error: 'Method not allowed.' });
  }

  const rawQuery = String(req.query.query || '').trim();
  if (!rawQuery) {
    return res.status(400).json({ success: false, error: 'Please provide the full Order Reference ID.' });
  }

  try {
    const query = rawQuery.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const orders = Object.values(await getHash('drift:orders'));
    const order = orders.find(item => {
      const orderId = item.id.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      return orderId === query;
    });

    if (!order) return res.status(404).json({ success: false, error: 'No order found with that full reference ID.' });

    const createdDate = new Date(order.createdAt || Date.now());
    const formatDate = date => date.toLocaleDateString('en-PH', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    const step2Date = new Date(createdDate.getTime() + 4 * 60 * 60 * 1000);
    const step3Date = new Date(createdDate.getTime() + 20 * 60 * 60 * 1000);
    const step4Date = new Date(createdDate.getTime() + 48 * 60 * 60 * 1000);
    const deliveryMin = new Date(createdDate.getTime() + 2 * 24 * 60 * 60 * 1000);
    const deliveryMax = new Date(createdDate.getTime() + 4 * 24 * 60 * 60 * 1000);
    const estimatedDelivery = `${deliveryMin.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} – ${deliveryMax.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    const currentStep = { Pending: 1, Confirmed: 2, Shipped: 3, Delivered: 4 }[order.status] || 1;
    const timeline = [
      {
        step: 1,
        title: 'Order Placed & Logged',
        description: 'Order registered in our bespoke compounding queue. Notification sent to concierge.',
        status: 'completed',
        timestamp: formatDate(createdDate),
        location: 'Drift & Co. Atelier Hub, Metro Manila',
      },
      {
        step: 2,
        title: 'Hand-Compounded & Quality Checked',
        description: 'Formulated with 30% oil concentration from USA & Germany. Bottle sealed with crimped gold atomizer.',
        status: currentStep >= 2 ? 'completed' : 'in_progress',
        timestamp: currentStep >= 2 ? formatDate(step2Date) : 'In progress',
        location: 'Drift & Co. Perfumery Lab',
      },
      {
        step: 3,
        title: 'Dispatched & Handed to Courier',
        description: 'Protected with luxury shock-absorbent cushioning and handed over to courier dispatch.',
        status: currentStep >= 3 ? 'completed' : currentStep === 2 ? 'in_progress' : 'upcoming',
        timestamp: currentStep >= 3 ? formatDate(step3Date) : 'Awaiting courier handover',
        location: 'J&T Express / Drift Priority Courier Hub',
      },
      {
        step: 4,
        title: 'Out for Delivery / Delivered',
        description: currentStep === 4 ? 'Package successfully received by customer.' : 'Courier will notify via SMS or call prior to arrival.',
        status: currentStep === 4 ? 'completed' : currentStep === 3 ? 'in_progress' : 'upcoming',
        timestamp: currentStep === 4 ? formatDate(step4Date) : estimatedDelivery,
        location: 'Delivery destination',
      },
    ];
    const digitsOnly = order.id.replace(/\D/g, '') || '882194';
    const trackingOrder = {
      id: order.id,
      status: order.status,
      createdAt: order.createdAt,
      total: order.total,
      shippingConfirmationRequired: Boolean(order.shippingConfirmationRequired),
      shippingConfirmationReasons: order.shippingConfirmationReasons || [],
      deliveryFee: order.deliveryFee,
      shippingZone: order.shippingZone,
      shippingOrigin: order.shippingOrigin,
      ...(order.paymentStatus ? { paymentStatus: order.paymentStatus } : {}),
    };

    return res.status(200).json({
      success: true,
      order: trackingOrder,
      tracking: {
        trackingNumber: `PH-JT-${digitsOnly}EXP`,
        courier: 'J&T Express PH / Drift Priority Courier',
        estimatedDelivery,
        currentStep,
        statusLabel: order.status,
        timeline,
      },
    });
  } catch (error) {
    console.error('Order tracking API error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Unable to look up this order.',
    });
  }
}
