import { randomUUID } from 'node:crypto';
import { defaultSettings, dispatchOrderNotifications } from '../lib/notifications.js';
import { getHash, redisCommand, saveRecord } from '../lib/redis.js';
import { requireStudioAccess } from '../lib/studio-auth.js';
import { createQrPhPayment } from '../lib/paymongo.js';
import { verifyDeliveryQuote } from '../lib/delivery.js';
import { calculateOrderPricing } from '../lib/order-pricing.js';

const ORDERS_KEY = 'drift:orders';

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization, X-Studio-Pin');
}

function respondWithError(res, error) {
  console.error('Orders API error:', error);
  return res.status(error.statusCode || 500).json({
    success: false,
    error: error.message || 'Unable to access orders.',
  });
}

function calculateQrPhTotal(items) {
  return items.reduce((sum, item) => {
    const priceByVolume = { '40ml': 380, '50ml': 450 };
    const price = priceByVolume[item?.volume];
    const quantity = Number(item?.qty);
    if (!price || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100) {
      const error = new Error('The bag contains an invalid item or quantity.');
      error.statusCode = 400;
      throw error;
    }
    return sum + price * quantity;
  }, 0);
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      if (!requireStudioAccess(req, res)) return;
      const orders = Object.values(await getHash(ORDERS_KEY))
        .sort((first, second) => new Date(second.createdAt) - new Date(first.createdAt));
      return res.status(200).json({ success: true, orders });
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST, OPTIONS');
      return res.status(405).json({ success: false, error: 'Method not allowed.' });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const {
      customerName,
      phone,
      addressDetails,
      deliveryQuoteToken,
      paymentMethod,
      paymentReference,
      notes,
      items,
    } = body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Bag is empty or invalid items provided.' });
    }
    if (!customerName || !phone) {
      return res.status(400).json({ success: false, error: 'Customer name and phone number are required.' });
    }

    const savedSettings = await redisCommand('GET', 'drift:notification-settings');
    const settings = savedSettings ? { ...defaultSettings, ...JSON.parse(savedSettings) } : { ...defaultSettings };
    const isQrPhPayment = paymentMethod === 'QR Ph';
    const pricing = calculateOrderPricing(items);
    const subtotal = isQrPhPayment ? calculateQrPhTotal(items) : pricing.subtotal;
    const delivery = verifyDeliveryQuote(deliveryQuoteToken, items);
    if (isQrPhPayment && delivery.shippingConfirmationRequired) {
      const error = new Error('QR Ph is unavailable until shipping charges are confirmed. Please choose Cash on Delivery or contact the store.');
      error.statusCode = 400;
      throw error;
    }
    const cleanAddressDetails = String(addressDetails || '').trim().slice(0, 200);
    const orderTotal = subtotal + (delivery.deliveryFee || 0);
    const order = {
      id: `DRFT-${randomUUID().toUpperCase()}`,
      customerName: String(customerName).trim(),
      phone: String(phone).trim(),
      address: [delivery.address, cleanAddressDetails].filter(Boolean).join(', '),
      subtotal,
      deliveryFee: delivery.deliveryFee,
      deliveryDistanceKm: delivery.distanceKm,
      shippingWeightGrams: delivery.shippingWeightGrams,
      shippingZone: delivery.zone,
      shippingOrigin: delivery.origin,
      shippingConfirmationRequired: delivery.shippingConfirmationRequired,
      shippingConfirmationReasons: delivery.shippingConfirmationReasons,
      paymentMethod: String(paymentMethod || 'Cash on Delivery (COD)').trim(),
      ...(paymentReference ? { paymentReference: String(paymentReference).trim() } : {}),
      ...(notes ? { notes: String(notes).trim() } : {}),
      items,
      total: orderTotal,
      status: 'Pending',
      ...(isQrPhPayment ? { paymentStatus: 'Pending' } : {}),
      createdAt: new Date().toISOString(),
      notificationsSent: [],
    };

    const payment = isQrPhPayment ? await createQrPhPayment(orderTotal, order.id) : null;
    if (payment) order.paymentIntentId = payment.paymentIntentId;
    await saveRecord(ORDERS_KEY, order.id, order);

    try {
      order.notificationsSent = await dispatchOrderNotifications(order, settings);
      await saveRecord(ORDERS_KEY, order.id, order);
    } catch (error) {
      console.error(`Notification dispatch or log persistence failed for order ${order.id}:`, error);
      order.notificationsSent = [{
        channel: 'Notification dispatch',
        recipient: 'Store notification settings',
        status: 'Failed',
        error: error.message || 'Unable to dispatch notifications.',
        timestamp: new Date().toISOString(),
      }];
    }

    return res.status(201).json({
      success: true,
      message: 'Order placed successfully!',
      order,
      ...(payment ? { payment: { qrCodeDataUrl: payment.qrCodeDataUrl } } : {}),
    });
  } catch (error) {
    return respondWithError(res, error);
  }
}
