export async function redisCommand(...command) {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!redisUrl || !redisToken) {
    const error = new Error('Upstash Redis is not configured. Add UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN to the Vercel project environment variables.');
    error.statusCode = 503;
    throw error;
  }

  const response = await fetch(redisUrl.replace(/\/+$/, ''), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${redisToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  });

  const result = await response.json();
  if (!response.ok || result.error) {
    throw new Error(result.error || `Upstash Redis returned HTTP ${response.status}.`);
  }

  return result.result;
}

export async function getHash(key) {
  const entries = await redisCommand('HGETALL', key);
  if (!Array.isArray(entries)) return {};

  const records = {};
  for (let index = 0; index < entries.length; index += 2) {
    records[entries[index]] = JSON.parse(entries[index + 1]);
  }
  return records;
}

export async function getRecord(key, id) {
  const value = await redisCommand('HGET', key, id);
  return value ? JSON.parse(value) : null;
}

export async function saveRecord(key, id, value) {
  await redisCommand('HSET', key, id, JSON.stringify(value));
}
