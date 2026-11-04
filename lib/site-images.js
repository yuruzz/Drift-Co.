import { redisCommand } from './redis.js';

const SITE_IMAGES_KEY = 'drift:site-images';
const DEFAULT_SITE_IMAGES = {
  hero: null,
  partner: null,
  favicon: null,
  products: {},
};

function parseBody(body) {
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      const error = new Error('Request body must contain valid JSON.');
      error.statusCode = 400;
      throw error;
    }
  }
  return body && typeof body === 'object' && !Array.isArray(body) ? body : {};
}

function normalizeSiteImages(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...DEFAULT_SITE_IMAGES, products: {} };
  }
  return {
    ...DEFAULT_SITE_IMAGES,
    ...value,
    products: value.products && typeof value.products === 'object' && !Array.isArray(value.products)
      ? value.products
      : {},
  };
}

function validateImage(image) {
  if (typeof image !== 'string' || image.length > 1_500_000) {
    const error = new Error('Image must be a URL or image data under 1.5 MB.');
    error.statusCode = 400;
    throw error;
  }
  if (/^https?:\/\//i.test(image) || /^data:image\/[a-z0-9.+-]+;base64,/i.test(image)) return image;

  const error = new Error('Image must be an HTTP(S) URL or a base64 image data URL.');
  error.statusCode = 400;
  throw error;
}

export async function getSiteImages() {
  const saved = await redisCommand('GET', SITE_IMAGES_KEY);
  return normalizeSiteImages(saved ? JSON.parse(saved) : null);
}

export async function saveSiteImageChanges(body) {
  const siteImages = await getSiteImages();
  const payload = parseBody(body);

  if (payload.siteImages && typeof payload.siteImages === 'object' && !Array.isArray(payload.siteImages)) {
    for (const key of ['hero', 'partner', 'favicon']) {
      if (payload.siteImages[key] !== undefined) {
        siteImages[key] = payload.siteImages[key] === null ? null : validateImage(payload.siteImages[key]);
      }
    }
    if (payload.siteImages.products && typeof payload.siteImages.products === 'object' && !Array.isArray(payload.siteImages.products)) {
      for (const [id, image] of Object.entries(payload.siteImages.products)) {
        if (!/^\d+$/.test(id)) continue;
        siteImages.products[id] = validateImage(image);
      }
    }
  } else if (payload.target !== undefined && payload.image !== undefined) {
    const target = String(payload.target);
    const image = validateImage(payload.image);
    if (['hero', 'partner', 'favicon'].includes(target)) {
      siteImages[target] = image;
    } else if (/^\d+$/.test(target)) {
      siteImages.products[target] = image;
    } else {
      const error = new Error('Unknown image target.');
      error.statusCode = 400;
      throw error;
    }
  } else {
    for (const key of ['hero', 'partner', 'favicon']) {
      if (payload[key] !== undefined) {
        siteImages[key] = payload[key] === null ? null : validateImage(payload[key]);
      }
    }
    if (payload.products && typeof payload.products === 'object' && !Array.isArray(payload.products)) {
      for (const [id, image] of Object.entries(payload.products)) {
        if (/^\d+$/.test(id)) siteImages.products[id] = validateImage(image);
      }
    }
  }

  await redisCommand('SET', SITE_IMAGES_KEY, JSON.stringify(siteImages));
  return siteImages;
}

export async function resetSiteImages(body) {
  const payload = parseBody(body);
  const target = payload.target ? String(payload.target) : 'all';
  const siteImages = await getSiteImages();

  if (target === 'all') {
    Object.assign(siteImages, DEFAULT_SITE_IMAGES, { products: {} });
  } else if (['hero', 'partner', 'favicon'].includes(target)) {
    siteImages[target] = null;
  } else if (/^\d+$/.test(target)) {
    delete siteImages.products[target];
  } else {
    const error = new Error('Unknown image target.');
    error.statusCode = 400;
    throw error;
  }

  await redisCommand('SET', SITE_IMAGES_KEY, JSON.stringify(siteImages));
  return siteImages;
}
