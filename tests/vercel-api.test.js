import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example.com';
process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
const studioPin = 'test-studio-pin-for-unit-tests-32';
process.env.STUDIO_ADMIN_PIN = studioPin;
process.env.PAYMONGO_QRPH_ENABLED = 'true';
process.env.PAYMONGO_SECRET_KEY = 'sk_test_paymongo-unit-test';
process.env.PAYMONGO_PUBLIC_KEY = 'pk_test_paymongo-unit-test';
process.env.PAYMONGO_WEBHOOK_SECRET = 'whsec_paymongo-unit-test';
process.env.DELIVERY_QUOTE_SECRET = 'delivery-quote-unit-test-secret-with-more-than-32-chars';

const { default: settingsHandler } = await import('../api/notifications/settings.js');
const { normalizeNtfyTopic } = await import('../lib/notifications.js');
const { calculateJntDeliveryFee, classifyJntZone, getPickupDetails, PICKUP_LOCATION, verifyDeliveryQuote } = await import('../lib/delivery.js');
const { default: ordersHandler } = await import('../api/orders.js');
const { default: deliverySearchHandler } = await import('../api/delivery-search.js');
const { default: deliveryQuoteHandler } = await import('../api/delivery-quote.js');
const { default: inquiriesHandler } = await import('../api/partner-inquiries.js');
const { default: orderStatusHandler } = await import('../lib/order-status.js');
const { default: statsHandler } = await import('../api/stats.js');
const { default: paymentSettingsHandler } = await import('../api/payments-settings.js');
const { default: studioAuthHandler } = await import('../api/studio-auth.js');
const { default: orderTrackingHandler } = await import('../lib/order-tracking.js');
const { paymongoQrPhReady, verifyPaymongoWebhook } = await import('../lib/paymongo.js');

const hashes = new Map();
const values = new Map();
const valueExpiresAt = new Map();
const notifications = [];
const paymongoIntents = new Map();
let nextPaymongoIntent = 1;
let osrmDistances = [[5000], [6000]];

globalThis.fetch = async (url, options) => {
  if (url === 'https://redis.example.com') {
    const command = JSON.parse(options.body);
    const [operation, key, field, value, ...arguments_] = command;
    if (operation === 'GET') {
      const expiresAt = valueExpiresAt.get(key);
      if (expiresAt && expiresAt <= Date.now()) {
        values.delete(key);
        valueExpiresAt.delete(key);
      }
      return jsonResponse(values.get(key) ?? null);
    }
    if (operation === 'SET') {
      const setOptions = [value, ...arguments_];
      if (setOptions.includes('NX') && values.has(key) && (valueExpiresAt.get(key) || 0) > Date.now()) {
        return jsonResponse(null);
      }
      values.set(key, field);
      const expiryKind = setOptions.findIndex(value => value === 'PX' || value === 'EX');
      valueExpiresAt.set(key, expiryKind < 0
        ? 0
        : Date.now() + Number(setOptions[expiryKind + 1]) * (setOptions[expiryKind] === 'PX' ? 1 : 1000));
      return jsonResponse('OK');
    }
    if (operation === 'HSET') {
      if (!hashes.has(key)) hashes.set(key, new Map());
      hashes.get(key).set(field, value);
      return jsonResponse(1);
    }
    if (operation === 'HGETALL') {
      const entries = [...(hashes.get(key) || new Map()).entries()].flat();
      return jsonResponse(entries);
    }
    if (operation === 'HGET') return jsonResponse(hashes.get(key)?.get(field) ?? null);
    throw new Error(`Unexpected Redis command: ${operation}`);
  }

  if (url.startsWith('https://api.paymongo.com/v1/')) {
    const body = options.body ? JSON.parse(options.body) : null;
    if (url.endsWith('/payment_intents')) {
      const id = `pi_test_${nextPaymongoIntent++}`;
      paymongoIntents.set(id, {
        amount: body.data.attributes.amount,
        currency: body.data.attributes.currency,
        metadata: body.data.attributes.metadata,
        status: 'awaiting_next_action',
      });
      return paymongoResponse({
        id,
        attributes: { client_key: `${id}_client` },
      });
    }
    if (url.endsWith('/payment_methods')) {
      return paymongoResponse({ id: `pm_test_${nextPaymongoIntent}` });
    }
    const attachMatch = url.match(/\/payment_intents\/(pi_test_\d+)\/attach$/);
    if (attachMatch) {
      return paymongoResponse({
        id: attachMatch[1],
        attributes: {
          status: 'awaiting_next_action',
          next_action: { code: { image_url: 'data:image/png;base64,YWJj' } },
        },
      });
    }
    const intentMatch = url.match(/\/payment_intents\/(pi_test_\d+)$/);
    if (intentMatch) {
      const intent = paymongoIntents.get(intentMatch[1]);
      return paymongoResponse({
        id: intentMatch[1],
        attributes: {
          amount: intent.amount,
          currency: intent.currency,
          metadata: intent.metadata,
          status: intent.status,
        },
      });
    }
    throw new Error(`Unexpected PayMongo URL: ${url}`);
  }

  if (String(url).startsWith('https://nominatim.openstreetmap.org/search')) {
    return nominatimResponse([{
      lat: '14.23',
      lon: '121.36',
      display_name: 'Pila, Laguna, Philippines',
    }]);
  }

  if (String(url).startsWith('https://nominatim.openstreetmap.org/reverse')) {
    return nominatimResponse({
      display_name: 'Pila, Laguna, Philippines',
      address: { country_code: 'ph', state: 'Laguna', region: 'CALABARZON' },
    });
  }

  if (String(url).startsWith('https://router.project-osrm.org/table/v1/driving/')) {
    return osrmResponse({ code: 'Ok', distances: osrmDistances });
  }

  notifications.push({ url, body: options.body });
  return jsonResponse({ ok: true });
};

function jsonResponse(result) {
  return { ok: true, status: 200, json: async () => ({ result }) };
}

function paymongoResponse(data) {
  return { ok: true, status: 200, json: async () => ({ data }) };
}

function nominatimResponse(data) {
  return { ok: true, status: 200, json: async () => data };
}

function osrmResponse(data) {
  return { ok: true, status: 200, json: async () => data };
}

function responseRecorder() {
  return {
    headers: {},
    statusCode: 200,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    end() {
      return this;
    },
  };
}

async function createDeliveryQuote(items = [{ name: 'Test Fragrance', price: 450, qty: 1, volume: '50ml' }]) {
  const response = responseRecorder();
  await deliveryQuoteHandler({
    method: 'POST',
    body: { latitude: 14.23, longitude: 121.36, items },
  }, response);
  assert.equal(response.statusCode, 200);
  return response.body;
}

test('notification settings persist in Redis without returning secrets', async () => {
  const saveResponse = responseRecorder();
  await settingsHandler({
    method: 'POST',
    headers: { 'x-studio-pin': studioPin },
    body: {
      ownerName: 'Studio Owner',
      webhookUrl: 'https://hooks.example.com/new-order',
      telegramBotToken: 'secret-bot-token',
      ntfyTopic: 'https://ntfy.sh/my-store-orders',
      notifyOwnerOnOrder: true,
    },
  }, saveResponse);

  assert.equal(saveResponse.statusCode, 200);
  assert.equal(saveResponse.body.success, true);
  assert.equal(saveResponse.body.settings.telegramBotToken, undefined);
  assert.equal(saveResponse.body.settings.telegramBotTokenMasked, '••••••••oken');

  const readResponse = responseRecorder();
  await settingsHandler({ method: 'GET', headers: { 'x-studio-pin': studioPin } }, readResponse);
  assert.equal(readResponse.body.settings.ownerName, 'Studio Owner');
  assert.equal(readResponse.body.settings.webhookUrl, 'https://hooks.example.com/new-order');
  assert.equal(readResponse.body.settings.ntfyTopic, 'my-store-orders');
  assert.equal(notifications.some(call => call.url === 'https://ntfy.sh/my-store-orders'), false);

  const maskedSaveResponse = responseRecorder();
  await settingsHandler({
    method: 'POST',
    headers: { 'x-studio-pin': studioPin },
    body: { telegramBotToken: readResponse.body.settings.telegramBotTokenMasked },
  }, maskedSaveResponse);
  assert.equal(maskedSaveResponse.body.success, true);
  assert.equal(JSON.parse(values.get('drift:notification-settings')).telegramBotToken, 'secret-bot-token');
});

test('ntfy topics accept names or ntfy.sh URLs and reject unrelated URLs', () => {
  assert.equal(normalizeNtfyTopic('my-store-orders'), 'my-store-orders');
  assert.equal(normalizeNtfyTopic('https://ntfy.sh/my-store-orders'), 'my-store-orders');
  assert.throws(() => normalizeNtfyTopic('https://example.com/my-store-orders'), /https:\/\/ntfy\.sh/);
});

test('J&T fees use destination zone, packed weight tiers, and the bottle-only free threshold', () => {
  assert.equal(calculateJntDeliveryFee(500, 'Luzon', 450), 85);
  assert.equal(calculateJntDeliveryFee(501, 'Luzon', 450), 155);
  assert.equal(calculateJntDeliveryFee(1000, 'Manila', 450), 165);
  assert.equal(calculateJntDeliveryFee(1001, 'Visayas', 450), 200);
  assert.equal(calculateJntDeliveryFee(3001, 'Mindanao', 450), 330);
  assert.equal(calculateJntDeliveryFee(4001, 'Island', 450), 450);
  assert.equal(calculateJntDeliveryFee(5001, 'Luzon', 450), 455);
  assert.equal(calculateJntDeliveryFee(6001, 'Luzon', 450), null);
  assert.equal(calculateJntDeliveryFee(500, 'Luzon', 1500), 85);
  assert.equal(calculateJntDeliveryFee(500, 'Luzon', 1501), 0);
  assert.equal(classifyJntZone({ state: 'Occidental Mindoro', region: 'MIMAROPA' }), 'Island');
  assert.equal(classifyJntZone({ state: 'Metro Manila', region: 'NCR' }), 'Manila');
  assert.equal(classifyJntZone({ state: 'Cebu', region: 'Central Visayas' }), 'Visayas');
  assert.equal(classifyJntZone({ state: 'Davao del Sur', region: 'Davao Region' }), 'Mindanao');
  assert.equal(classifyJntZone({ state: 'Laguna', region: 'CALABARZON' }), 'Luzon');
});

test('pickup details have no delivery fee and use the Pila office location', () => {
  assert.deepEqual(getPickupDetails([
    { name: 'Test Fragrance', price: 450, qty: 2, volume: '50ml' },
  ]), {
    address: `Pickup at ${PICKUP_LOCATION}`,
    distanceKm: 0,
    deliveryFee: 0,
    shippingWeightGrams: 1000,
    bottleSubtotal: 900,
    zone: null,
    origin: PICKUP_LOCATION,
    shippingConfirmationRequired: false,
    shippingConfirmationReasons: [],
  });
});

test('delivery address search is user-triggered and limited to Philippine results', async () => {
  const response = responseRecorder();
  await deliverySearchHandler({ method: 'GET', query: { q: 'Pila Laguna' } }, response);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body.addresses, [{
    latitude: 14.23,
    longitude: 121.36,
    address: 'Pila, Laguna, Philippines',
  }]);
});

test('delivery quotes use OSM destination zones, J&T rates, and nearest-office OSRM distance', async () => {
  const response = responseRecorder();
  const items = [{ name: 'Test Fragrance', price: 450, qty: 1, volume: '50ml' }];
  await deliveryQuoteHandler({
    method: 'POST',
    body: { latitude: 14.23, longitude: 121.36, items },
  }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.address, 'Pila, Laguna, Philippines');
  assert.equal(response.body.distanceMeters, 5000);
  assert.equal(response.body.distanceKm, 5);
  assert.equal(response.body.deliveryFee, 85);
  assert.equal(response.body.zone, 'Luzon');
  assert.equal(response.body.origin, 'Bulilan Norte, Pila, Laguna');
  assert.equal(response.body.shippingWeightGrams, 500);
  assert.equal(typeof response.body.deliveryToken, 'string');
  assert.deepEqual(verifyDeliveryQuote(response.body.deliveryToken, items), {
    address: 'Pila, Laguna, Philippines',
    distanceKm: 5,
    deliveryFee: 85,
    shippingWeightGrams: 500,
    bottleSubtotal: 450,
    zone: 'Luzon',
    origin: 'Bulilan Norte, Pila, Laguna',
    shippingConfirmationRequired: false,
    shippingConfirmationReasons: [],
  });
  assert.throws(() => verifyDeliveryQuote(`${response.body.deliveryToken}tampered`, items), /invalid/i);
  assert.throws(() => verifyDeliveryQuote(response.body.deliveryToken, [{ ...items[0], qty: 2 }]), /invalid/i);
});

test('weight tiers, Starter Kit handling, and nearest dispatch office are verified on quotes', async () => {
  const overSixKg = await createDeliveryQuote([
    { name: '50ml fragrance', volume: '50ml', price: 450, qty: 13 },
  ]);
  assert.equal(overSixKg.shippingWeightGrams, 6500);
  assert.equal(overSixKg.deliveryFee, 0);
  assert.equal(overSixKg.shippingConfirmationReasons.some(reason => reason.includes('over 6 kg')), true);
  assert.equal(verifyDeliveryQuote(overSixKg.deliveryToken, [
    { name: '50ml fragrance', volume: '50ml', price: 450, qty: 13 },
  ]).shippingConfirmationRequired, true);

  const kitAndBottles = await createDeliveryQuote([
    { name: '50ml fragrance', volume: '50ml', price: 450, qty: 4 },
    { name: 'Starter Kit', volume: 'Starter Kit', price: 988, qty: 1 },
  ]);
  assert.equal(kitAndBottles.bottleSubtotal, 1800);
  assert.equal(kitAndBottles.shippingWeightGrams, 2000);
  assert.equal(kitAndBottles.deliveryFee, 0);
  assert.equal(kitAndBottles.shippingConfirmationReasons.some(reason => reason.includes('Starter Kit')), true);

  const kitOnly = await createDeliveryQuote([
    { name: 'Starter Kit', volume: 'Starter Kit', price: 988, qty: 1 },
  ]);
  assert.equal(kitOnly.deliveryFee, null);
  assert.equal(kitOnly.shippingWeightGrams, 0);
  assert.equal(verifyDeliveryQuote(kitOnly.deliveryToken, [
    { name: 'Starter Kit', volume: 'Starter Kit', price: 988, qty: 1 },
  ]).shippingConfirmationRequired, true);

  osrmDistances = [[8000], [1000]];
  try {
    const nearestOffice = await createDeliveryQuote();
    assert.equal(nearestOffice.origin, 'Calamba City Hall, Calamba, Laguna');
    assert.equal(nearestOffice.distanceKm, 1);
  } finally {
    osrmDistances = [[5000], [6000]];
  }
});

test('Messenger share page uses its own canonical URL and the public preview image', async () => {
  const html = await readFile(new URL('../public/share-v2/index.html', import.meta.url), 'utf8');
  assert.match(html, /property="og:url" content="https:\/\/driftco-website\.vercel\.app\/share-v2\/"/);
  assert.match(html, /property="og:image" content="https:\/\/driftco-website\.vercel\.app\/share-preview\.jpg"/);
  assert.match(html, /property="og:image:width" content="1200"/);
  assert.match(html, /property="og:image:height" content="630"/);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
});

test('orders are stored, use saved notification settings, and appear in Studio stats', async () => {
  notifications.length = 0;
  const orderResponse = responseRecorder();
  await ordersHandler({
    method: 'POST',
    body: {
      customerName: 'Test Customer',
      phone: '09170000000',
      address: 'Manila',
      deliveryQuoteToken: (await createDeliveryQuote()).deliveryToken,
      items: [{ name: 'Test Fragrance', price: 450, qty: 1, volume: '50ml' }],
      total: 1,
    },
  }, orderResponse);

  assert.equal(orderResponse.statusCode, 201);
  assert.equal(orderResponse.body.success, true);
  assert.equal(orderResponse.body.order.notificationsSent.some(log => log.channel === 'Webhook Alert' && log.status === 'Sent'), true);
  assert.equal(orderResponse.body.order.notificationsSent.some(log => log.channel === 'Instant Phone Alert (ntfy.sh/my-store-orders)' && log.status === 'Sent'), true);
  assert.equal(notifications.some(call => call.url === 'https://hooks.example.com/new-order'), true);
  assert.equal(notifications.some(call => call.url === 'https://ntfy.sh/my-store-orders'), true);
  const ntfyOrderAlert = notifications.find(call => call.url === 'https://ntfy.sh/my-store-orders');
  assert.match(ntfyOrderAlert.body, /authenticated Studio dashboard/);
  assert.doesNotMatch(ntfyOrderAlert.body, /Test Customer|09170000000|Pila, Laguna|DRFT-/);

  const orders = [...(hashes.get('drift:orders') || new Map()).values()].map(JSON.parse);
  assert.equal(orders.length, 1);
  assert.equal(orders[0].customerName, 'Test Customer');
  assert.equal(orders[0].address, 'Pila, Laguna, Philippines');
  assert.equal(orders[0].subtotal, 450);
  assert.equal(orders[0].deliveryFee, 85);
  assert.equal(orders[0].deliveryDistanceKm, 5);
  assert.equal(orders[0].total, 535);

  const statusResponse = responseRecorder();
  await orderStatusHandler({
    method: 'PATCH',
    headers: { 'x-studio-pin': studioPin },
    query: { id: orderResponse.body.order.id },
    body: { status: 'Confirmed' },
  }, statusResponse);
  assert.equal(statusResponse.body.order.status, 'Confirmed');

  const dashboardResponse = responseRecorder();
  await ordersHandler({ method: 'GET', headers: { 'x-studio-pin': studioPin } }, dashboardResponse);
  assert.equal(dashboardResponse.body.orders[0].status, 'Confirmed');

  const trackingResponse = responseRecorder();
  await orderTrackingHandler({ method: 'GET', query: { query: orderResponse.body.order.id } }, trackingResponse);
  assert.equal(trackingResponse.statusCode, 200);
  assert.deepEqual(Object.keys(trackingResponse.body.order).sort(), [
    'createdAt',
    'deliveryFee',
    'fulfillmentMethod',
    'id',
    'shippingConfirmationReasons',
    'shippingConfirmationRequired',
    'shippingOrigin',
    'shippingZone',
    'status',
    'total',
  ].sort());
  assert.equal('customerName' in trackingResponse.body.order, false);
  assert.equal('phone' in trackingResponse.body.order, false);
  assert.equal('address' in trackingResponse.body.order, false);
  assert.equal('items' in trackingResponse.body.order, false);
  assert.equal(trackingResponse.body.tracking.timeline.at(-1).location, 'Delivery destination');

  const partialTrackingResponse = responseRecorder();
  await orderTrackingHandler({ method: 'GET', query: { query: orderResponse.body.order.id.slice(-7) } }, partialTrackingResponse);
  assert.equal(partialTrackingResponse.statusCode, 404);

  const phoneTrackingResponse = responseRecorder();
  await orderTrackingHandler({ method: 'GET', query: { query: '09170000000' } }, phoneTrackingResponse);
  assert.equal(phoneTrackingResponse.statusCode, 404);

  const statsResponse = responseRecorder();
  await statsHandler({ method: 'GET' }, statsResponse);
  assert.deepEqual(statsResponse.body.stats, { totalOrders: 1, totalRevenue: 535, totalInquiries: 0 });
});

test('manual-shipping orders show provisional subtotals, do not count as revenue, and cannot use QR Ph', async () => {
  const items = [{ name: '50ml fragrance', volume: '50ml', price: 450, qty: 13 }];
  const deliveryQuoteToken = (await createDeliveryQuote(items)).deliveryToken;
  const qrResponse = responseRecorder();
  await ordersHandler({
    method: 'POST',
    body: {
      customerName: 'Manual Shipping Customer',
      phone: '09170000001',
      paymentMethod: 'QR Ph',
      deliveryQuoteToken,
      items,
    },
  }, qrResponse);
  assert.equal(qrResponse.statusCode, 400);
  assert.match(qrResponse.body.error, /shipping charges are confirmed/i);
  assert.equal(paymongoIntents.size, 0);

  const orderResponse = responseRecorder();
  await ordersHandler({
    method: 'POST',
    body: {
      customerName: 'Manual Shipping Customer',
      phone: '09170000001',
      deliveryQuoteToken,
      items,
    },
  }, orderResponse);
  assert.equal(orderResponse.statusCode, 201);
  assert.equal(orderResponse.body.order.subtotal, 5850);
  assert.equal(orderResponse.body.order.total, 5850);
  assert.equal(orderResponse.body.order.deliveryFee, 0);
  assert.equal(orderResponse.body.order.shippingConfirmationRequired, true);
  assert.match(notifications.filter(call => call.url === 'https://ntfy.sh/my-store-orders').at(-1).body, /authenticated Studio dashboard/i);

  const statsResponse = responseRecorder();
  await statsHandler({ method: 'GET' }, statsResponse);
  assert.equal(statsResponse.body.stats.totalRevenue, 535);
});

test('PayMongo stays disabled unless its explicit feature flag is enabled', async () => {
  const previousFlag = process.env.PAYMONGO_QRPH_ENABLED;
  delete process.env.PAYMONGO_QRPH_ENABLED;
  try {
    assert.equal(paymongoQrPhReady(), false);

    const settingsResponse = responseRecorder();
    await paymentSettingsHandler({ method: 'GET' }, settingsResponse);
    assert.equal(settingsResponse.body.settings.qrphEnabled, false);

    const intentsBefore = paymongoIntents.size;
    const orderResponse = responseRecorder();
    await ordersHandler({
      method: 'POST',
      body: {
        customerName: 'PayMongo Disabled Customer',
        phone: '09170000002',
        paymentMethod: 'QR Ph',
        deliveryQuoteToken: (await createDeliveryQuote()).deliveryToken,
        items: [{ name: 'Test Fragrance', price: 450, qty: 1, volume: '50ml' }],
      },
    }, orderResponse);
    assert.equal(orderResponse.statusCode, 503);
    assert.equal(paymongoIntents.size, intentsBefore);
  } finally {
    if (previousFlag === undefined) delete process.env.PAYMONGO_QRPH_ENABLED;
    else process.env.PAYMONGO_QRPH_ENABLED = previousFlag;
  }
});

test('QR Ph orders get a unique PayMongo QR when the disabled feature is explicitly enabled', async () => {
  const orderResponse = responseRecorder();
  await ordersHandler({
    method: 'POST',
    body: {
      customerName: 'QR Customer',
      phone: '09171112222',
      address: 'Manila',
      deliveryQuoteToken: (await createDeliveryQuote()).deliveryToken,
      paymentMethod: 'QR Ph',
      items: [{ name: '50ml fragrance', volume: '50ml', price: 450, qty: 1 }],
      total: 1,
    },
  }, orderResponse);

  assert.equal(orderResponse.statusCode, 201);
  assert.equal(orderResponse.body.order.total, 535);
  assert.equal(orderResponse.body.order.deliveryFee, 85);
  assert.equal(orderResponse.body.order.paymentStatus, 'Pending');
  assert.match(orderResponse.body.order.paymentIntentId, /^pi_test_/);
  assert.match(orderResponse.body.payment.qrCodeDataUrl, /^data:image\/png;base64,/);
  assert.equal(paymongoIntents.get(orderResponse.body.order.paymentIntentId).amount, 53500);

  const pendingStats = responseRecorder();
  await statsHandler({ method: 'GET' }, pendingStats);
  assert.equal(pendingStats.body.stats.totalRevenue, 535);

  const deniedStatus = responseRecorder();
  await orderStatusHandler({
    method: 'PATCH',
    headers: { 'x-studio-pin': studioPin },
    query: { id: orderResponse.body.order.id },
    body: { status: 'Confirmed' },
  }, deniedStatus);
  assert.equal(deniedStatus.statusCode, 409);

});

test('pickup orders need no delivery quote, ignore client address details, and track as pickup', async () => {
  const items = [{ name: 'Test Fragrance', price: 450, qty: 1, volume: '50ml' }];
  const orderResponse = responseRecorder();
  await ordersHandler({
    method: 'POST',
    body: {
      customerName: 'Pickup Customer',
      phone: '09170000003',
      fulfillmentMethod: 'pickup',
      address: 'Untrusted client address',
      addressDetails: 'Untrusted address details',
      items,
      total: 1,
    },
  }, orderResponse);

  assert.equal(orderResponse.statusCode, 201);
  assert.equal(orderResponse.body.order.fulfillmentMethod, 'pickup');
  assert.equal(orderResponse.body.order.address, `Pickup at ${PICKUP_LOCATION}`);
  assert.equal(orderResponse.body.order.shippingOrigin, PICKUP_LOCATION);
  assert.equal(orderResponse.body.order.deliveryFee, 0);
  assert.equal(orderResponse.body.order.shippingConfirmationRequired, false);
  assert.equal(orderResponse.body.order.total, 450);

  const trackingResponse = responseRecorder();
  await orderTrackingHandler({
    method: 'GET',
    query: { query: orderResponse.body.order.id },
  }, trackingResponse);
  assert.equal(trackingResponse.body.order.fulfillmentMethod, 'pickup');
  assert.match(trackingResponse.body.tracking.trackingNumber, /^PICKUP-/);
  assert.equal(trackingResponse.body.tracking.courier, 'Drift & Co. Office Pickup');
  assert.equal(trackingResponse.body.tracking.timeline[2].title, 'Ready for Pickup');

  const invalidResponse = responseRecorder();
  await ordersHandler({
    method: 'POST',
    body: {
      customerName: 'Pickup Customer',
      phone: '09170000003',
      fulfillmentMethod: 'unknown',
      items,
    },
  }, invalidResponse);
  assert.equal(invalidResponse.statusCode, 400);
});

test('PayMongo signature verification rejects invalid signatures', async () => {
  assert.equal(verifyPaymongoWebhook(Buffer.from('{}'), 't=1,te=invalid,li=invalid'), false);
});

test('partner inquiries persist and notify through saved webhook and ntfy settings', async () => {
  notifications.length = 0;
  const response = responseRecorder();
  await inquiriesHandler({
    method: 'POST',
    body: {
      name: 'Test Partner',
      phone: '09171112222',
      email: 'partner@example.com',
      location: 'Manila',
      message: 'Interested in reselling.',
      packageType: 'Starter Package ₱988',
    },
  }, response);

  assert.equal(response.statusCode, 201);
  assert.equal(response.body.success, true);
  assert.equal(response.body.inquiry.notificationsSent.some(log => log.channel === 'Webhook Alert' && log.status === 'Sent'), true);
  assert.equal(response.body.inquiry.notificationsSent.some(log => log.channel === 'Instant Phone Alert (ntfy.sh/my-store-orders)' && log.status === 'Sent'), true);
  assert.equal(notifications.some(call => call.url === 'https://hooks.example.com/new-order' && JSON.parse(call.body).event === 'inquiry.created'), true);
  const ntfyInquiryAlert = notifications.find(call => call.url === 'https://ntfy.sh/my-store-orders');
  assert.match(ntfyInquiryAlert.body, /authenticated Studio dashboard/);
  assert.doesNotMatch(ntfyInquiryAlert.body, /Test Partner|09171112222|partner@example.com|Manila|reselling/i);

  const stored = [...(hashes.get('drift:inquiries') || new Map()).values()].map(JSON.parse);
  assert.equal(stored.length, 1);
  assert.equal(stored[0].name, 'Test Partner');

  const dashboardResponse = responseRecorder();
  await inquiriesHandler({ method: 'GET', headers: { 'x-studio-pin': studioPin } }, dashboardResponse);
  assert.equal(dashboardResponse.body.inquiries[0].name, 'Test Partner');
});

test('partner inquiry notification toggle suppresses external alerts', async () => {
  const key = 'drift:notification-settings';
  const previousSettings = values.get(key);
  const settings = JSON.parse(previousSettings);
  settings.notifyOwnerOnInquiry = false;
  values.set(key, JSON.stringify(settings));
  notifications.length = 0;
  const response = responseRecorder();

  try {
    await inquiriesHandler({
      method: 'POST',
      body: { name: 'Alerts Disabled', phone: '09173334444' },
    }, response);
    assert.equal(response.statusCode, 201);
    assert.equal(notifications.length, 0);
    assert.deepEqual(response.body.inquiry.notificationsSent.map(log => log.channel), ['App & Reseller Hub']);
  } finally {
    values.set(key, previousSettings);
  }
});

test('settings requests fail clearly when Redis credentials are unavailable', async () => {
  const originalUrl = process.env.UPSTASH_REDIS_REST_URL;
  const originalToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  const response = responseRecorder();

  try {
    await settingsHandler({ method: 'GET', headers: { 'x-studio-pin': studioPin } }, response);
    assert.equal(response.statusCode, 503);
    assert.match(response.body.error, /Upstash Redis is not configured/);
  } finally {
    process.env.UPSTASH_REDIS_REST_URL = originalUrl;
    process.env.UPSTASH_REDIS_REST_TOKEN = originalToken;
  }
});

test('notification settings reject requests without the Studio PIN', async () => {
  const response = responseRecorder();
  await settingsHandler({ method: 'GET', headers: {} }, response);
  assert.equal(response.statusCode, 401);
  assert.equal(response.body.success, false);
});

test('order details are not returned to requests without the Studio PIN', async () => {
  const response = responseRecorder();
  await ordersHandler({ method: 'GET', headers: {} }, response);
  assert.equal(response.statusCode, 401);
  assert.equal(response.body.success, false);
});

test('partner inquiry details are not returned without the Studio PIN', async () => {
  const response = responseRecorder();
  await inquiriesHandler({ method: 'GET', headers: {} }, response);
  assert.equal(response.statusCode, 401);
  assert.equal(response.body.success, false);
});

test('Studio authentication accepts only the configured server PIN', async () => {
  const denied = responseRecorder();
  await studioAuthHandler({ method: 'POST', headers: { 'x-studio-pin': '2010drift' } }, denied);
  assert.equal(denied.statusCode, 401);

  const accepted = responseRecorder();
  await studioAuthHandler({ method: 'POST', headers: { 'x-studio-pin': studioPin } }, accepted);
  assert.equal(accepted.statusCode, 200);
  assert.equal(accepted.body.success, true);
});

test('Studio authentication refuses a short configured PIN', async () => {
  const originalPin = process.env.STUDIO_ADMIN_PIN;
  try {
    process.env.STUDIO_ADMIN_PIN = 'weak-pin';
    const response = responseRecorder();
    await studioAuthHandler({ method: 'POST', headers: { 'x-studio-pin': 'weak-pin' } }, response);
    assert.equal(response.statusCode, 503);
  } finally {
    process.env.STUDIO_ADMIN_PIN = originalPin;
  }
});

test('payment settings are public to read and PIN-protected to update', async () => {
  const readResponse = responseRecorder();
  await paymentSettingsHandler({ method: 'GET', headers: {} }, readResponse);
  assert.equal(readResponse.statusCode, 200);
  assert.equal(readResponse.body.settings.gcashEnabled, false);
  assert.equal(readResponse.body.settings.qrphEnabled, true);

  const denied = responseRecorder();
  await paymentSettingsHandler({
    method: 'POST',
    headers: {},
    body: { gcashEnabled: true, gcashAccountName: 'Drift & Co. Store', gcashNumber: '09170000000' },
  }, denied);
  assert.equal(denied.statusCode, 401);

  const saved = responseRecorder();
  await paymentSettingsHandler({
    method: 'POST',
    headers: { 'x-studio-pin': studioPin },
    body: { gcashEnabled: true, gcashAccountName: 'Drift & Co. Store', gcashNumber: '09170000000' },
  }, saved);
  assert.equal(saved.statusCode, 200);
  assert.equal(saved.body.settings.gcashEnabled, true);

  const persisted = responseRecorder();
  await paymentSettingsHandler({ method: 'GET', headers: {} }, persisted);
  assert.equal(persisted.body.settings.gcashNumber, '09170000000');

  const missingDestination = responseRecorder();
  await paymentSettingsHandler({
    method: 'POST',
    headers: { 'x-studio-pin': studioPin },
    body: { bdoEnabled: true },
  }, missingDestination);
  assert.equal(missingDestination.statusCode, 400);
});

test('payment settings reject unsafe QR URLs and malformed types', async () => {
  const unsafeUrl = responseRecorder();
  await paymentSettingsHandler({
    method: 'POST',
    headers: { 'x-studio-pin': studioPin },
    body: { gcashQrUrl: 'javascript:alert(1)' },
  }, unsafeUrl);
  assert.equal(unsafeUrl.statusCode, 400);

  const invalidBoolean = responseRecorder();
  await paymentSettingsHandler({
    method: 'POST',
    headers: { 'x-studio-pin': studioPin },
    body: { gcashEnabled: 'true' },
  }, invalidBoolean);
  assert.equal(invalidBoolean.statusCode, 400);
});
