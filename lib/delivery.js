import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { redisCommand } from './redis.js';
import { calculateOrderPricing } from './order-pricing.js';

export const DELIVERY_PRICING = {
  freeDeliveryThreshold: 1500,
  freeDeliveryBasis: 'bottleSubtotal',
};

export const DELIVERY_ORIGINS = [
  { name: 'Bulilan Norte, Pila, Laguna', latitude: 14.2376712, longitude: 121.3644522 },
  { name: 'Calamba City Hall, Calamba, Laguna', latitude: 14.1940522, longitude: 121.1596881 },
];

export const JNT_ISLAND_PROVINCES = [
  'Basilan',
  'Batanes',
  'Catanduanes',
  'Marinduque',
  'Masbate',
  'Occidental Mindoro',
  'Oriental Mindoro',
  'Palawan',
  'Romblon',
  'Sulu',
  'Tawi-Tawi',
];

const JNT_RATE_TIERS = [
  { maxWeight: 500, rates: { Luzon: 85, Manila: 95, Visayas: 100, Mindanao: 105, Island: 115 } },
  { maxWeight: 1000, rates: { Luzon: 155, Manila: 165, Visayas: 180, Mindanao: 195, Island: 205 } },
  { maxWeight: 3000, rates: { Luzon: 180, Manila: 190, Visayas: 200, Mindanao: 220, Island: 230 } },
  { maxWeight: 4000, rates: { Luzon: 270, Manila: 280, Visayas: 300, Mindanao: 330, Island: 340 } },
  { maxWeight: 5000, rates: { Luzon: 360, Manila: 370, Visayas: 400, Mindanao: 440, Island: 450 } },
  { maxWeight: 6000, rates: { Luzon: 455, Manila: 465, Visayas: 500, Mindanao: 550, Island: 560 } },
];

const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org';
const OSRM_BASE_URL = 'https://router.project-osrm.org';
const NOMINATIM_USER_AGENT = 'DriftAndCoFragranceCatalog/1.0 (https://driftco-website.vercel.app)';
const NOMINATIM_CACHE_TTL_MS = 60 * 60 * 1000;
const NOMINATIM_CACHE_TTL_SECONDS = 60 * 60;
const NOMINATIM_RATE_LIMIT_KEY = 'drift:nominatim:request-slot';
const LOCAL_DELIVERY_QUOTE_SECRET = randomBytes(32).toString('hex');
const QUOTE_TTL_MS = 30 * 60 * 1000;
const REGION_BOUNDS = { minLat: 4.3, maxLat: 21.5, minLon: 116.8, maxLon: 127.0 };

const nominatimCache = new Map();
let nominatimQueue = Promise.resolve();
let lastNominatimRequestAt = 0;

function serviceError(message, statusCode = 502) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function cacheNominatimResult(url, value) {
  const now = Date.now();
  for (const [key, entry] of nominatimCache) {
    if (entry.expiresAt <= now) nominatimCache.delete(key);
  }
  if (nominatimCache.size >= 500) {
    nominatimCache.delete(nominatimCache.keys().next().value);
  }
  nominatimCache.set(url, { value, expiresAt: now + NOMINATIM_CACHE_TTL_MS });
}

function assertPhilippineCoordinates(latitude, longitude) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
    || latitude < REGION_BOUNDS.minLat || latitude > REGION_BOUNDS.maxLat
    || longitude < REGION_BOUNDS.minLon || longitude > REGION_BOUNDS.maxLon) {
    throw serviceError('Choose a delivery address in the Philippines.', 400);
  }
}

async function fetchJson(url, options, errorMessage) {
  let response;
  try {
    response = await fetch(url, { ...options, signal: AbortSignal.timeout(12000) });
  } catch {
    throw serviceError(errorMessage);
  }

  let result;
  try {
    result = await response.json();
  } catch {
    throw serviceError(errorMessage);
  }

  if (!response.ok) throw serviceError(errorMessage);
  return result;
}

async function fetchNominatim(url) {
  const requestUrl = String(url);
  const cacheKey = `drift:nominatim:cache:${createHash('sha256').update(requestUrl).digest('hex')}`;
  if (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL) {
    const cachedJson = await redisCommand('GET', cacheKey);
    if (cachedJson) {
      try {
        return JSON.parse(cachedJson);
      } catch (error) {
        console.error('Ignoring invalid cached Nominatim response:', error);
      }
    }
  }
  const cached = nominatimCache.get(requestUrl);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const request = nominatimQueue.then(async () => {
    const hasRedis = Boolean(process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL);
    if (hasRedis) {
      while (await redisCommand(
        'SET',
        NOMINATIM_RATE_LIMIT_KEY,
        String(Date.now()),
        'NX',
        'PX',
        '1100',
      ) !== 'OK') {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      const cachedJson = await redisCommand('GET', cacheKey);
      if (cachedJson) {
        try {
          return JSON.parse(cachedJson);
        } catch (error) {
          console.error('Ignoring invalid cached Nominatim response:', error);
        }
      }
    }
    const secondSinceLastRequest = Date.now() - lastNominatimRequestAt;
    if (!hasRedis && secondSinceLastRequest < 1000) {
      await new Promise(resolve => setTimeout(resolve, 1000 - secondSinceLastRequest));
    }
    lastNominatimRequestAt = Date.now();
    const result = await fetchJson(requestUrl, {
      headers: {
        'User-Agent': NOMINATIM_USER_AGENT,
        'Accept': 'application/json',
      },
    }, 'The free address search service is temporarily unavailable.');
    cacheNominatimResult(requestUrl, result);
    if (hasRedis) {
      await redisCommand('SET', cacheKey, JSON.stringify(result), 'EX', String(NOMINATIM_CACHE_TTL_SECONDS));
    }
    return result;
  });
  nominatimQueue = request.catch(() => {});
  return request;
}

export async function searchDeliveryAddresses(query) {
  const search = typeof query === 'string' ? query.trim() : '';
  if (search.length < 3 || search.length > 160) {
    throw serviceError('Enter an address between 3 and 160 characters.', 400);
  }

  const url = new URL('/search', NOMINATIM_BASE_URL);
  url.searchParams.set('q', search);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('countrycodes', 'ph');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('limit', '5');

  const matches = await fetchNominatim(url);
  if (!Array.isArray(matches)) {
    throw serviceError('The free address search service returned an invalid response.');
  }

  return matches.flatMap(match => {
    const latitude = Number(match.lat);
    const longitude = Number(match.lon);
    if (typeof match.display_name !== 'string') return [];
    try {
      assertPhilippineCoordinates(latitude, longitude);
    } catch {
      return [];
    }
    return [{ latitude, longitude, address: match.display_name }];
  });
}

function normalizeAdminArea(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function classifyJntZone(address = {}) {
  const fields = Object.values(address).map(normalizeAdminArea).filter(Boolean);
  const allAreas = fields.join(' ');
  const isIslandProvince = JNT_ISLAND_PROVINCES.some(province => {
    const normalizedProvince = normalizeAdminArea(province);
    return fields.some(field => field === normalizedProvince
      || field.includes(` ${normalizedProvince} `)
      || field.startsWith(`${normalizedProvince} `)
      || field.endsWith(` ${normalizedProvince}`));
  });
  if (isIslandProvince) return 'Island';
  if (allAreas.includes('metro manila') || allAreas.includes('national capital')
    || allAreas.includes('ncr') || allAreas.includes('ph 00')) return 'Manila';
  if (/\b(central visayas|eastern visayas|western visayas|negros island region|region vii|region viii|region vi)\b/.test(allAreas)
    || /\bph 0[678]\b/.test(allAreas)) return 'Visayas';
  if (/\b(zamboanga peninsula|northern mindanao|davao region|soccsksargen|caraga|barmm|region ix|region x|region xi|region xii|region xiii)\b/.test(allAreas)
    || /\bph (09|10|11|12|13|14)\b/.test(allAreas)) return 'Mindanao';
  if (/\b(ilocos|cagayan valley|central luzon|calabarzon|mimaropa|bicol region|cordillera|region i|region ii|region iii|region iv a|region iv b|region v|car)\b/.test(allAreas)
    || /\bph (01|02|03|04|05|15|40|41)\b/.test(allAreas)) return 'Luzon';
  return null;
}

export function calculateJntDeliveryFee(shippingWeightGrams, zone, bottleSubtotal) {
  if (!Number.isSafeInteger(shippingWeightGrams) || shippingWeightGrams < 0
    || !Number.isFinite(bottleSubtotal) || bottleSubtotal < 0) {
    throw serviceError('Order shipping weight and bottle subtotal must be valid non-negative values.', 400);
  }
  if (bottleSubtotal > DELIVERY_PRICING.freeDeliveryThreshold) return 0;
  if (!zone || shippingWeightGrams === 0 || shippingWeightGrams > 6000) return null;
  const tier = JNT_RATE_TIERS.find(rateTier => shippingWeightGrams <= rateTier.maxWeight);
  return tier ? tier.rates[zone] : null;
}

function getQuoteSecret() {
  const secret = process.env.DELIVERY_QUOTE_SECRET
    || process.env.STUDIO_ADMIN_PIN
    || (process.env.NODE_ENV === 'production' ? '' : LOCAL_DELIVERY_QUOTE_SECRET);
  if (!secret || secret.length < 32) {
    throw serviceError('Delivery quote signing is not configured. Please contact the store.', 503);
  }
  return secret;
}

function signQuotePayload(payload) {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', getQuoteSecret())
    .update(`drift-delivery-quote:${encodedPayload}`)
    .digest('base64url');
  return `${encodedPayload}.${signature}`;
}

function verifyQuoteToken(token) {
  if (typeof token !== 'string' || token.length > 4096) {
    throw serviceError('Select an address and recalculate its delivery quote.', 400);
  }
  const [encodedPayload, suppliedSignature, extra] = token.split('.');
  if (!encodedPayload || !suppliedSignature || extra) {
    throw serviceError('The delivery quote is invalid. Select your address again.', 400);
  }

  const expectedSignature = createHmac('sha256', getQuoteSecret())
    .update(`drift-delivery-quote:${encodedPayload}`)
    .digest();
  let providedSignature;
  try {
    providedSignature = Buffer.from(suppliedSignature, 'base64url');
  } catch {
    throw serviceError('The delivery quote is invalid. Select your address again.', 400);
  }
  if (providedSignature.length !== expectedSignature.length
    || !timingSafeEqual(providedSignature, expectedSignature)) {
    throw serviceError('The delivery quote is invalid. Select your address again.', 400);
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  } catch {
    throw serviceError('The delivery quote is invalid. Select your address again.', 400);
  }
  if (payload.expiresAt <= Date.now()) {
    throw serviceError('The delivery quote expired. Select your address again.', 400);
  }
  return payload;
}

async function getNearestDeliveryOrigin(latitude, longitude) {
  const coordinates = [
    ...DELIVERY_ORIGINS.map(origin => `${origin.longitude},${origin.latitude}`),
    `${longitude},${latitude}`,
  ].join(';');
  const tableUrl = `${OSRM_BASE_URL}/table/v1/driving/${coordinates}?sources=0;1&destinations=2&annotations=distance`;
  const table = await fetchJson(tableUrl, {
    headers: { 'Accept': 'application/json' },
  }, 'The free road-routing service could not find a route from either dispatch office.');
  const distances = table.distances;
  if (table.code !== 'Ok' || !Array.isArray(distances) || distances.length !== DELIVERY_ORIGINS.length) {
    throw serviceError('The road-routing service could not find a route from either dispatch office.', 400);
  }
  const candidates = distances.flatMap((row, index) => {
    const distanceMeters = row?.[0];
    return typeof distanceMeters === 'number' && Number.isFinite(distanceMeters) && distanceMeters >= 0
      ? [{ origin: DELIVERY_ORIGINS[index], distanceMeters }]
      : [];
  });
  candidates.sort((a, b) => a.distanceMeters - b.distanceMeters);
  if (!candidates.length) {
    throw serviceError('The road-routing service could not find a route from either dispatch office.', 400);
  }
  return candidates[0];
}

function getManualShippingReasons(pricing, zone, deliveryFee) {
  const reasons = [];
  if (pricing.partnerKitCount > 0) {
    reasons.push('Starter Kit shipping requires manual confirmation.');
  }
  if (pricing.shippingWeightGrams > 6000) {
    reasons.push('Orders over 6 kg require manual shipping confirmation.');
  }
  if (!zone) {
    reasons.push('This destination is not mapped to a J&T rate zone; shipping requires manual confirmation.');
  }
  if (deliveryFee === null && pricing.shippingWeightGrams <= 6000 && zone) {
    reasons.push('A J&T rate is unavailable for this shipment; shipping requires manual confirmation.');
  }
  return reasons;
}

export async function getDeliveryQuote(latitude, longitude, items) {
  const lat = Number(latitude);
  const lon = Number(longitude);
  assertPhilippineCoordinates(lat, lon);
  const pricing = calculateOrderPricing(items);

  const reverseUrl = new URL('/reverse', NOMINATIM_BASE_URL);
  reverseUrl.searchParams.set('lat', String(lat));
  reverseUrl.searchParams.set('lon', String(lon));
  reverseUrl.searchParams.set('format', 'jsonv2');
  reverseUrl.searchParams.set('addressdetails', '1');
  const place = await fetchNominatim(reverseUrl);
  if (place?.address?.country_code?.toLowerCase() !== 'ph'
    || typeof place.display_name !== 'string'
    || !place.display_name.trim()) {
    throw serviceError('Choose a valid, mappable delivery address in the Philippines.', 400);
  }

  const zone = classifyJntZone(place.address);
  const { origin, distanceMeters } = await getNearestDeliveryOrigin(lat, lon);
  const deliveryFee = calculateJntDeliveryFee(
    pricing.shippingWeightGrams,
    zone,
    pricing.bottleSubtotal,
  );
  const shippingConfirmationReasons = getManualShippingReasons(pricing, zone, deliveryFee);

  const distanceKm = Math.round((distanceMeters / 1000) * 100) / 100;
  const payload = {
    latitude: lat,
    longitude: lon,
    address: place.display_name,
    subtotal: pricing.subtotal,
    bottleSubtotal: pricing.bottleSubtotal,
    shippingWeightGrams: pricing.shippingWeightGrams,
    partnerKitCount: pricing.partnerKitCount,
    zone,
    origin,
    distanceMeters,
    deliveryFee,
    shippingConfirmationReasons,
    expiresAt: Date.now() + QUOTE_TTL_MS,
  };
  return {
    ...payload,
    origin: origin.name,
    distanceKm,
    pricing: DELIVERY_PRICING,
    deliveryToken: signQuotePayload(payload),
  };
}

export function verifyDeliveryQuote(token, items) {
  const quote = verifyQuoteToken(token);
  const pricing = calculateOrderPricing(items);
  assertPhilippineCoordinates(quote.latitude, quote.longitude);
  if (typeof quote.address !== 'string' || !quote.address.trim()
    || !Number.isFinite(quote.distanceMeters) || quote.distanceMeters < 0
    || !DELIVERY_ORIGINS.some(origin => origin.name === quote.origin?.name
      && origin.latitude === quote.origin?.latitude
      && origin.longitude === quote.origin?.longitude)
    || quote.subtotal !== pricing.subtotal
    || quote.bottleSubtotal !== pricing.bottleSubtotal
    || quote.shippingWeightGrams !== pricing.shippingWeightGrams
    || quote.partnerKitCount !== pricing.partnerKitCount) {
    throw serviceError('The delivery quote is invalid. Select your address again.', 400);
  }

  const expectedFee = calculateJntDeliveryFee(
    pricing.shippingWeightGrams,
    quote.zone,
    pricing.bottleSubtotal,
  );
  if (quote.deliveryFee !== expectedFee
    || !Array.isArray(quote.shippingConfirmationReasons)
    || typeof quote.zone !== 'string' && quote.zone !== null) {
    throw serviceError('The delivery quote is invalid. Select your address again.', 400);
  }
  const shippingConfirmationReasons = getManualShippingReasons(pricing, quote.zone, expectedFee);
  const distanceKm = Math.round((quote.distanceMeters / 1000) * 100) / 100;
  return {
    address: quote.address,
    distanceKm,
    deliveryFee: expectedFee,
    shippingWeightGrams: pricing.shippingWeightGrams,
    bottleSubtotal: pricing.bottleSubtotal,
    zone: quote.zone,
    origin: quote.origin.name,
    shippingConfirmationRequired: shippingConfirmationReasons.length > 0,
    shippingConfirmationReasons,
  };
}
