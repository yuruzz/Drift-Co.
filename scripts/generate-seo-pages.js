import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { fragranceJournal } from './fragrance-journal.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE_URL = 'https://shop-driftco.vercel.app';

const collections = [
  {
    slug: 'citrus-fresh',
    category: 'citrus',
    title: 'Citrus & Fresh Perfumes',
    description: 'Browse Drift & Co. citrus fragrances and fresh profiles. Compare each perfume’s published description and note pyramid before choosing.'
  },
  {
    slug: 'aromatic-oceanic',
    category: 'aromatic',
    title: 'Aromatic & Oceanic Perfumes',
    description: 'Explore aromatic fragrances in the Drift & Co. catalog, including the published notes and sizes for each edition.'
  },
  {
    slug: 'woody-amber',
    category: 'woody',
    title: 'Woody & Amber Perfumes',
    description: 'Browse woody fragrances and amber accords from Drift & Co. Read the product descriptions and listed fragrance notes.'
  },
  {
    slug: 'floral-powdery',
    category: 'floral',
    title: 'Floral & Powdery Perfumes',
    description: 'Explore floral and powdery fragrance profiles in the Drift & Co. catalog, with product notes and bottle options.'
  },
  {
    slug: 'fruity-sweet',
    category: 'fruity',
    title: 'Fruity & Sweet Perfumes',
    description: 'Compare fruity fragrance profiles from Drift & Co. using each product’s published description and fragrance notes.'
  },
  {
    slug: 'vanilla-gourmand',
    category: 'vanilla',
    title: 'Vanilla & Gourmand Perfumes',
    description: 'Browse vanilla and gourmand fragrance profiles from Drift & Co., including the listed notes and available bottle sizes.'
  }
];

const collectionDescriptions = new Map(collections.map(collection => [collection.category, collection]));

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function slugify(value) {
  const normalized = value.toLowerCase() === 'polosport' ? 'polo sport' : value;
  return normalized
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function productSlug(product) {
  return `${slugify(product.name)}-inspired-perfume`;
}

function productUrl(product) {
  return `/products/${productSlug(product)}/`;
}

function compactDescription(value, maxLength = 155) {
  const text = String(value).replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  const clipped = text.slice(0, maxLength - 1);
  return `${clipped.slice(0, clipped.lastIndexOf(' '))}…`;
}

function parseProducts(source) {
  const sandbox = {};
  vm.runInNewContext(`${source}\nglobalThis.__seoProducts = products;`, sandbox, {
    filename: 'public/js/catalog-data.js',
    timeout: 1000
  });
  const products = sandbox.__seoProducts;
  if (!Array.isArray(products) || products.length === 0) {
    throw new Error('The fragrance catalog did not contain any products.');
  }

  const slugs = new Set();
  for (const product of products) {
    if (!product.name || !product.description || !product.image || !Array.isArray(product.sizes)) {
      throw new Error(`Catalog product ${product.id} is missing SEO page data.`);
    }
    const slug = productSlug(product);
    if (slugs.has(slug)) throw new Error(`Duplicate product URL slug: ${slug}`);
    slugs.add(slug);
    if (product.sizes.length !== 2
      || product.sizes[0].volume !== '40ml' || product.sizes[0].price !== 380
      || product.sizes[1].volume !== '50ml' || product.sizes[1].price !== 550) {
      throw new Error(`Unexpected bottle sizes or prices for ${product.name}.`);
    }
  }
  return products;
}

function jsonLd(data) {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

function pageHead({ title, description, canonical, image, structuredData, type = 'website' }) {
  const absoluteImage = image ? `${SITE_URL}${image}` : `${SITE_URL}/share-preview.jpg`;
  return `<!doctype html>
<html lang="en-PH">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="${SITE_URL}${canonical}">
  <meta property="og:type" content="${escapeHtml(type)}">
  <meta property="og:site_name" content="Drift &amp; Co.">
  <meta property="og:locale" content="en_PH">
  <meta property="og:url" content="${SITE_URL}${canonical}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:image" content="${absoluteImage}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:url" content="${SITE_URL}${canonical}">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${absoluteImage}">
  <meta property="og:image:alt" content="Drift &amp; Co. Eau de Parfum in the Philippines">
  <meta name="twitter:image:alt" content="Drift &amp; Co. Eau de Parfum in the Philippines">
  <link rel="icon" href="/favicon-32x32.png" sizes="32x32">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;500;600&family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root{color-scheme:light;--ink:#1a1817;--paper:#faf8f5;--sand:#f3eee7;--gold:#9e7d3b;--line:#e8e2d8;--muted:#736e68;font-family:"Plus Jakarta Sans",Arial,sans-serif;color:var(--ink);background:var(--paper)}
    *{box-sizing:border-box}body{margin:0;line-height:1.65}a{color:inherit}a:hover{color:var(--gold)}.site-header{border-bottom:1px solid var(--line);background:var(--paper)}.nav{max-width:1120px;margin:auto;padding:18px 24px;display:flex;justify-content:space-between;align-items:center;gap:20px}.brand{font-family:"Cormorant Garamond",Georgia,serif;font-size:26px;letter-spacing:.12em;text-decoration:none}.nav-links{display:flex;gap:22px;flex-wrap:wrap;font-size:12px}.nav-links a{color:var(--muted);text-decoration:none}.page{max-width:1120px;margin:0 auto;padding:32px 24px 80px}.breadcrumbs{font-size:12px;color:var(--muted);margin:0 0 28px}.breadcrumbs a{color:var(--gold)}h1,h2,h3{font-family:"Cormorant Garamond",Georgia,serif;font-weight:400;line-height:1.15}h1{font-size:clamp(38px,6vw,64px);margin:0 0 18px}h2{font-size:32px;margin:42px 0 12px}h3{font-size:23px;margin:0 0 8px}.lede{font-size:18px;color:#514b45;max-width:720px}.product{display:grid;grid-template-columns:minmax(0, .9fr) minmax(0,1.1fr);gap:56px;align-items:start}.product-image{width:100%;height:auto;max-height:720px;object-fit:cover;background:var(--sand);border:1px solid var(--line)}.eyebrow{font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--gold);font-weight:600}.facts{display:flex;gap:10px;flex-wrap:wrap;margin:20px 0}.tag{border:1px solid var(--line);padding:5px 10px;font-size:11px;text-transform:uppercase;letter-spacing:.08em}.notes{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:26px 0}.note{border-top:1px solid var(--line);padding-top:12px;font-size:13px}.note strong{display:block;color:var(--gold);font-size:10px;letter-spacing:.12em;text-transform:uppercase;margin-bottom:6px}.shop-form{display:flex;align-items:end;gap:12px;flex-wrap:wrap;border-top:1px solid var(--line);padding-top:20px;margin-top:24px}.shop-form label{display:grid;gap:6px;font-size:11px;text-transform:uppercase;letter-spacing:.1em}.shop-form select{min-width:170px;padding:12px;border:1px solid var(--line);background:white;font:inherit}.button{border:0;background:var(--ink);color:white;padding:13px 22px;text-decoration:none;font:600 11px "Plus Jakarta Sans",Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase;cursor:pointer}.button:hover{background:var(--gold);color:white}.text-link{color:var(--gold)}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;margin-top:24px}.card{background:white;border:1px solid var(--line);padding:20px;text-decoration:none}.card p{font-size:13px;color:var(--muted)}.article{max-width:760px;margin:auto}.article section p{color:#514b45}.site-footer{border-top:1px solid var(--line);padding:24px;text-align:center;color:var(--muted);font-size:12px}.no-js-note{font-size:12px;color:var(--muted)}@media(max-width:720px){.nav{align-items:flex-start;flex-direction:column}.nav-links{gap:12px}.page{padding:24px 18px 56px}.product{grid-template-columns:1fr;gap:28px}.product-image{max-height:560px}.notes{grid-template-columns:1fr}.shop-form{align-items:stretch;flex-direction:column}.shop-form select,.button{width:100%;text-align:center}}
  </style>
  <script type="application/ld+json">${jsonLd(structuredData)}</script>
</head>`;
}

function siteHeader() {
  return `<header class="site-header"><nav class="nav" aria-label="Main navigation"><a class="brand" href="/">DRIFT &amp; CO.</a><div class="nav-links"><a href="/#collection">Fragrance catalog</a><a href="/#scent-finder">Fragrance finder</a><a href="/#partner">Business partners</a><a href="/#journal">Fragrance journal</a></div></nav></header>`;
}

function siteFooter() {
  return `<footer class="site-footer"><a href="/#collection">Shop the Drift &amp; Co. fragrance catalog</a> · <a href="/pages/perfume-reseller-philippines/">Perfume reseller inquiries</a></footer>`;
}

function breadcrumbStructuredData(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: `${SITE_URL}${item.path}`
    }))
  };
}

function productPage(product) {
  const slug = productSlug(product);
  const canonical = productUrl(product);
  const category = collectionDescriptions.get(product.category);
  const image = product.image.replace(/\.jfif$/i, '.webp');
  const title = `${product.name} Inspired Perfume | Drift & Co. Philippines`;
  const description = compactDescription(`${product.description} Shop ${product.name} Eau de Parfum in the Philippines in 40ml and 50ml sizes.`);
  const productSchema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: `${product.name} Eau de Parfum`,
    description: product.description,
    image: `${SITE_URL}${image}`,
    sku: `DRIFT-${product.id}`,
    category: category?.title || 'Eau de Parfum',
    brand: { '@type': 'Brand', name: 'Drift & Co.' },
    additionalProperty: [
      { '@type': 'PropertyValue', name: 'Fragrance oil concentration', value: '30%' },
      { '@type': 'PropertyValue', name: 'Fragrance family', value: product.category },
      { '@type': 'PropertyValue', name: 'For', value: product.gender }
    ],
    offers: product.sizes.map(size => ({
      '@type': 'Offer',
      url: `${SITE_URL}${canonical}`,
      priceCurrency: 'PHP',
      price: size.price,
      description: `${size.volume} bottle`
    }))
  };
  const breadcrumb = breadcrumbStructuredData([
    { name: 'Home', path: '/' },
    { name: 'Fragrance Catalog', path: '/#collection' },
    { name: `${product.name} Eau de Parfum`, path: canonical }
  ]);
  const notes = [
    ['Top notes', product.topNotes],
    ['Heart notes', product.heartNotes],
    ['Base notes', product.baseNotes]
  ].filter(([, value]) => value);
  const relatedCategory = category
    ? `<a class="text-link" href="/collections/${escapeHtml(category.slug)}/">Browse ${escapeHtml(category.title.toLowerCase())}</a>`
    : '';
  return `${pageHead({ title, description, canonical, image, structuredData: [productSchema, breadcrumb], type: 'product' })}
<body>
  ${siteHeader()}
  <main class="page">
    <nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/#collection">Fragrance catalog</a> / ${escapeHtml(product.name)}</nav>
    <article class="product">
      <img class="product-image" src="${escapeHtml(image)}" alt="${escapeHtml(`${product.name} Eau de Parfum bottle by Drift & Co.`)}" width="896" height="1195" fetchpriority="high" decoding="async">
      <div>
        <span class="eyebrow">${escapeHtml(product.gender)} · ${escapeHtml(category?.title || 'Eau de Parfum')}</span>
        <h1>${escapeHtml(product.name)} Eau de Parfum</h1>
        <p class="lede">${escapeHtml(product.description)}</p>
        <p>Inspired by ${escapeHtml(product.inspiration)}. Drift &amp; Co. describes its Eau de Parfum as formulated with 30% fragrance oil.</p>
        <div class="facts"><span class="tag">40ml · ₱380</span><span class="tag">50ml · ₱550</span><span class="tag">Made for ${escapeHtml(product.gender.toLowerCase())}</span></div>
        ${notes.length ? `<h2>Fragrance notes</h2><div class="notes">${notes.map(([label, value]) => `<div class="note"><strong>${escapeHtml(label)}</strong>${escapeHtml(value)}</div>`).join('')}</div>` : ''}
        <form class="shop-form" action="/" method="get">
          <input type="hidden" name="add-to-cart" value="${Number(product.id)}">
          <label for="size-${Number(product.id)}">Bottle size
            <select id="size-${Number(product.id)}" name="size">
              ${product.sizes.map(size => `<option value="${escapeHtml(size.volume)}">${escapeHtml(size.volume)} · ₱${Number(size.price).toFixed(2)}</option>`).join('')}
            </select>
          </label>
          <button class="button" type="submit">Add to bag</button>
        </form>
        <p class="no-js-note">Adding to your bag opens the store catalog checkout.</p>
        <p><a class="text-link" href="/#collection">Explore the full fragrance catalog</a>${relatedCategory ? ` · ${relatedCategory}` : ''}</p>
      </div>
    </article>
    <section><h2>Explore more fragrances</h2><p>Compare the listed notes and bottle sizes across the Drift &amp; Co. collection.</p><div class="cards"><a class="card" href="/#scent-finder"><h3>Find a fragrance family</h3><p>Use the fragrance finder to browse by scent profile.</p></a><a class="card" href="/pages/perfume-reseller-philippines/"><h3>Perfume reseller Philippines</h3><p>Read about the business partner package and contact Drift &amp; Co.</p></a></div></section>
  </main>
  ${siteFooter()}
</body></html>`;
}

function productCard(product) {
  const canonical = productUrl(product);
  return `<a class="card" href="${escapeHtml(canonical)}"><h2>${escapeHtml(product.name)} Eau de Parfum</h2><p>${escapeHtml(compactDescription(product.description, 140))}</p><span class="eyebrow">40ml ₱380 · 50ml ₱550</span></a>`;
}

function collectionPage(collection, products) {
  const canonical = `/collections/${collection.slug}/`;
  const matchingProducts = products.filter(product => product.category === collection.category);
  const title = `${collection.title} | Drift & Co. Philippines`;
  const description = compactDescription(collection.description);
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: collection.title,
    description,
    url: `${SITE_URL}${canonical}`,
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: matchingProducts.map((product, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: `${SITE_URL}${productUrl(product)}`,
        name: `${product.name} Eau de Parfum`
      }))
    }
  };
  const breadcrumb = breadcrumbStructuredData([
    { name: 'Home', path: '/' },
    { name: 'Fragrance Catalog', path: '/#collection' },
    { name: collection.title, path: canonical }
  ]);
  return `${pageHead({ title, description, canonical, structuredData: [structuredData, breadcrumb] })}
<body>${siteHeader()}<main class="page"><nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/#collection">Fragrance catalog</a> / ${escapeHtml(collection.title)}</nav><span class="eyebrow">Drift &amp; Co. fragrance collection</span><h1>${escapeHtml(collection.title)}</h1><p class="lede">${escapeHtml(collection.description)}</p><p>Compare 40ml bottles at ₱380 and 50ml bottles at ₱550. Each product page includes Drift &amp; Co.’s published scent description and available note details.</p><div class="cards">${matchingProducts.map(productCard).join('')}</div><section><h2>Browse another scent family</h2><div class="cards">${collections.filter(other => other.slug !== collection.slug).map(other => `<a class="card" href="/collections/${escapeHtml(other.slug)}/"><h3>${escapeHtml(other.title)}</h3><p>${escapeHtml(other.description)}</p></a>`).join('')}</div></section><p><a class="text-link" href="/#scent-finder">Try the fragrance finder</a> · <a class="text-link" href="/#partner">Perfume reseller inquiries</a></p></main>${siteFooter()}</body></html>`;
}

function articlePage(article, productBySlug) {
  const canonical = `/journal/${article.slug}/`;
  const title = `${article.title} | Drift & Co. Fragrance Journal`;
  const description = compactDescription(article.description);
  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description,
    mainEntityOfPage: `${SITE_URL}${canonical}`,
    author: { '@type': 'Organization', name: 'Drift & Co.' },
    publisher: {
      '@type': 'Organization',
      name: 'Drift & Co.',
      url: `${SITE_URL}/`
    },
    inLanguage: 'en-PH'
  };
  const breadcrumb = breadcrumbStructuredData([
    { name: 'Home', path: '/' },
    { name: 'Fragrance Journal', path: '/#journal' },
    { name: article.title, path: canonical }
  ]);
  const sections = article.sections.map(section => `<section><h2>${escapeHtml(section.heading)}</h2>${section.paragraphs.map(paragraph => `<p>${escapeHtml(paragraph)}</p>`).join('')}</section>`).join('');
  const relatedProducts = article.relatedProducts
    .map(slug => productBySlug.get(slug))
    .filter(Boolean);
  if (relatedProducts.length !== article.relatedProducts.length) {
    throw new Error(`An article links to a missing catalog product: ${article.slug}`);
  }
  return `${pageHead({ title, description, canonical, structuredData: [articleSchema, breadcrumb], type: 'article' })}
<body>${siteHeader()}<main class="page article"><nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/#journal">Fragrance journal</a> / ${escapeHtml(article.title)}</nav><article><span class="eyebrow">Drift &amp; Co. Fragrance Journal</span><h1>${escapeHtml(article.title)}</h1><p class="lede">${escapeHtml(article.introduction)}</p>${sections}</article><section><h2>Explore related fragrances</h2><div class="cards">${relatedProducts.map(productCard).join('')}</div></section><p><a class="text-link" href="/#collection">Browse all Eau de Parfum</a> · <a class="text-link" href="/pages/perfume-reseller-philippines/">Perfume reseller Philippines</a></p></main>${siteFooter()}</body></html>`;
}

function resellerPage() {
const canonical = '/pages/perfume-reseller-philippines/';
const title = 'Perfume Reseller Philippines | Drift & Co. Business Partner';
const description = 'Explore the Drift & Co. perfume business partner Starter Kit in the Philippines, package details, and how to send a reseller inquiry.';
const structuredData = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: title,
  description,
  url: `${SITE_URL}${canonical}`
};
const breadcrumb = breadcrumbStructuredData([
  { name: 'Home', path: '/' },
  { name: 'Business Partners', path: canonical }
]);
return `${pageHead({ title, description, canonical, structuredData: [structuredData, breadcrumb] })}
<body>${siteHeader()}<main class="page article"><nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a> / Business partners</nav><span class="eyebrow">Drift &amp; Co. Business Partners</span><h1>Perfume Reseller Philippines</h1><p class="lede">Learn about the Drift &amp; Co. perfume business partner Starter Kit and contact the team to ask about becoming a reseller or ambassador.</p><section><h2>Starter Kit · ₱988</h2><p>The package includes one 40ml Eau de Parfum, 10 preferred testers, and an official scent catalog. For current package details and wholesale terms, contact Drift &amp; Co. directly before ordering.</p><p>The storefront describes the brand’s fragrances as Eau de Parfum with 30% fragrance oil and lists 40ml and 50ml bottle options.</p><p><a class="button" href="/#partner">View the business partner section</a></p></section><section><h2>Ask about becoming a reseller</h2><p>Review the package information and use the partner inquiry form on the storefront to share your contact details and ask the team questions.</p><p><a class="text-link" href="/#partner">Contact Drift &amp; Co. about the reseller package</a></p></section><section><h2>Explore the fragrance catalog</h2><p><a class="text-link" href="/#collection">Browse the Eau de Parfum collection</a> · <a class="text-link" href="/#journal">Read the Fragrance Journal</a></p></section></main>${siteFooter()}</body></html>`;
}

function staticProductLinks(products) {
  return products.map(product => `<article class="bg-white border border-[#E8E2D8] rounded-sm p-5"><h3 class="font-cormorant text-xl"><a class="hover:text-[#9E7D3B]" href="${escapeHtml(productUrl(product))}">${escapeHtml(product.name)} Eau de Parfum</a></h3><p class="text-sm text-stone-600 mt-2">${escapeHtml(compactDescription(product.description, 145))}</p><p class="text-[11px] uppercase tracking-wider text-[#9E7D3B] mt-3">40ml ₱380 · 50ml ₱550</p></article>`).join('\n');
}

function staticJournalLinks() {
  return fragranceJournal.map(article => `<article class="bg-white border border-[#E8E2D8] rounded-sm p-6"><h3 class="font-cormorant text-2xl"><a class="hover:text-[#9E7D3B]" href="/journal/${escapeHtml(article.slug)}/">${escapeHtml(article.title)}</a></h3><p class="text-sm text-stone-600 mt-3">${escapeHtml(article.description)}</p><a class="inline-block mt-4 text-xs uppercase tracking-widest text-[#9E7D3B]" href="/journal/${escapeHtml(article.slug)}/">Read the guide</a></article>`).join('\n');
}

async function optimizeImage(imagePath, outDir) {
  const sourcePath = path.join(ROOT, 'public', imagePath.replace(/^\//, ''));
  const outputPath = path.join(outDir, imagePath.replace(/\.jfif$/i, '.webp').replace(/^\//, ''));
  await mkdir(path.dirname(outputPath), { recursive: true });
  await sharp(sourcePath)
    .resize({ width: 1000, withoutEnlargement: true })
    .webp({ quality: 82, effort: 5 })
    .toFile(outputPath);
}

function replaceImagePath(source, imagePath) {
  const webpPath = imagePath.replace(/\.jfif$/i, '.webp');
  return source.split(imagePath).join(webpPath);
}

export async function generateSeoPages(outDir = path.join(ROOT, 'dist')) {
  const catalogSource = await readFile(path.join(ROOT, 'public', 'js', 'catalog-data.js'), 'utf8');
  const products = parseProducts(catalogSource);
  const productBySlug = new Map(products.map(product => [productSlug(product), product]));
  const pageEntries = [
    ...products.map(product => ({
      path: `products/${productSlug(product)}/index.html`,
      html: productPage(product)
    })),
    ...collections.map(collection => ({
      path: `collections/${collection.slug}/index.html`,
      html: collectionPage(collection, products)
    })),
    ...fragranceJournal.map(article => ({
      path: `journal/${article.slug}/index.html`,
      html: articlePage(article, productBySlug)
    })),
    {
      path: 'pages/perfume-reseller-philippines/index.html',
      html: resellerPage()
    }
  ];

  for (const entry of pageEntries) {
    const outputPath = path.join(outDir, entry.path);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, entry.html);
  }

  const indexPath = path.join(outDir, 'index.html');
  let homeHtml = await readFile(indexPath, 'utf8');
  const productMarker = '<!-- SEO_CATALOG_LINKS -->';
  const journalMarker = '<!-- SEO_JOURNAL_LINKS -->';
  if (!homeHtml.includes(productMarker) || !homeHtml.includes(journalMarker)) {
    throw new Error('Homepage SEO link placeholders are missing.');
  }
  homeHtml = homeHtml
    .replace(productMarker, staticProductLinks(products))
    .replace(journalMarker, staticJournalLinks());
  await writeFile(indexPath, homeHtml);

  const imagePaths = new Set([
    ...products.map(product => product.image),
    '/hero.jfif',
    '/partner.jfif'
  ]);
  await Promise.all([...imagePaths].map(imagePath => optimizeImage(imagePath, outDir)));

  const catalogScriptPath = path.join(outDir, 'js', 'catalog-data.js');
  let catalogScript = await readFile(catalogScriptPath, 'utf8');
  for (const imagePath of imagePaths) {
    catalogScript = replaceImagePath(catalogScript, imagePath);
    homeHtml = replaceImagePath(homeHtml, imagePath);
  }
  await Promise.all([
    writeFile(catalogScriptPath, catalogScript),
    writeFile(indexPath, homeHtml)
  ]);

  const sitemapUrls = [
    '/',
    ...products.map(productUrl),
    ...collections.map(collection => `/collections/${collection.slug}/`),
    ...fragranceJournal.map(article => `/journal/${article.slug}/`),
    '/pages/perfume-reseller-philippines/'
  ];
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapUrls.map(url => `  <url><loc>${SITE_URL}${url}</loc></url>`).join('\n')}\n</urlset>\n`;
  await Promise.all([
    writeFile(path.join(outDir, 'sitemap.xml'), sitemap),
    writeFile(path.join(ROOT, 'public', 'sitemap.xml'), sitemap)
  ]);
  return { products: products.length, collections: collections.length, articles: fragranceJournal.length, partnerPages: 1, urls: sitemapUrls.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await generateSeoPages();
  console.log(`Generated SEO pages: ${result.products} products, ${result.collections} collections, ${result.articles} journal articles, ${result.partnerPages} partner page.`);
}
