/**
 * Serves the HTML storefront.
 *
 * Pages used to be reached only as /products/product.html?handle=xyz, which
 * gave every product the same <title> and no crawlable content, and let the
 * catch-all answer unknown URLs with the homepage at status 200 — a soft 404
 * Google reads as duplicate content. Everything now flows through explicit
 * routes that inject page-specific metadata, and the old addresses 301 to the
 * new ones so bookmarks and existing links keep working.
 *
 * The metadata itself lives in server/pageMeta.js, because these same pages are
 * also written out as files for the static frontend host and both hosts have to
 * describe every page identically.
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

// Page sources, not the built copies in public/: those exist for the static
// host, are only refreshed by `npm run pages`, and carry no partial markers by
// the time they are written. Expanding the source per request keeps this host
// answering from what is in the repository right now.
const VIEWS_DIR = path.join(__dirname, '..', 'views', 'pages');
const cache = require('../cache');
const reviews = require('../reviews/store');
const { injectSeo, SITE_NAME } = require('../htmlSeo');
const meta = require('../pageMeta');
const partials = require('../partials');
const { getProduct } = require('../shopify/queries/getProduct');

const {
  SITE_URL, PAGES, LEGACY_PAGES, slugifyHandle,
  staticMeta, productMeta, collectionMetaFor, listSitemapUrls,
} = meta;

function readPage(file) {
  return cache.wrap(`page:${file}`, async () => (
    partials.expandPage(fs.readFileSync(path.join(VIEWS_DIR, file), 'utf8'))
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
  res.status(200).type('html').send(injectSeo(html, seo));
}

/** Approved-review stats for a handle, or null when there are none to show. */
async function approvedRating(handle) {
  try {
    // Same key the public /api/reviews route writes, so both share one entry.
    const cached = await cache.wrap(
      `reviews:public:${handle}:100`,
      () => reviews.approvedWithStats(handle),
      120
    );
    if (cached && cached.stats && cached.stats.count) return cached.stats;
  } catch (err) {
    console.error('[pages] review stats unavailable', err.message);
  }
  return null;
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

for (const route of Object.keys(PAGES)) {
  router.get(route, async (req, res) => {
    await sendPage(res, PAGES[route].file, staticMeta(route));
  });
}

// ------------------------------------------------------------ admin surface

// Kept out of PAGES so it can never appear in the sitemap, and out of public/
// so the static host never serves it: the queue signs itself in with a cookie
// this process issues and fetches /api with relative URLs, so shell and API
// have to be the same origin. The file itself holds no data.
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

  await sendPage(res, 'products/product.html', productMeta(product, await approvedRating(handle)));
}

router.get('/products/:handle', productPage);

// ---------------------------------------------------- dynamic collection page

async function collectionPage(req, res) {
  const handle = slugifyHandle(req.params.handle);
  if (!handle) return notFound(res);

  const built = await collectionMetaFor(handle);
  if (built.unavailable) {
    // A Shopify outage gets a retryable status, never a page about something
    // the visitor did not ask for.
    return res.status(502).type('html').send('<!DOCTYPE html><p>Temporarily unavailable.</p>');
  }
  await sendPage(res, 'collections/collection.html', built);
}

router.get('/collections/:handle', collectionPage);

module.exports = router;
module.exports.SITE_URL = SITE_URL;
module.exports.notFound = notFound;
module.exports.listSitemapUrls = listSitemapUrls;
