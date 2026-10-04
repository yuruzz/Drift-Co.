import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example.com';
process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
process.env.STUDIO_ADMIN_PIN = 'test-studio-pin';

const { default: settingsHandler } = await import('../api/notifications/settings.js');
const { normalizeNtfyTopic } = await import('../lib/notifications.js');
const { default: ordersHandler } = await import('../api/orders.js');
const { default: inquiriesHandler } = await import('../api/partner-inquiries.js');
const { default: orderStatusHandler } = await import('../api/orders/[id]/status.js');
const { default: statsHandler } = await import('../api/stats.js');

const hashes = new Map();
const values = new Map();
const notifications = [];

globalThis.fetch = async (url, options) => {
  if (url === 'https://redis.example.com') {
    const command = JSON.parse(options.body);
    const [operation, key, field, value] = command;
    if (operation === 'GET') return jsonResponse(values.get(key) ?? null);
    if (operation === 'SET') {
      values.set(key, field);
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

  notifications.push({ url, body: options.body });
  return jsonResponse({ ok: true });
};

function jsonResponse(result) {
  return { ok: true, status: 200, json: async () => ({ result }) };
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

test('notification settings persist in Redis without returning secrets', async () => {
  const saveResponse = responseRecorder();
  await settingsHandler({
    method: 'POST',
    headers: { 'x-studio-pin': 'test-studio-pin' },
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
  await settingsHandler({ method: 'GET', headers: { 'x-studio-pin': 'test-studio-pin' } }, readResponse);
  assert.equal(readResponse.body.settings.ownerName, 'Studio Owner');
  assert.equal(readResponse.body.settings.webhookUrl, 'https://hooks.example.com/new-order');
  assert.equal(readResponse.body.settings.ntfyTopic, 'my-store-orders');
  assert.equal(notifications.some(call => call.url === 'https://ntfy.sh/my-store-orders'), false);

  const maskedSaveResponse = responseRecorder();
  await settingsHandler({
    method: 'POST',
    headers: { 'x-studio-pin': 'test-studio-pin' },
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
      items: [{ name: 'Test Fragrance', price: 500, qty: 1, volume: '50ml' }],
      total: 500,
    },
  }, orderResponse);

  assert.equal(orderResponse.statusCode, 201);
  assert.equal(orderResponse.body.success, true);
  assert.equal(orderResponse.body.order.notificationsSent.some(log => log.channel === 'Webhook Alert' && log.status === 'Sent'), true);
  assert.equal(orderResponse.body.order.notificationsSent.some(log => log.channel === 'Instant Phone Alert (ntfy.sh/my-store-orders)' && log.status === 'Sent'), true);
  assert.equal(notifications.some(call => call.url === 'https://hooks.example.com/new-order'), true);
  assert.equal(notifications.some(call => call.url === 'https://ntfy.sh/my-store-orders'), true);

  const orders = [...(hashes.get('drift:orders') || new Map()).values()].map(JSON.parse);
  assert.equal(orders.length, 1);
  assert.equal(orders[0].customerName, 'Test Customer');

  const statusResponse = responseRecorder();
  await orderStatusHandler({
    method: 'PATCH',
    headers: { 'x-studio-pin': 'test-studio-pin' },
    query: { id: orderResponse.body.order.id },
    body: { status: 'Confirmed' },
  }, statusResponse);
  assert.equal(statusResponse.body.order.status, 'Confirmed');

  const dashboardResponse = responseRecorder();
  await ordersHandler({ method: 'GET', headers: { 'x-studio-pin': 'test-studio-pin' } }, dashboardResponse);
  assert.equal(dashboardResponse.body.orders[0].status, 'Confirmed');

  const statsResponse = responseRecorder();
  await statsHandler({ method: 'GET' }, statsResponse);
  assert.deepEqual(statsResponse.body.stats, { totalOrders: 1, totalRevenue: 500, totalInquiries: 0 });
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
  assert.equal(notifications.some(call => call.url === 'https://ntfy.sh/my-store-orders' && call.body.includes('Test Partner')), true);

  const stored = [...(hashes.get('drift:inquiries') || new Map()).values()].map(JSON.parse);
  assert.equal(stored.length, 1);
  assert.equal(stored[0].name, 'Test Partner');

  const dashboardResponse = responseRecorder();
  await inquiriesHandler({ method: 'GET', headers: { 'x-studio-pin': 'test-studio-pin' } }, dashboardResponse);
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
    await settingsHandler({ method: 'GET', headers: { 'x-studio-pin': 'test-studio-pin' } }, response);
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
