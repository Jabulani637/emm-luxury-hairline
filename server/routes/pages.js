/**
 * Serves the HTML storefront.
 *
 * Pages used to be reached only as /products/product.html?handle=xyz, which
 * gave every product the same <title> and no crawlable content, and let the
 * catch-all answer unknown URLs with the homepage at status 200 — a soft 404
 * Google reads as duplicate content. Everything now flows through explicit
 * routes that inject page-specific metadata, and the old addresses 301 to the
 * new ones so bookmarks and existing links keep working.
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');
const cache = require('../cache');
const reviews = require('../reviews/store');
const { injectHead, SITE_NAME } = require('../htmlSeo');
const partials = require('../partials');
const { getProduct } = require('../shopify/queries/getProduct');
const { getProducts } = require('../shopify/queries/getProducts');
const { getCollection } = require('../shopify/queries/getCollection');
const { getCollections } = require('../shopify/queries/getCollections');

const SITE_URL = (process.env.FRONTEND_URL || 'https://www.emmluxuryhair.com').replace(/\/$/, '');
const FALLBACK_IMAGE = `${SITE_URL}/assets/ad-images/beautiful_hair_1.jpg`;

// Static pages: URL path → file, with the copy search engines are shown.
const PAGES = {
  '/': {
    file: 'index.html',
    description: 'Hand-picked raw and virgin human hair wigs, bundles and ready-to-ship styles. Shop Emm Luxury Hair, or request a custom wig built to your specification.',
    ogType: 'website',
  },
  '/cart': {
    file: 'cart.html',
    description: 'Review the items in your bag before checking out at Emm Luxury Hair.',
    ogType: 'website',
    noindex: true,
  },
  '/pages/about': {
    file: 'pages/about.html',
    title: 'About Us — Who We Are and What We Stock | Emm Luxury Hair',
    description: 'Emm Luxury Hair is a UK-based human hair business selling raw and virgin hair wigs and bundles worldwide. What we stock, the standards we hold it to, and how an order works.',
    ogType: 'website',
  },
  '/pages/reviews': {
    file: 'pages/reviews.html',
    title: 'Customer Reviews | Emm Luxury Hair',
    description: 'Genuine customer reviews of Emm Luxury Hair wigs and bundles, each one checked before it is published. Read them, or write your own.',
    ogType: 'website',
  },
  '/pages/custom-order': {
    file: 'pages/custom-order.html',
    title: 'Request a Custom Wig — Built to Your Specification | Emm Luxury Hair',
    description: 'Send Emm Luxury Hair the style, length, colour and budget you want and we will source or build it, then email you a payment link.',
    ogType: 'website',
  },
  '/pages/contact': {
    file: 'pages/contact.html',
    description: 'Contact Emm Luxury Hair about an order, a wig specification, shipping or returns. WhatsApp, email or send a message from the form.',
    ogType: 'website',
  },
  '/pages/shipping-returns': {
    file: 'pages/shipping-returns.html',
    title: 'Shipping & Returns Policy | Emm Luxury Hair',
    description: 'How long Emm Luxury Hair orders take to arrive, what shipping costs, and how to return or exchange a wig.',
    ogType: 'website',
  },
  '/pages/faqs': {
    file: 'pages/faqs.html',
    title: 'Frequently Asked Questions | Emm Luxury Hair',
    description: 'Answers about wig quality, lace, lengths, colour matching, ordering and delivery at Emm Luxury Hair.',
    ogType: 'website',
  },
  '/pages/wig-care': {
    file: 'pages/wig-care.html',
    title: 'Wig Care Guide — How to Make Human Hair Last | Emm Luxury Hair',
    description: 'How to wash, detangle, store and restyle a human hair wig so it keeps its quality for as long as possible.',
    ogType: 'website',
  },
};

// Legacy addresses, mapped to the clean URL that replaced them. Query-string
// product/collection pages resolve through pageUrl() instead.
const LEGACY_PAGES = {
  '/index.html': '/',
  '/cart.html': '/cart',
  '/pages/about.html': '/pages/about',
  '/pages/reviews.html': '/pages/reviews',
  '/admin/reviews.html': '/admin/reviews',
  '/pages/custom-order.html': '/pages/custom-order',
  '/pages/contact.html': '/pages/contact',
  '/pages/shipping-returns.html': '/pages/shipping-returns',
  '/pages/faqs.html': '/pages/faqs',
  '/pages/wig-care.html': '/pages/wig-care',
  '/404.html': '/404',
};

function slugifyHandle(value) {
  if (typeof value !== 'string') return null;
  const s = value.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]{0,159}$/.test(s) ? s : null;
}

/** The canonical URL for a product or collection, given its handle. */
function pageUrl(kind, handle) {
  const clean = slugifyHandle(handle);
  if (!clean) return null;
  return `${SITE_URL}/${kind}/${clean}`;
}

/**
 * Search snippets and link previews show this verbatim, so it must not end
 * mid-word the way a plain slice would.
 */
function summarise(text, limit = 300) {
  const flat = String(text || '').replace(/\s+/g, ' ').trim();
  if (flat.length <= limit) return flat;
  const cut = flat.slice(0, limit);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > 120 ? lastSpace : limit).trim()}…`;
}

function readPage(file) {
  return cache.wrap(`page:${file}`, async () => (
    partials.expandPage(fs.readFileSync(path.join(PUBLIC_DIR, file), 'utf8'))
  ), 600);
}

function notFound(res) {
  res.status(404).type('html').send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Page not found | ${SITE_NAME}</title>
<meta name="robots" content="noindex, follow">
<style>
body{font-family:Georgia,serif;background:#FDF8F4;color:#1A1214;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;text-align:center}
main{max-width:34rem}
h1{font-size:1.6rem;letter-spacing:.04em;color:#7A2B3F}
p{line-height:1.6;color:#6B5E5E}
a{display:inline-block;margin:.4rem .5rem 0;padding:.7rem 1.4rem;border:1px solid #7A2B3F;color:#7A2B3F;text-decoration:none;text-transform:uppercase;font-size:.72rem;letter-spacing:.12em}
a:hover{background:#7A2B3F;color:#D4A854}
</style></head>
<body><main><h1>We couldn&rsquo;t find that page</h1>
<p>It may have sold out and been removed. The full range is one click away.</p>
<a href="/">Home</a><a href="/collections/all">Shop all wigs</a><a href="/pages/contact">Contact us</a>
</main></body></html>`);
}

/** Sends a page file with metadata injected, or a 503 if the file vanished. */
async function sendPage(res, file, seo) {
  let html;
  try {
    html = await readPage(file);
  } catch (err) {
    console.error('[pages] missing template', file, err.message);
    return res.status(503).type('html').send('<!DOCTYPE html><p>Page unavailable.</p>');
  }
  res.status(200).type('html').send(injectHead(html, seo));
}

// ---------------------------------------------------------------- legacy 301s

router.get(/\.html$/, (req, res) => {
  const legacy = LEGACY_PAGES[req.path];
  if (legacy) {
    // Query strings must survive: /pages/custom-order.html?productHandle=x&…
    // prefills the form, and dropping it would silently break that flow.
    const qs = new URLSearchParams(req.query).toString();
    return res.redirect(301, qs ? `${legacy}?${qs}` : legacy);
  }

  // /products/product.html?handle=x and /collections/collection.html?handle=y
  const handle = slugifyHandle(req.query.handle);
  if (/^\/(products|collections)\/[^/]+\.html$/.test(req.path)) {
    const kind = req.path.split('/')[1];
    return res.redirect(301, handle ? `/${kind}/${handle}` : '/collections/all');
  }

  // Any other .html is a genuinely missing file.
  return notFound(res);
});

// ------------------------------------------------------------- static routes

for (const [route, page] of Object.entries(PAGES)) {
  router.get(route, async (req, res) => {
    await sendPage(res, page.file, {
      title: page.title,
      description: page.description,
      ogType: page.ogType,
      noindex: page.noindex,
      canonical: SITE_URL + route,
      ogImage: FALLBACK_IMAGE,
      siteImage: FALLBACK_IMAGE,
      jsonLd: route === '/' ? siteSchema() : undefined,
    });
  });
}

// ------------------------------------------------------------ admin surface

// Kept out of PAGES so it can never appear in the sitemap. The file itself
// holds no data — every row is fetched from /api/admin/reviews, which rejects
// requests without a signed cookie — so serving the shell leaks nothing.
router.get('/admin/reviews', async (req, res) => {
  await sendPage(res, 'admin/reviews.html', {
    title: 'Review moderation | Emm Luxury Hair',
    description: 'Private moderation queue.',
    noindex: true,
  });
});

// ------------------------------------------------------- dynamic product page

async function productPage(req, res) {
  const handle = slugifyHandle(req.params.handle);
  if (!handle) return notFound(res);

  let product;
  try {
    product = await getProduct(handle);
  } catch (err) {
    // A Shopify outage must not take down the whole site, but the visitor
    // still needs a retryable status rather than a wrong page.
    console.error('[pages] product fetch failed', handle, err.message);
    return res.status(502).type('html').send('<!DOCTYPE html><p>Temporarily unavailable.</p>');
  }

  if (!product) return notFound(res);

  const canonical = pageUrl('products', product.handle);
  const images = (product.images || []).map(i => i.url).filter(Boolean);
  const price = product.priceRange?.minVariantPrice;
  const summary = summarise(product.description);

  // Same key the public /api/reviews route writes, so both share one entry.
  let rating = null;
  try {
    const cached = await cache.wrap(
      `reviews:public:${handle}:100`,
      () => reviews.approvedWithStats(handle),
      120
    );
    if (cached && cached.stats && cached.stats.count) rating = cached.stats;
  } catch (err) {
    console.error('[pages] review stats unavailable', err.message);
  }

  const schema = [{
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    description: summary || `${product.title} by ${SITE_NAME}.`,
    sku: product.handle,
    brand: { '@type': 'Brand', name: SITE_NAME },
    url: canonical,
    image: images,
    ...(rating ? {
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: rating.average,
        reviewCount: rating.count,
        bestRating: 5,
        worstRating: 1,
      },
    } : {}),
    offers: {
      '@type': 'Offer',
      url: canonical,
      priceCurrency: price?.currencyCode || 'GBP',
      price: price ? price.amount : undefined,
      availability: product.availableForSale
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
    },
  }];

  await sendPage(res, 'products/product.html', {
    title: `${product.title} | ${SITE_NAME}`,
    description: summary || `${product.title} — ${SITE_NAME}.`,
    canonical,
    ogType: 'product',
    ogImage: images[0] || FALLBACK_IMAGE,
    siteImage: FALLBACK_IMAGE,
    jsonLd: schema,
  });
}

router.get('/products/:handle', productPage);

// ---------------------------------------------------- dynamic collection page

async function collectionPage(req, res) {
  const handle = slugifyHandle(req.params.handle);
  if (!handle) return notFound(res);

  const canonical = pageUrl('collections', handle);
  const prettified = handle.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  let title;
  let description = '';
  let products = [];

  try {
    if (handle === 'all') {
      // Shopify's virtual catalogue collection.
      title = 'All Products';
      products = await getProducts({ first: 24, sortKey: 'BEST_SELLING' });
    } else {
      const collection = await getCollection(handle, 24);
      if (collection) {
        title = collection.title;
        description = collection.description || '';
        products = collection.products;
      } else {
        // Unknown handle: the client-side page falls back to showing the whole
        // catalogue, so do the same here rather than describing a different page.
        title = prettified;
        products = await getProducts({ first: 24, sortKey: 'BEST_SELLING' });
      }
    }
  } catch (err) {
    // A Shopify outage must not take the site down, but the visitor needs a
    // retryable status rather than a wrong page.
    console.error('[pages] collection fetch failed', handle, err.message);
    return res.status(502).type('html').send('<!DOCTYPE html><p>Temporarily unavailable.</p>');
  }

  const summary = summarise(description)
    || (handle === 'all'
      ? `Every wig, bundle and extension currently on sale at ${SITE_NAME}, including ready-to-ship styles.`
      : `The ${title} range at ${SITE_NAME} — human hair wigs and extensions.`);

  const schema = [{
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: title,
    description: summary,
    url: canonical,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: products.length,
      itemListElement: products.slice(0, 12).map((p, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: p.title,
        url: pageUrl('products', p.handle) || undefined,
      })),
    },
  }];

  await sendPage(res, 'collections/collection.html', {
    title: `${title} | ${SITE_NAME}`,
    description: summary,
    canonical,
    ogType: 'website',
    ogImage: products[0]?.images?.[0]?.url || FALLBACK_IMAGE,
    siteImage: FALLBACK_IMAGE,
    jsonLd: schema,
  });
}

router.get('/collections/:handle', collectionPage);

function siteSchema() {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: SITE_NAME,
      url: `${SITE_URL}/`,
      publisher: { '@id': `${SITE_URL}/#organization` },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: `${SITE_URL}/`,
      logo: `${SITE_URL}/assets/apple-touch-icon.png`,
      image: FALLBACK_IMAGE,
      description: 'Human hair wigs, bundles and extensions — raw and virgin hair, ready to ship.',
    },
  ];
}

module.exports = router;
module.exports.SITE_URL = SITE_URL;
module.exports.notFound = notFound;
module.exports.listSitemapUrls = listSitemapUrls;

/** Every indexable page, so /sitemap.xml and the pages agree on the URL set. */
async function listSitemapUrls() {
  const urls = Object.keys(PAGES).filter(p => !PAGES[p].noindex).map(p => ({
    loc: SITE_URL + p,
    priority: p === '/' ? '1.0' : '0.7',
  }));

  const [products, collections] = await Promise.all([
    getProducts({ first: 250, sortKey: 'UPDATED_AT', reverse: true }),
    getCollections(100),
  ]);

  for (const p of products) {
    const loc = pageUrl('products', p.handle);
    if (loc) urls.push({ loc, lastmod: p.updatedAt, priority: '0.8' });
  }
  for (const c of collections) {
    const loc = pageUrl('collections', c.handle);
    if (loc) urls.push({ loc, priority: '0.6' });
  }

  return urls;
}
