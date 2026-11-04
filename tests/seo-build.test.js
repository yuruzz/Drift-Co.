import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const SITE_URL = 'https://shop-driftco.vercel.app';

async function readDist(relativePath) {
  return readFile(path.join(DIST, relativePath), 'utf8');
}

test('build emits indexable sitemap URLs and blocks no important routes', async () => {
  const [sitemap, robots, vercel, home] = await Promise.all([
    readDist('sitemap.xml'),
    readFile(path.join(ROOT, 'public', 'robots.txt'), 'utf8'),
    readFile(path.join(ROOT, 'vercel.json'), 'utf8'),
    readDist('index.html')
  ]);
  const urls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(([, url]) => url);

  assert.equal(urls.length, 35);
  assert.equal(urls[0], `${SITE_URL}/`);
  assert.equal(urls.some(url => url.includes('/products/')), true);
  assert.equal(urls.some(url => url.includes('/collections/')), true);
  assert.equal(urls.some(url => url.includes('/journal/')), true);
  assert.equal(urls.includes(`${SITE_URL}/pages/perfume-reseller-philippines/`), true);
  assert.equal(urls.some(url => url.includes('/share-v2/')), false);
  assert.match(robots, /User-agent:\s*\*\s*Allow:\s*\/\s*Sitemap:\s*https:\/\/shop-driftco\.vercel\.app\/sitemap\.xml/s);
  assert.doesNotMatch(vercel, /"\(\/\.\*\)"/);
  assert.match(home, /<meta name="robots" content="index, follow"/);
  assert.match(home, /<h1\b[^>]*>[\s\S]*?Premium Long-Lasting[\s\S]*?Eau de Parfum in the Philippines/);
  assert.match(home, /<a[^>]+href="\/products\/baccarat-rouge-inspired-perfume\/"/);
  assert.match(home, /href="\/journal\/choose-long-lasting-perfume-philippines\/"/);
  assert.match(home, /href="\/pages\/perfume-reseller-philippines\/"/);
});

test('reseller landing page has unique metadata and accurate package details', async () => {
  const [html, home, cartScript] = await Promise.all([
    readDist('pages/perfume-reseller-philippines/index.html'),
    readDist('index.html'),
    readDist('js/cart.js')
  ]);
  const canonical = `${SITE_URL}/pages/perfume-reseller-philippines/`;
  assert.match(html, /<title>Perfume Reseller Philippines \| Drift &amp; Co\. Business Partner<\/title>/);
  assert.match(html, /<meta name="description" content=".{1,160}">/);
  assert.match(html, new RegExp(`<link rel="canonical" href="${canonical.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}">`));
  assert.match(html, /<h1>Perfume Reseller Philippines<\/h1>/);
  assert.match(html, /Starter Kit · ₱988/);
  assert.match(html, /one 40ml Eau de Parfum/);
  assert.match(html, /10 preferred testers/);
  assert.match(html, /href="\/#partner"/);
  assert.match(html, /application\/ld\+json/);
  assert.match(html, /<meta name="robots" content="index, follow">/);
  assert.match(home, /Starter Kit with 40ml EDP/);
  assert.doesNotMatch(home, /Starter Kit with 50ml EDP|1x 50ml EDP/);
  assert.match(cartScript, /Business Partner Kit \(1x 40ml EDP/);
  assert.doesNotMatch(cartScript, /Business Partner Kit \(1x 50ml EDP/);
});

test('every catalog product has a unique crawlable page and accurate offer schema', async () => {
  const sitemap = await readDist('sitemap.xml');
  const productUrls = [...sitemap.matchAll(new RegExp(`<loc>(${SITE_URL}/products/[^<]+)</loc>`, 'g'))]
    .map(([, url]) => url);
  const titles = new Set();
  assert.equal(productUrls.length, 20);

  for (const url of productUrls) {
    const relativePath = new URL(url).pathname.replace(/^\/|\/$/g, '');
    const html = await readDist(path.join(relativePath, 'index.html'));
    const title = html.match(/<title>(.*?)<\/title>/)?.[1];
    const description = html.match(/<meta name="description" content="(.*?)">/)?.[1];
    const canonical = html.match(/<link rel="canonical" href="(.*?)">/)?.[1];
    const structuredData = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      .map(([, json]) => JSON.parse(json));
    const productSchema = structuredData.flatMap(schema => Array.isArray(schema) ? schema : [schema])
      .find(schema => schema['@type'] === 'Product');

    assert.ok(title, `Missing title for ${url}`);
    assert.ok(description && description.length <= 160, `Missing or long description for ${url}`);
    assert.equal(titles.has(title), false, `Duplicate product title: ${title}`);
    titles.add(title);
    assert.equal(canonical, url);
    assert.match(html, /<meta name="robots" content="index, follow">/);
    assert.equal((html.match(/<h1\b/g) || []).length, 1);
    assert.match(html, /name="add-to-cart"/);
    assert.deepEqual(productSchema.offers.map(offer => offer.price).sort((a, b) => a - b), [380, 550]);
    assert.equal(productSchema.offers.every(offer => offer.priceCurrency === 'PHP'), true);
    assert.equal('aggregateRating' in productSchema, false);
    assert.doesNotMatch(html, /AggregateRating|aggregateRating/);
  }
});

test('journal and collection pages have unique metadata, canonical URLs, and structured data', async () => {
  const sitemap = await readDist('sitemap.xml');
  const contentUrls = [...sitemap.matchAll(new RegExp(`<loc>(${SITE_URL}/(?:journal|collections)/[^<]+)</loc>`, 'g'))]
    .map(([, url]) => url);
  const titles = new Set();
  assert.equal(contentUrls.length, 13);

  for (const url of contentUrls) {
    const relativePath = new URL(url).pathname.replace(/^\/|\/$/g, '');
    const html = await readDist(path.join(relativePath, 'index.html'));
    const title = html.match(/<title>(.*?)<\/title>/)?.[1];
    assert.ok(title);
    assert.equal(titles.has(title), false, `Duplicate content title: ${title}`);
    titles.add(title);
    assert.equal(html.includes(`<link rel="canonical" href="${url}">`), true);
    assert.match(html, /<meta name="robots" content="index, follow">/);
    assert.equal((html.match(/<h1\b/g) || []).length, 1);
    assert.match(html, /application\/ld\+json/);
  }
});

test('homepage fragrance journal uses a featured editorial and compact article list', async () => {
  const [home, sourceHome, styles] = await Promise.all([
    readDist('index.html'),
    readFile(path.join(ROOT, 'index.html'), 'utf8'),
    readFile(path.join(ROOT, 'public', 'css', 'style.css'), 'utf8')
  ]);
  const journal = home.match(/<section id="journal"[\s\S]*?<\/section>/)?.[0];
  const sourceJournal = sourceHome.match(/<section id="journal"[\s\S]*?<\/section>/)?.[0];
  assert.ok(journal, 'Missing homepage journal section');
  assert.ok(sourceJournal, 'Missing source homepage journal section');
  assert.match(journal, /THE FRAGRANCE JOURNAL/i);
  assert.match(journal, /<h2[^>]*>The Art of Fragrance<\/h2>/);
  assert.match(journal, /class="journal-feature"/);
  assert.match(journal, /class="journal-list"/);
  assert.match(journal, /src="\/share-preview\.jpg" alt="Drift &amp; Co\. fragrances arranged among greenery"/);
  assert.equal(new Set([...journal.matchAll(/href="(\/journal\/[^"]+\/)"/g)].map(([, url]) => url)).size, 7);
  assert.match(sourceJournal, /class="journal-feature"/);
  assert.match(sourceJournal, /class="journal-list"/);
  assert.equal(new Set([...sourceJournal.matchAll(/href="(\/journal\/[^"]+\/)"/g)].map(([, url]) => url)).size, 7);
  assert.doesNotMatch(sourceJournal, /SEO_JOURNAL_LINKS|drift-section-reveal|drift-stagger-item/);
  assert.match(styles, /\.journal-feature\s*\{[\s\S]*?grid-template-columns/);
  assert.match(styles, /@media \(max-width: 767px\)\s*\{[\s\S]*?\.journal-list\s*\{[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
});

test('homepage places the journal after the fragrance finder and business partners before tracking', async () => {
  const home = await readDist('index.html');
  const sectionPositions = [
    '<section id="scent-finder"',
    '<section id="journal"',
    '<section id="craftsmanship"',
    '<section id="testimonials"',
    '<section id="partner"',
    '<section id="track-order-section"'
  ].map(section => home.indexOf(section));
  assert.equal(sectionPositions.every(position => position >= 0), true);
  assert.deepEqual(sectionPositions, [...sectionPositions].sort((a, b) => a - b));
});

test('storefront uses compressed, dimensioned WebP product images and a real 404 page', async () => {
  const [home, catalogScript, notFound] = await Promise.all([
    readDist('index.html'),
    readDist('js/catalog-data.js'),
    readDist('404.html')
  ]);
  const sourceImage = await stat(path.join(ROOT, 'public', 'perfumes', 'Baccarat_Rouge.jfif'));
  const webpImage = await stat(path.join(DIST, 'perfumes', 'Baccarat_Rouge.webp'));
  const vercel = await readFile(path.join(ROOT, 'vercel.json'), 'utf8');

  assert.match(home, /fetchpriority="high"/);
  assert.match(home, /loading="lazy"/);
  assert.match(home, /\/hero\.webp/);
  assert.match(catalogScript, /\/perfumes\/Baccarat_Rouge\.webp/);
  assert.ok(webpImage.size < sourceImage.size, 'WebP image should be smaller than its JPEG source');
  assert.match(notFound, /name="robots" content="noindex, follow"/);
  assert.equal(path.join(DIST, '404.html') !== path.join(DIST, 'index.html'), true);
  assert.doesNotMatch(vercel, /"source"\s*:\s*"\/\(\.\*\)"/);

  const editorialSource = await stat(path.join(ROOT, 'public', 'share-preview.jpg'));
  const editorialWebp = await stat(path.join(DIST, 'share-preview.webp'));
  assert.ok(editorialWebp.size < editorialSource.size, 'Editorial WebP should be smaller than its JPEG source');
});
