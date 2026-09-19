/**
 * Smoke test — starts the real server on a throwaway port and checks that every
 * route answers with the shape it should. Read-only: it never POSTs, so it
 * cannot leave test rows in the review or order stores.
 *
 *   npm run smoke
 */
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const PORT = Number(process.env.SMOKE_PORT || 4399);
const BASE = `http://127.0.0.1:${PORT}`;
// The one hostname the whole site is meant to live on. Everything else in the
// emmluxuryhair.com family has to hand its traffic over to this one.
const CANONICAL = 'https://www.emmluxuryhair.com';
const ROOT = path.join(__dirname, '..', '..');

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${pass || !detail ? '' : ` — ${detail}`}`);
}

async function get(pathname, redirect = 'manual') {
  const res = await fetch(BASE + pathname, { redirect });
  const body = await res.text();
  return { status: res.status, body, headers: res.headers, location: res.headers.get('location') };
}

/**
 * fetch() ignores a caller-supplied Host header, so the only way to test the
 * per-hostname behaviour is to open the socket and name the host by hand.
 */
function hostRequest(host, pathname) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port: PORT, path: pathname, method: 'GET', headers: { host } },
      res => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, location: res.headers.location, body }));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

/**
 * Script tags the browser would execute inline. CSP does not block data blocks
 * like JSON-LD, so only an executable type without a src is a violation.
 */
function inlineExecutableScripts(html) {
  const jsTypes = /^(?:text|application)\/(?:java|ecma)script|module$/i;
  const found = [];
  for (const m of html.matchAll(/<script([^>]*)>/gi)) {
    const attrs = m[1];
    if (/\ssrc=/i.test(attrs)) continue;
    const type = (attrs.match(/\stype="([^"]*)"/i) || [])[1];
    if (type && !jsTypes.test(type)) continue;
    found.push(type || 'no type attribute');
  }
  return found;
}

/** Same-origin files a document points at: src/href attributes and srcset entries. */
function referencedFiles(text) {
  const urls = new Set();
  for (const m of text.matchAll(/(?:src|href)="(\/[^"?#][^"]*)"/g)) {
    if (!/^\/(api|webhooks)\//.test(m[1])) urls.add(m[1]);
  }
  for (const m of text.matchAll(/srcset="([^"]+)"/g)) {
    for (const entry of m[1].split(',')) {
      const u = entry.trim().split(/\s+/)[0];
      if (u.startsWith('/')) urls.add(u);
    }
  }
  for (const m of text.matchAll(/url\(['"]?(\/[^'"")\s?#][^'")]*)['"]?\)/g)) urls.add(m[1]);
  return [...urls];
}

/**
 * Every asset a page loads has to exist. This is the check that catches a
 * repointed logo or a deleted sprite leaving a live reference behind.
 */
async function assets(name, pathname) {
  const r = await get(pathname);
  const refs = referencedFiles(r.body);
  for (const css of referencedFiles(r.body).filter(u => u.endsWith('.css'))) {
    refs.push(...referencedFiles((await get(css)).body));
  }
  const broken = [];
  for (const ref of new Set(refs)) {
    const res = await fetch(BASE + ref, { method: 'GET', redirect: 'manual' });
    if (res.status !== 200) broken.push(`${ref} → ${res.status}`);
  }
  check(`${name} loads only assets that exist`, broken.length === 0,
    broken.slice(0, 4).join(', ') || `${new Set(refs).size} refs`);
}

/**
 * A BOM ahead of a file's first character is invisible and survives every
 * request-level check below, because fetch's text() decoder strips it. On disk
 * it is a real defect: in an .env it hides the first variable from the parser.
 */
function checkNoBom() {
  const TEXT_EXTENSIONS = ['.html', '.css', '.js', '.json', '.md', '.txt', '.xml'];
  const found = [];
  const inspect = full => {
    const fd = fs.openSync(full, 'r');
    const head = Buffer.alloc(3);
    const read = fs.readSync(fd, head, 0, 3, 0);
    fs.closeSync(fd);
    if (read === 3 && head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf) {
      found.push(path.relative(ROOT, full));
    }
  };
  const walk = dir => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (TEXT_EXTENSIONS.some(ext => full.endsWith(ext))) inspect(full);
    }
  };
  walk(path.join(ROOT, 'public'));
  walk(path.join(ROOT, 'server'));
  for (const dotenv of ['.env', '.env.example']) {
    const full = path.join(ROOT, dotenv);
    if (fs.existsSync(full)) inspect(full);
  }
  check('no source or env file starts with a UTF-8 BOM', found.length === 0, found.slice(0, 5).join(', '));
}

/**
 * The pages in public/ are served as plain files, with nothing on the host to
 * expand partials or inject a metadata head, so they have to be complete on
 * disk rather than only after a server has passed through them.
 */
function checkBakedPages() {
  // Links the browser never follows as-is: /api lives on another host, and
  // /cart/c/… is a Shopify address shared.js rewrites before it is used.
  const NOT_A_PAGE = /^\/(api|webhooks|cart\/)/;

  /** How the static host maps a clean URL onto a file. */
  const hasPage = url => {
    const base = url.replace(/^\//, '').replace(/\/$/, '') || 'index';
    return ['', '.html'].some(ext => fs.existsSync(path.join(ROOT, 'public', base + ext)))
      || fs.existsSync(path.join(ROOT, 'public', base, 'index.html'));
  };

  const problems = [];
  const pages = [];
  const walk = dir => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (entry.name.endsWith('.html')) pages.push(full);
    }
  };
  walk(path.join(ROOT, 'public'));

  const links = new Map();
  for (const full of pages) {
    const rel = path.relative(ROOT, full).replace(/\\/g, '/').replace(/^public\//, '');
    const html = fs.readFileSync(full, 'utf8');
    if (/<!--#|<!--if\s|<!--\/if/.test(html)) problems.push(`${rel}: unexpanded partial marker`);
    if (/localhost|127\.0\.0\.1/.test(html)) problems.push(`${rel}: development hostname baked in`);
    if (!/rel="canonical"/.test(html)) problems.push(`${rel}: no canonical URL`);
    if (!/<meta name="description"/.test(html)) problems.push(`${rel}: no meta description`);
    for (const m of html.matchAll(/href="(\/[^"?#]*)"/g)) {
      const url = m[1];
      if (url === '/' || NOT_A_PAGE.test(url) || /\.(css|js|png|jpe?g|svg|ico|webp|txt|xml|json)$/.test(url)) continue;
      if (!hasPage(url) && !links.has(url)) links.set(url, rel);
    }
  }
  for (const [url, seenIn] of links) problems.push(`${url} is linked from ${seenIn} but has no page`);

  const robotsPath = path.join(ROOT, 'public', 'robots.txt');
  const sitemapPath = path.join(ROOT, 'public', 'sitemap.xml');
  if (!fs.existsSync(robotsPath)) problems.push('public/robots.txt is missing');
  if (!fs.existsSync(sitemapPath)) problems.push('public/sitemap.xml is missing');
  if (fs.existsSync(path.join(ROOT, 'public', 'admin'))) {
    problems.push('public/admin exists: the moderation queue belongs to the API host, which owns its sign-in cookie');
  }

  if (fs.existsSync(sitemapPath)) {
    const sitemap = fs.readFileSync(sitemapPath, 'utf8');
    if (!fs.existsSync(robotsPath) || !/sitemap\.xml/.test(fs.readFileSync(robotsPath, 'utf8'))) {
      problems.push('robots.txt does not advertise the sitemap');
    }
    for (const m of sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      const rel = m[1].replace(/^https?:\/\/[^/]+/, '').replace(/^\//, '').replace(/\/$/, '');
      const target = path.join(ROOT, 'public', `${rel || 'index'}.html`);
      if (!fs.existsSync(target)) problems.push(`sitemap lists ${m[1]}, which has no file`);
    }
  }

  check(`${pages.length} committed pages are fully built, with no dead internal links`,
    problems.length === 0, problems.slice(0, 6).join(', ')
      || 'markers, canonicals, links and sitemap entries all present');
}

/**
 * The footer paints each badge as one 42x28 cell of a strip that is built at 2x,
 * so three things have to stay in step: the spans in the footer partial, the
 * positions in the CSS, and the cells actually present in the PNG. Drift is
 * silent — a badge shows the wrong logo or a blank tile — and this is the only
 * place it can be caught.
 */
function checkPaymentStrip() {
  const CELL = 42;
  const png = path.join(ROOT, 'public', 'assets', 'payment-icons.png');
  if (!fs.existsSync(png)) {
    check('footer payment badges match the sprite', false, 'public/assets/payment-icons.png is missing');
    return;
  }
  // PNG signature, then IHDR: width and height as big-endian uint32s at 16 and 20.
  const header = fs.readFileSync(png).subarray(16, 24);
  const sheet = { width: header.readUInt32BE(0), height: header.readUInt32BE(4) };

  const css = fs.readFileSync(path.join(ROOT, 'public', 'css', 'components.css'), 'utf8');
  const footer = fs.readFileSync(path.join(ROOT, 'server', 'views', 'partials', 'footer.html'), 'utf8');
  const rule = (css.match(/\.payment-icons \.payment-icon \{([^}]*)\}/) || [, ''])[1];
  const sized = (rule.match(/background-size:\s*(\d+)px (\d+)px/) || []).slice(1).map(Number);
  const positions = [...css.matchAll(/\.payment-icon--([a-z]+)\s*\{\s*background-position:\s*(-?\d+)(?:px)? 0/g)];

  const problems = [];
  // The shorthand resets background-position, and this rule out-specifies the
  // per-badge positions — which is how every tile ended up showing Visa.
  if (/(^|[;{\s])background:\s/.test(rule)) {
    problems.push('.payment-icon sets the `background:` shorthand, which resets every badge position');
  }
  if (sized.length !== 2) problems.push('no background-size on .payment-icon');
  else if (sized[0] !== sheet.width / 2 || sized[1] !== sheet.height / 2) {
    problems.push(`background-size ${sized[0]}x${sized[1]} does not match half the ${sheet.width}x${sheet.height} sheet`);
  }
  positions.forEach(([, , offset], i) => {
    if (Math.abs(offset) !== i * CELL) problems.push(`cell ${i + 1} is at ${offset}px, not -${i * CELL}px`);
  });
  const inCss = positions.map(m => m[1]);
  const inFooter = [...footer.matchAll(/payment-icon--([a-z]+)/g)].map(m => m[1]);
  const orphan = inCss.filter(c => !inFooter.includes(c));
  const missing = inFooter.filter(c => !inCss.includes(c));
  if (orphan.length) problems.push(`styled but not in the footer: ${orphan.join(', ')}`);
  if (missing.length) problems.push(`in the footer but unstyled: ${missing.join(', ')}`);
  const cells = sheet.width / (CELL * 2);
  if (cells !== inCss.length) problems.push(`the sheet holds ${cells} cells, the CSS names ${inCss.length}`);

  check(`footer payment badges match the sprite (${inFooter.length} badges)`,
    problems.length === 0, problems.slice(0, 3).join(', ') || 'spans, positions and sheet cells all agree');
}

/**
 * Below 1024px the header nav is reachable only through the hamburger, and
 * the wiring runs across four files: the partial holds the button and the
 * panel, main.css and components.css reveal them, header-nav.js ties them
 * together. A mistyped id or a renamed class leaves the whole menu
 * unreachable on a phone while every other page check stays green.
 */
function checkMobileNav() {
  const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8');
  const header = read('server', 'views', 'partials', 'header.html');
  const layout = read('public', 'css', 'main.css');
  const components = read('public', 'css', 'components.css');
  const script = read('public', 'js', 'header-nav.js');

  const problems = [];
  const navId = (header.match(/<nav class="main-nav" id="([^"]+)"/) || [, ''])[1];
  const controls = (header.match(/class="nav-toggle"[^>]*aria-controls="([^"]+)"/) || [, ''])[1];
  const scriptId = (script.match(/getElementById\('([^']+)'\)/) || [, ''])[1];
  if (!navId) problems.push('the nav has no id for the button to open');
  if (!controls) problems.push('the toggle has no aria-controls');
  else if (controls !== navId) problems.push(`aria-controls="${controls}" does not match the nav id "${navId}"`);
  else if (scriptId !== navId) problems.push(`header-nav.js looks up "${scriptId}", not "${navId}"`);
  if (!/aria-expanded="false"/.test(header)) problems.push('the toggle never announces its state');
  if (!/class="nav-close"/.test(header)) problems.push('the panel has no close button for keyboard users');
  for (const selector of ['.nav-toggle', '.nav-backdrop', 'body.nav-open .main-nav', 'body.nav-open {']) {
    if (!layout.includes(selector)) problems.push(`main.css has no ${selector} rule`);
  }
  if (!/@media \(min-width: 1024px\)[\s\S]*\.main-nav \{[\s\S]*?position: static/.test(layout)) {
    problems.push('nothing restores the inline nav at desktop width');
  }
  if (!/@media \(max-width: 1023px\)[\s\S]*?\.main-nav \.nav-list \{[\s\S]*?flex-direction: column/.test(components)) {
    problems.push('the panel list is not stacked below the breakpoint');
  }
  if (/\.main-nav \{\s*display: none/.test(layout)) {
    problems.push('.main-nav is hidden outright, which would hide the panel with it');
  }
  for (const hook of [".nav-toggle", "'nav-open'"]) {
    if (!script.includes(hook)) problems.push(`header-nav.js no longer reads ${hook}`);
  }
  if (/class="dropdown/.test(header) || /\.main-nav \.dropdown\b/.test(components)) {
    problems.push('the removed header dropdown is still referenced');
  }

  check('mobile nav wiring (hamburger, panel, styles, script)',
    problems.length === 0, problems.slice(0, 4).join(', ') || 'button, panel, CSS and script all agree');
}

/** A storefront page: real header and footer, no unexpanded partial markers. */
async function page(name, pathname, { navActive = false, drawer = true, jsonLd = false } = {}) {
  const r = await get(pathname);
  const problems = [];
  if (r.status !== 200) problems.push(`status ${r.status}`);
  if (/<!--#|<!--if\s|<!--\/if/.test(r.body)) problems.push('unexpanded partial marker');
  if (!/<header id="main-header"/.test(r.body)) problems.push('no header');
  if (!/<footer>/.test(r.body)) problems.push('no footer');
  if (drawer !== /id="cart-drawer"/.test(r.body)) problems.push(`drawer ${drawer ? 'missing' : 'present'}`);
  if (navActive !== /nav-link active/.test(r.body)) problems.push('header highlight mismatch');
  if (jsonLd && !/application\/ld\+json/.test(r.body)) problems.push('no JSON-LD block');
  const inline = inlineExecutableScripts(r.body);
  if (inline.length) problems.push(`inline <script> (${inline[0]}) — the CSP will block it`);
  const csp = r.headers.get('content-security-policy') || '';
  if (!/script-src 'self'/.test(csp)) problems.push('no script-src CSP');
  check(name, problems.length === 0, problems.join(', '));
}

async function redirect(name, pathname, to) {
  const r = await get(pathname);
  check(name, r.status === 301 && r.location === to, `got ${r.status} ${r.location || ''}`);
}

async function json(name, pathname, assert) {
  let r;
  try {
    const res = await fetch(BASE + pathname);
    r = { status: res.status, data: await res.json().catch(() => null) };
  } catch (err) {
    check(name, false, err.message);
    return;
  }
  const detail = assert(r.status, r.data);
  check(name, detail === true, typeof detail === 'string' ? detail : 'assertion failed');
}

async function run(server) {
  checkNoBom();
  checkBakedPages();
  checkPaymentStrip();
  checkMobileNav();

  for (const [name, pathname, opts] of [
    ['homepage', '/', { navActive: true, jsonLd: true }],
    ['cart page', '/cart', { drawer: false }],
    ['collection page', '/collections/all', { navActive: true }],
    ['about page', '/pages/about', {}],
    ['reviews page', '/pages/reviews', {}],
    ['custom order page', '/pages/custom-order', { navActive: true }],
    ['contact page', '/pages/contact', { navActive: true }],
    ['shipping page', '/pages/shipping-returns', {}],
    ['faqs page', '/pages/faqs', {}],
    ['wig care page', '/pages/wig-care', {}],
  ]) {
    await page(name, pathname, opts);
  }

  // Product pages can only be checked against the live catalogue, since the
  // handles live in Shopify rather than in this repo.
  const catalogue = await (await fetch(`${BASE}/api/products?first=1`)).json();
  const handle = catalogue.products && catalogue.products[0] && catalogue.products[0].handle;

  await assets('homepage', '/');
  if (handle) await assets('product page', `/products/${handle}`);

  if (handle) {
    await page(`product page (${handle})`, `/products/${handle}`, { navActive: true, jsonLd: true });
    const r = await get(`/products/${handle}`);
    check('product page canonical points at itself',
      new RegExp(`rel="canonical" href="${BASE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/products/${handle}"`).test(r.body)
        || /rel="canonical"[^>]*\/products\//.test(r.body),
      'no self-referencing canonical');
  } else {
    check('product page reachable', false, 'the catalogue returned no products');
  }

  const admin = await hostRequest(new URL(CANONICAL).hostname, '/admin/reviews');
  check('admin page is a bare shell', admin.status === 200
    && !/<header id="main-header"/.test(admin.body)
    && /noindex/.test(admin.body), `status ${admin.status}`);
  await assets('admin shell', '/admin/reviews');

  await redirect('legacy /index.html 301s', '/index.html', '/');
  await redirect('legacy /pages/faqs.html 301s', '/pages/faqs.html', '/pages/faqs');
  await redirect('legacy product url 301s', '/products/product.html?handle=blue-blonde', '/products/blue-blonde');

  // One hostname per site: anything else in the domain family hands its
  // documents over, so ranking signals are not split across duplicates.
  for (const [label, host, pathname] of [
    ['apex', 'emmluxuryhair.com', '/'],
    ['api subdomain', 'api.emmluxuryhair.com', '/pages/faqs'],
  ]) {
    const r = await hostRequest(host, pathname);
    check(`${label} 301s to the canonical host`,
      r.status === 301 && r.location === CANONICAL + pathname, `got ${r.status} ${r.location || ''}`);
    const api = await hostRequest(host, '/api/health');
    check(`${label} keeps serving the API itself`, api.status === 200, `status ${api.status}`);
  }
  const canonical = await hostRequest(new URL(CANONICAL).hostname, '/pages/faqs');
  check('canonical host serves pages without redirecting', canonical.status === 200, `status ${canonical.status}`);

  // The queue signs in with a cookie this process issues and reads its rows from
  // a relative /api path, so bouncing it to www would leave an empty shell.
  const adminOnApi = await hostRequest('api.emmluxuryhair.com', '/admin/reviews');
  check('admin queue stays on the host that owns its cookie',
    adminOnApi.status === 200, `status ${adminOnApi.status} ${adminOnApi.location || ''}`);

  const missing = await get('/definitely-not-a-page');
  check('unknown URL 404s instead of showing the homepage', missing.status === 404, `status ${missing.status}`);

  const robots = await get('/robots.txt');
  check('robots.txt', robots.status === 200 && /Sitemap:/.test(robots.body) && /Disallow: \/admin/.test(robots.body), `status ${robots.status}`);
  const sitemap = await get('/sitemap.xml');
  check('sitemap.xml lists pages', sitemap.status === 200
    && /<urlset/.test(sitemap.body)
    && sitemap.body.includes('/pages/about'), `status ${sitemap.status}`);

  await json('/api/health reports readiness', '/api/health', (s, d) => (
    s === 200 && d && d.readiness && typeof d.readiness.storefrontConfigured === 'boolean'
  ));
  await json('/api/config exposes no secret', '/api/config', (s, d) => (
    s === 200 && d && d.apiBaseUrl && !JSON.stringify(d).includes('shpat_') && !JSON.stringify(d).includes('sb_secret_')
  ));
  await json('/api/products returns a catalogue', '/api/products?first=3', (s, d) => (
    s === 200 && Array.isArray(d.products) ? true : `status ${s}, ${JSON.stringify(d && d.error || d).slice(0, 120)}`
  ));
  await json('/api/reviews returns only approved rows', '/api/reviews', (s, d) => (
    s === 200 && Array.isArray(d.reviews) && !JSON.stringify(d).includes('pending')
  ));
  await json('/api/admin/reviews refuses an unauthenticated caller', '/api/admin/reviews', (s, d) => (
    s === 401 || s === 403 ? true : `status ${s}`
  ));
  await json('unknown API endpoint 404s as JSON', '/api/nope', (s, d) => (
    s === 404 && d && d.error === 'Unknown API endpoint'
  ));
}

async function main() {
  const server = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      PORT: String(PORT),
      // Pin the canonical origin the same way production does, instead of
      // inheriting a developer machine's localhost FRONTEND_URL from .env.
      FRONTEND_URL: process.env.FRONTEND_URL || CANONICAL,
      ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'smoke-test-only',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverLog = '';
  server.stdout.on('data', d => { serverLog += d; });
  server.stderr.on('data', d => { serverLog += d; });

  try {
    for (let i = 0; i < 60; i++) {
      try {
        if ((await fetch(`${BASE}/api/health`)).ok) break;
      } catch (_) { /* not listening yet */ }
      await new Promise(r => setTimeout(r, 250));
    }
    await run(server);
  } catch (err) {
    check('smoke run completed', false, err.message);
  } finally {
    server.kill();
  }

  const failed = results.filter(r => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log('\nserver log:\n' + serverLog.slice(-2500));
    process.exit(1);
  }
}

main();
