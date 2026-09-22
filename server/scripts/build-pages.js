/**
 * Builds the storefront's HTML, robots.txt and sitemap.xml into public/.
 *
 *   npm run pages
 *
 * The frontend is hosted as static files, with no server to render anything, so
 * everything the site needs a crawler to see has to exist in the files
 * themselves: the shared header/footer, each page's own title, canonical URL,
 * Open Graph tags and structured data, and a real URL per product and
 * collection. server/pageMeta.js produces that metadata and the Express router
 * serves it live, so the two hosts describe every page the same way.
 *
 * The output is committed rather than built on the host, because the deploy
 * runs with no build step and no credentials.
 *
 * Product and collection pages are snapshots: a price, image or handle change in
 * Shopify reaches the indexed copy only when this runs again.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
require('dotenv').config({ path: path.join(ROOT, '.env') });

const { expandPage } = require('../partials');
const { injectSeo } = require('../htmlSeo');
const meta = require('../pageMeta');
const { getProducts } = require('../shopify/queries/getProducts');
const { getCollections } = require('../shopify/queries/getCollections');

const SOURCES = path.join(ROOT, 'server', 'views', 'pages');
const OUTPUT = path.join(ROOT, 'public');

// The canonical URLs, og:urls and sitemap entries written here are what a
// crawler reads as the site's address, so they can only ever name the real one.
// Inheriting a developer .env would publish links to a laptop. Express replaces
// these tags per request, so this constrains the committed files, not the API.
const CANONICAL_ORIGIN = /^https:\/\/(www\.)?emmluxuryhair\.com$/;
if (!CANONICAL_ORIGIN.test(meta.SITE_URL)) {
  console.error(`\nnpm run pages refuses to build: it would publish ${meta.SITE_URL} as the site's canonical address.\n`
    + 'The FRONTEND_URL in your .env points at a development server. Run:\n'
    + '  FRONTEND_URL=https://www.emmluxuryhair.com npm run pages\n');
  process.exit(1);
}

/**
 * Approved-review counts deliberately stay out of the built pages. On a
 * developer machine the review store reads local files, not the production
 * queue, and an aggregateRating that disagrees with the reviews actually shown
 * is worse than none at all.
 */
function writePage(relative, html) {
  const target = path.join(OUTPUT, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, html);
  return relative;
}

function htmlFiles(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...htmlFiles(full));
    else if (entry.name.endsWith('.html')) found.push(full);
  }
  return found;
}

/**
 * Deletes previously generated product and collection pages so a product that
 * has since been removed stops being advertised in the sitemap. The two
 * templates in the same folders are rewritten straight afterwards.
 */
function clearGenerated(kind) {
  const dir = path.join(OUTPUT, kind);
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir)) {
    if (entry.endsWith('.html')) fs.rmSync(path.join(dir, entry));
  }
}

async function main() {
  const written = [];

  // Clear first: a product that has since been deleted must not keep a page,
  // and the sweep also removes the two templates below, so it has to happen
  // before anything is written.
  clearGenerated('products');
  clearGenerated('collections');

  // 1. Fixed pages: expand the shared chrome, then inject this page's metadata.
  //    Sources that are not in PAGES — the product and collection bases and the
  //    admin shell — stay out of the output. They are templates for the pages
  //    below and a page Express renders per request; on a static host they would
  //    be un-indexable shells with no title or canonical of their own.
  const templates = new Map();
  for (const source of htmlFiles(SOURCES)) {
    templates.set(path.relative(SOURCES, source).replace(/\\/g, '/'), expandPage(fs.readFileSync(source, 'utf8')));
  }
  for (const [route, page] of Object.entries(meta.PAGES)) {
    if (!templates.has(page.file)) throw new Error(`PAGES['${route}'] refers to ${page.file}, which has no source file`);
  }
  for (const [route, page] of Object.entries(meta.PAGES)) {
    written.push(writePage(page.file, injectSeo(templates.get(page.file), meta.staticMeta(route))));
  }

  // 2. One page per product, from the live catalogue.
  const products = await getProducts({ first: 250, sortKey: 'UPDATED_AT', reverse: true });
  for (const product of products) {
    const file = meta.pageFile('products', product.handle);
    if (!file || file === 'products/product.html') continue;
    written.push(writePage(file, injectSeo(templates.get('products/product.html'), meta.productMeta(product, null))));
  }

  // ...and the page behind Vercel's /products/<handle> rewrite, for a handle
  // with no file: a product published since this last ran, or one typed wrong.
  // It comes from the same template as the pages above, so it can never drift
  // from them, and product.js fills it from the live API.
  written.push(writePage('pages/product.html', injectSeo(templates.get('products/product.html'), meta.productFallbackMeta())));

  // 3. One page per collection, plus Shopify's virtual "all".
  const handles = new Set(['all', ...(await getCollections(100)).map(c => c.handle)]);
  for (const handle of handles) {
    const file = meta.pageFile('collections', handle);
    if (!file || file === 'collections/collection.html') continue;
    const built = await meta.collectionMetaFor(handle);
    if (built.unavailable) throw new Error(`Shopify did not answer for collection "${handle}" — refusing to publish a partial build`);
    written.push(writePage(file, injectSeo(templates.get('collections/collection.html'), built)));
  }

  // 4. The two files a crawler reads before any page.
  written.push(writePage('robots.txt', meta.robotsTxt()));
  written.push(writePage('sitemap.xml', meta.sitemapXml(await meta.listSitemapUrls())));

  console.log(written.map(w => `  ${w}`).join('\n'));
  console.log(`${products.length} products, ${handles.size} collections, ${written.length} files written`);
}

main().catch(err => {
  console.error(`\nnpm run pages failed: ${err.message}\n`);
  process.exit(1);
});
