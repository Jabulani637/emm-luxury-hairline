/**
 * Smoke test — starts the real server on a throwaway port and checks that every
 * route answers with the shape it should. It writes nothing: the one POST it
 * makes sends an address that fails validation, so no row reaches any store.
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
    // Either a page says which address is its own, or it says no crawler should
    // index it at all. Only the product fallback takes the second route: one
    // file answers every handle with no page of its own, so naming any single
    // canonical for it would be a lie.
    if (!/rel="canonical"/.test(html) && !/content="noindex/.test(html)) {
      problems.push(`${rel}: no canonical URL and not noindex`);
    }
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
 * The newsletter box discards addresses silently: an unnamed input, a missing
 * script tag or an unmounted route each leave the form looking identical and
 * saving nothing. This walks the whole chain, markup to table.
 */
function checkNewsletter() {
  const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8');
  const pageHtml = read('server', 'views', 'pages', 'index.html');
  const script = read('public', 'js', 'newsletter.js');
  const api = read('public', 'js', 'api.js');
  const mounted = read('server', 'index.js');
  const store = read('server', 'subscribers', 'store.js');
  const schema = read('supabase', 'schema.sql');

  const problems = [];
  const table = (store.match(/SUPABASE_SUBSCRIBERS_TABLE \|\| '([^']+)'/) || [, ''])[1];
  if (!/name="email"/.test(pageHtml)) problems.push('the email input has no name, so it submits nothing');
  if (!/class="newsletter-hp"/.test(pageHtml)) problems.push('the honeypot field is gone, so the endpoint has nothing to reject bots with');
  if (!/class="newsletter-note/.test(pageHtml)) problems.push('no status element, so a failed signup is silent');
  if (!/src="\/js\/newsletter\.js"/.test(pageHtml)) problems.push('the page does not load newsletter.js');
  if (!/addEventListener\('submit'/.test(script)) problems.push('newsletter.js does not intercept submit, so the page reloads and the address goes into the URL');
  if (!/\/subscribers/.test(api)) problems.push('api.js never calls /subscribers');
  if (!/app\.use\('\/api\/subscribers'/.test(mounted)) problems.push('POST /api/subscribers is not mounted');
  if (!table) problems.push('the subscribers store names no default table');
  else if (!new RegExp(`create table if not exists public\\.${table}`).test(schema)) {
    problems.push(`the store writes to ${table}, which supabase/schema.sql never creates`);
  }
  if (/15% Off/i.test(pageHtml)) problems.push('the page promises a 15% discount no code in this repo can issue');

  check('newsletter signup chain (form, script, route, table)',
    problems.length === 0, problems.slice(0, 4).join(', ') || 'markup through to the Supabase table all line up');
}

/**
 * The confirmation popup spans three files the same way the hamburger does: the
 * page holds the dialog, components.css dresses it, newsletter.js opens it. Any
 * one of those names drifting leaves a visitor who subscribed successfully
 * staring at a form that appears to do nothing.
 */
function checkSignupDialog() {
  const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8');
  const pageHtml = read('server', 'views', 'pages', 'index.html');
  const script = read('public', 'js', 'newsletter.js');
  const css = read('public', 'css', 'components.css');

  const problems = [];
  const dialogTag = (pageHtml.match(/<dialog class="signup-modal"[^>]*>/) || [''])[0];
  const labelledBy = (dialogTag.match(/aria-labelledby="([^"]+)"/) || [, ''])[1];

  if (!dialogTag) {
    problems.push('the page has no <dialog class="signup-modal">');
  } else if (!labelledBy || !new RegExp(`id="${labelledBy}"`).test(pageHtml)) {
    problems.push(`aria-labelledby="${labelledBy}" names a heading that is not in the page`);
  }

  // Every class the script reaches for has to exist in the markup and be styled.
  for (const cls of ['signup-modal-message', 'signup-modal-close', 'signup-modal-done']) {
    if (!new RegExp(`class="[^"]*\\b${cls}\\b[^"]*"`).test(pageHtml)) problems.push(`newsletter.js looks for .${cls}, which the page never renders`);
    if (!css.includes(`.${cls}`)) problems.push(`.${cls} has no CSS`);
  }

  if (!/\.signup-modal::backdrop/.test(css)) problems.push('the dimmed page behind the dialog is never styled');
  const base = (css.match(/\.signup-modal \{[\s\S]*?\n\}/) || [''])[0];
  if (/visibility/.test(base)) {
    problems.push('.signup-modal animates visibility, and the browser refuses to focus a panel still marked hidden');
  }

  if (!/showModal\(\)/.test(script)) problems.push('newsletter.js never opens the dialog modally, so the keyboard is not trapped in it');
  if (!/body:has\(\.signup-modal\[open\]\)/.test(css)) problems.push('nothing stops the page scrolling behind the open dialog');
  if (/signup-modal-open/.test(script) || /body\.signup-modal-open/.test(css)) problems.push('a script still toggles a scroll-lock class the CSS handles on its own');

  // A button inside the form would submit it; a stray promise would repeat the
  // mistake the popup exists to replace.
  if (pageHtml.indexOf('<dialog class="signup-modal"') < pageHtml.indexOf('</form>')) {
    problems.push('the dialog markup sits inside the form, so its buttons would submit it');
  }
  const untyped = (pageHtml.match(/<button(?![^>]*type="button")[^>]*class="[^"]*signup-modal/g) || []).length;
  if (untyped) problems.push(`${untyped} dialog button(s) default to type="submit"`);
  if (/15%|discount|voucher/i.test((pageHtml.match(/<dialog class="signup-modal"[\s\S]*?<\/dialog>/) || [''])[0])) {
    problems.push('the confirmation copy promises a discount no code in this repo can issue');
  }

  check('newsletter confirmation popup (markup, styles, script agree)',
    problems.length === 0, problems.slice(0, 4).join(', ') || 'dialog opens, closes and returns focus');
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

/**
 * The "prices in your money" feature spans six files: the rates route, api.js,
 * shared.js, market.js, the class list it hunts for prices in, and the
 * stylesheet that styles both the ≈ hint and the notice line. Every one of those
 * links fails silently — a renamed price class just means that price stops
 * converting, a picker that stores its country under another key leaves the page
 * reading pounds, and nobody notices on a UK browser where nothing converts at
 * all.
 */
function checkLocalCurrency() {
  const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8');
  const route = read('server', 'routes', 'rates.js');
  const mounted = read('server', 'index.js');
  const api = read('public', 'js', 'api.js');
  const script = read('public', 'js', 'shared.js');
  const picker = read('public', 'js', 'market.js');
  const components = read('public', 'css', 'components.css');
  const markup = [
    read('server', 'views', 'partials', 'cart-drawer.html'),
    read('server', 'views', 'pages', 'cart.html'),
  ].join('\n') + fs.readdirSync(path.join(ROOT, 'public', 'js'))
    .filter(f => f.endsWith('.js'))
    .map(f => read('public', 'js', f)).join('\n');

  const problems = [];
  if (!/app\.use\('\/api\/rates'/.test(mounted)) problems.push('GET /api/rates is not mounted');
  if (!/open\.er-api\.com/.test(route)) problems.push('the rates route names no upstream');
  if (!/GBP/.test(route) || !/base: 'GBP'/.test(route)) problems.push('the rates route is not anchored on GBP');
  if (!/apiFetch\('\/rates'\)/.test(api)) problems.push('api.js never calls /rates');
  if (!/window\.ratesAPI\s*=/.test(api)) problems.push('api.js does not expose ratesAPI');

  if (!/REGION_CURRENCY/.test(script)) problems.push('shared.js has no region to currency map');
  if (!/!== 'GBP'/.test(script)) {
    problems.push('a UK visitor would be shown a conversion of pounds into pounds');
  }
  if (!/price-approx/.test(script)) problems.push('shared.js writes no hint element');

  // The header picker and the price rewrite have to agree on one map and one
  // stored country, or the option a shopper clicks promises money the page never
  // prints.
  if (!/window\.emmMarket/.test(script)) {
    problems.push('shared.js never asks the picker which country was chosen, so prices stay in pounds');
  }
  if (!/window\.emmCurrency\s*=/.test(script)) {
    problems.push('shared.js exports no country to currency lookup for the picker labels');
  }
  if (!/emmCurrency/.test(picker) || !/currencyForCountry/.test(picker)) {
    problems.push('market.js labels its options without the map the prices use');
  }
  if (!/el\.textContent = figure/.test(script)
    || !/order is charged in British pounds/.test(script)) {
    problems.push('a converted price does not say which currency the order is charged in');
  }
  if (!/currency-notice/.test(script)) problems.push('shared.js writes no page-level currency notice');
  if (!/\.currency-notice \{/.test(components)) problems.push('components.css has no .currency-notice rule');

  const selectors = (script.match(/const PRICE_SELECTOR = \[([\s\S]*?)\]\.join/) || [, ''])[1]
    .split(',')
    .map(s => s.trim().replace(/^['`]|\s*['`]$/g, '').replace(/^[.#]/, ''))
    .filter(Boolean);
  if (selectors.length < 5) problems.push('the price selector list looks truncated');
  const stale = selectors.filter(name => !markup.includes(name));
  if (stale.length) problems.push(`nothing renders ${stale.join(', ')}, so those prices never get a hint`);

  for (const rule of ['.price-approx {', '.price-approx-note {']) {
    if (!components.includes(rule)) problems.push(`components.css has no ${rule} rule`);
  }
  if (!/display: block/.test(components.slice(components.indexOf('.price-approx {')))) {
    problems.push('the hint is not block-level, so it would sit on the price instead of under it');
  }
  if (!/guidance only/.test(script)) problems.push('nothing tells the shopper the ≈ figure is not the charge');

  check('local-currency prices (rates route, picker and both display modes)',
    problems.length === 0, problems.slice(0, 4).join(', ') || 'route, client, picker, script, selectors and CSS all agree');
}

function checkShippingTotals() {
  const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8');
  // The fragment documents the removed fields by name, so only real GraphQL
  // counts here.
  const gql = source => source
    .split('\n')
    .filter(line => !/^\s*(\*|\/\*|\/\/)/.test(line))
    .join('\n');
  const fields = read('server', 'shopify', 'cartFields.js');
  const cartJs = read('public', 'js', 'cart.js');
  const cartPage = read('public', 'js', 'cart-page.js');
  const markup = read('server', 'views', 'pages', 'cart.html');

  // Every one of these hands a cart back to the browser, which stores it
  // verbatim — so they all have to answer with the same fields.
  const replies = ['cartCreate.js', 'cartLinesAdd.js', 'cartLinesUpdate.js',
    'cartDeliveryAddressUpdate.js', 'cartDeliveryOptionsUpdate.js'];

  const problems = [];

  if (!/deliveryGroups\(first:/.test(fields)) {
    problems.push('the shared cart fragment has no delivery groups');
  }
  if (!/estimatedCost/.test(fields)) {
    problems.push('delivery options are not priced with estimatedCost, which is the only price CartDeliveryOption has');
  }

  for (const file of replies) {
    const source = read('server', 'shopify', 'mutations', file);
    if (!/\$\{CART_FIELDS\}/.test(source)) problems.push(`${file} builds its own cart fields instead of the shared fragment`);
    if (/\bdeliveryGroups\(first:/.test(source)) problems.push(`${file} repeats delivery groups outside the fragment`);
  }

  const allSources = replies.map(f => gql(read('server', 'shopify', 'mutations', f))).join('\n');
  for (const dropped of ['totalShippingAmount', 'totalTaxAmount', 'totalDutyAmount']) {
    if (allSources.includes(dropped) || gql(fields).includes(dropped)) {
      problems.push(`a cart query asks for ${dropped}, which 2025-10 removed from CartCost`);
    }
  }
  if (/deliveryOptions \{[\s\S]*?\bcost \{/.test(gql(fields)) || /selectedDeliveryOption \{[\s\S]*?\bcost \{/.test(gql(fields))) {
    problems.push('a delivery option is priced with cost{}, which does not exist on CartDeliveryOption');
  }

  const address = read('server', 'shopify', 'mutations', 'cartDeliveryAddressUpdate.js');
  const options = read('server', 'shopify', 'mutations', 'cartDeliveryOptionsUpdate.js');
  if (!/cartDeliveryAddressesReplace\(/.test(address)) problems.push('the address quote does not call cartDeliveryAddressesReplace');
  if (!/cartSelectedDeliveryOptionsUpdate\(/.test(options)) problems.push('the rate choice does not call cartSelectedDeliveryOptionsUpdate');

  if (!/return null;/.test(cartJs)) problems.push('cart.js cannot tell "no rate quoted" from a free rate');
  const grand = (cartJs.match(/getGrandTotal\(\) \{([\s\S]*?)\n  \}/) || [, ''])[1];
  if (!/totalAmount/.test(grand)) problems.push('the grand total no longer comes from cost.totalAmount');
  if (/getShippingAmount/.test(grand)) problems.push('shipping is being added to a total that already contains it');

  for (const state of ['Calculated at checkout', 'Free']) {
    if (!cartPage.includes(state)) problems.push(`the shipping row never says "${state}"`);
  }
  if (!/getGrandTotal\(\)/.test(cartPage)) problems.push('the cart page does not print the grand total');
  for (const row of ['cart-subtotal', 'cart-shipping', 'cart-total']) {
    if (!markup.includes(`id="${row}"`)) problems.push(`the summary has no #${row} row`);
  }
  if (/id="cart-total"[\s\S]*id="cart-shipping"/.test(markup)) {
    problems.push('the Total row sits above Shipping, so the summary does not read as arithmetic');
  }

  check('shipping is quoted, kept and inside the total',
    problems.length === 0, problems.slice(0, 4).join(', ') || 'fragment, mutations, cart math and summary rows all agree');
}

/**
 * The published delivery prices the cart page falls back to. Shopify is what
 * charges, so this table only earns its place by (a) matching the zones the
 * merchant configured to the penny and (b) staying out of the way whenever
 * Shopify quoted the address for real.
 */
function checkPublishedShippingRates() {
  const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8');
  const { quoteFor, ZONES } = require('../shipping');
  const mounted = read('server', 'index.js');
  const api = read('public', 'js', 'api.js');
  const cartPage = read('public', 'js', 'cart-page.js');
  const markup = read('server', 'views', 'pages', 'cart.html');
  const components = read('public', 'css', 'components.css');

  const problems = [];

  const priceOf = option => String((option && option.cost || {}).amount);
  const uk = quoteFor('GB');
  const de = quoteFor('DE');
  const au = quoteFor('AU');
  const za = quoteFor('ZA');
  const us = quoteFor('US');

  if (!uk || uk.options.length !== 2 || priceOf(uk.options[0]) !== '0.00' || !uk.options[0].free
      || priceOf(uk.options[1]) !== '28.00') {
    problems.push('the UK row is not free standard plus a £28 express');
  }
  if (!de || de.zone.indexOf('EU') !== 0 || priceOf(de.options[0]) !== '14.99') {
    problems.push('Germany is not priced at £14.99 in the EU zone');
  }
  const euSize = (ZONES.find(z => z.id === 'eu').countries || []).length;
  if (euSize !== 27) problems.push(`the EU zone lists ${euSize} countries, not 27`);
  if (!au || priceOf(au.options[0]) !== '23.99' || au.priced !== true) {
    problems.push('Australia, a named International country, is not priced at £23.99');
  }
  // The measured case behind the rule: Shopify's checkout told a South African
  // buyer the item cannot be delivered while this table quoted them £23.99,
  // because a catch-all row stood in for the ten International countries nobody
  // has named. An unnamed code now earns no price — and still no refusal.
  for (const [label, quote] of [['South Africa', za], ['the United States', us]]) {
    if (!quote) problems.push(`${label} got no answer at all`);
    else if (quote.priced || quote.options.length) {
      problems.push(`${label} is not in any named zone but was given a published price`);
    }
  }
  for (const junk of ['ZZ', '', 'DEU', 'G', null, undefined, 42]) {
    if (quoteFor(junk)) problems.push(`${JSON.stringify(junk)} was given a delivery price`);
  }
  for (const quote of [uk, de, au].filter(Boolean)) {
    for (const option of quote.options) {
      if (option.cost.currencyCode !== 'GBP') problems.push(`${option.title} is not priced in GBP`);
      if (!option.eta) problems.push(`${option.title} names no delivery time`);
    }
  }

  if (!/app\.use\('\/api\/shipping'/.test(mounted)) problems.push('GET /api/shipping/quote is not mounted');
  if (!/window\.shippingAPI\s*=/.test(api)) problems.push('api.js does not expose shippingAPI');
  if (!/\/shipping\/quote\?country=/.test(api)) problems.push('api.js never calls /shipping/quote');

  // The whole point: a live quote from Shopify must win over our own table.
  if (!/rates\.length > 0/.test(cartPage)) problems.push('the cart page does not prefer Shopify\'s quote');
  if (!/showPublishedEstimate\(countryCode\)/.test(cartPage)) problems.push('the cart page never falls back to the published price');
  if (!/getShippingRates\(\)/.test(cartPage)) problems.push('the cart page cannot read Shopify\'s delivery options');

  // A destination no published zone names has nothing to list, and the page must
  // say "no standing price" rather than either inventing one or claiming Shopify
  // refused the address — ten International zone countries are still unnamed.
  if (!/quote\.options\.length === 0/.test(cartPage)) problems.push('the cart page has no branch for a destination no zone names');
  if (!/do not name this destination/.test(cartPage)) problems.push('the unpriced destination says nothing about the zones');
  if (/cannot be delivered|not available for delivery/.test(cartPage)) problems.push('the cart page claims a refusal the published table cannot know');

  for (const id of ['shipping-estimate', 'shipping-estimate-list', 'shipping-estimate-note']) {
    if (!markup.includes(`id="${id}"`)) problems.push(`the cart template has no #${id}`);
  }
  for (const rule of ['.shipping-estimate {', '.shipping-estimate-item {', '.shipping-estimate-note {']) {
    if (!components.includes(rule)) problems.push(`components.css has no ${rule} rule`);
  }

  check('published delivery prices back every destination Shopify cannot quote',
    problems.length === 0, problems.slice(0, 4).join(', ') || 'table, route, client, markup and styles all agree');
}

/**
 * Every form's one-line reply is a `.form-status` paragraph, and two of the four
 * scripts that write one — reviews.js and newsletter.js — change only its class.
 * So the CSS has to do the revealing: hidden while empty, shown under either state
 * class. When the base rule hid the box and no state class brought it back, a
 * review that had been accepted and stored looked exactly like a dead button.
 */
function checkFormStatusMessages() {
  const css = fs.readFileSync(path.join(ROOT, 'public', 'css', 'components.css'), 'utf8');
  const problems = [];

  const block = selector => (css.match(new RegExp(`${selector.replace(/\./g, '\\.')} \\{[\\s\\S]*?\\n\\}`)) || [''])[0];

  const base = block('.form-status');
  if (!/display:\s*none/.test(base)) problems.push('.form-status no longer hides itself while empty');
  for (const state of ['.form-status.is-success', '.form-status.is-error']) {
    if (!/display:\s*block/.test(block(state))) problems.push(`${state} never reveals the box`);
  }

  check('a form has something to say, and CSS lets it say it',
    problems.length === 0, problems.join(', ') || 'hidden while empty, shown under either state class');
}

/**
 * The header row is one flex line on a desktop, and at 360px that line needs
 * 467px of it. Before this check existed the store name was squeezed into a
 * 74px column, wrapped to three lines, and — nothing clipping it — its words
 * painted straight through the country picker.
 *
 * The rules that stop that are split over two files, because each file owns
 * its own selectors: main.css lays the row out, components.css keeps the
 * picker from widening it. So this reads both.
 */
function checkMobileHeader() {
  const problems = [];

  const block = (text, at) => {
    if (at === -1) return '';
    let i = text.indexOf('{', at), depth = 0;
    const start = i;
    for (; i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}' && --depth === 0) return text.slice(start + 1, i);
    }
    return '';
  };
  const media = (css, query) => {
    const blocks = [];
    for (let at = css.indexOf(`@media ${query}`); at !== -1; at = css.indexOf(`@media ${query}`, at + 1)) {
      blocks.push(block(css, at));
    }
    return blocks;
  };
  const rule = (text, selector) => block(text, text.indexOf(selector));

  const PHONE = '(max-width: 640px)';
  const main = fs.readFileSync(path.join(ROOT, 'public', 'css', 'main.css'), 'utf8');
  const components = fs.readFileSync(path.join(ROOT, 'public', 'css', 'components.css'), 'utf8');

  const row = media(main, PHONE).join('\n');
  if (!row) problems.push('main.css has no phone-width header block');
  if (!/flex-wrap:\s*wrap/.test(rule(row, '.header-content'))) {
    problems.push('.header-content cannot wrap, so the controls squeeze the store name');
  }
  if (!/flex-basis:\s*100%/.test(rule(row, '.header-actions'))) {
    problems.push('.header-actions no longer takes a line of its own');
  }

  const name = rule(row, '.logo span');
  if (!/white-space:\s*nowrap/.test(name)) problems.push('the store name wraps to several lines again');
  if (!/overflow:\s*hidden/.test(name)) problems.push('nothing clips the store name');
  if (!/text-overflow:\s*ellipsis/.test(name)) problems.push('so a name too long for the line runs out under the picker');

  const shrinkable = media(components, PHONE)
    .some(b => /min-width:\s*0/.test(rule(b, '.country-picker')));
  if (!shrinkable) {
    problems.push('the country picker cannot shrink below its longest option');
  }

  check('a phone header keeps the store name off the currency picker',
    problems.length === 0,
    problems.join(', ') || 'brand on its own line, controls on the next, name clipped rather than spilled');
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

async function postJson(name, pathname, payload, assert) {
  let r;
  try {
    const res = await fetch(BASE + pathname, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    r = { status: res.status, data: await res.json().catch(() => null) };
  } catch (err) {
    check(name, false, err.message);
    return;
  }
  const detail = assert(r.status, r.data);
  check(name, detail === true, typeof detail === 'string' ? detail : 'assertion failed');
}

/**
 * A product published in Shopify since the last build has no file of its own,
 * and used to 404 — which is exactly how the emCrown wig reached a customer.
 * Three separate files now have to agree for that to stay fixed: the build has
 * to write the fallback, public/vercel.json has to route unknown handles to it,
 * and the page it generates has to stay out of the index while still booting the
 * renderer. Nothing fails loudly if one of them drifts, so this is the check.
 */
function checkProductFallback() {
  const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8');

  const built = read('server', 'scripts', 'build-pages.js');
  check('the build writes the product fallback page',
    /writePage\('pages\/product\.html'/.test(built) && /productFallbackMeta\(\)/.test(built));

  // Read from the copy measured live in production, so a rewrite that exists only
  // in the repository-root twin cannot pass this check.
  const { rewrites = [] } = JSON.parse(read('public', 'vercel.json'));
  const rule = rewrites.find(r => String(r.source).startsWith('/products/'));
  // cleanUrls answers the .html form of any page with a 308 to the extensionless
  // address, so a rewrite naming that .html form never reaches the file and every
  // unknown handle still 404s.
  check('an unknown product handle routes to it',
    !!rule && rule.destination === '/pages/product',
    `rewrite is ${JSON.stringify(rule || null)}`);

  const fallback = require('../pageMeta').productFallbackMeta();
  check('the fallback is built to stay out of search results',
    fallback.noindex === true && !fallback.canonical,
    `noindex ${fallback.noindex}, canonical ${fallback.canonical}`);

  const html = read('public', 'pages', 'product.html');
  check('the committed fallback is noindex with no canonical of its own',
    /content="noindex/.test(html) && !/rel="canonical"/.test(html));
  check('the committed fallback still boots the product renderer',
    /id="product-page"/.test(html) && /\/js\/product\.js/.test(html),
    'needs #product-page and product.js');

  // The handle's own page is the indexable one. If the fallback were ever used
  // for products that do have a file, every product URL would be noindex.
  check('a built product page remains indexable',
    /content="index, follow"/.test(read('public', 'products', 'emcrown-premium-straight-wig.html')));
  check('the fallback is not advertised in the sitemap',
    !/pages\/product/.test(read('public', 'sitemap.xml')));
}

/**
 * Probed on `www.emmluxuryhair.com`: the rewrite that only `public/vercel.json`
 * declares is live, and the 301s that only the repository-root copy declares are
 * absent — so `public/` is the copy Vercel reads, because that is this project's
 * Root Directory.
 *
 * The root copy is kept anyway, as an identical twin. Root Directory is a
 * dashboard setting rather than a fact in this repository, and commit `5b00676`
 * failed to deploy over a rule that only ever lived at the root, so the setting
 * has demonstrably pointed elsewhere before. If it moved back and the copy there
 * lacked `cleanUrls` — which defaults to `false` — every extensionless address on
 * the shop would 404 silently. Equality is what makes that impossible, and it is
 * cheap: one comparison here instead of an outage in production.
 */
function checkVercelConfig() {
  const rootFile = path.join(ROOT, 'vercel.json');
  const publicFile = path.join(ROOT, 'public', 'vercel.json');
  const both = fs.existsSync(rootFile) && fs.existsSync(publicFile);
  check('both candidate routing configs exist, whichever one Vercel reads',
    both, 'a missing copy would leave the read config without cleanUrls and 404 the site');
  if (!both) return;

  const rootText = fs.readFileSync(rootFile, 'utf8');
  const publicText = fs.readFileSync(publicFile, 'utf8');
  check('the two routing configs are identical, so the unread one cannot drift',
    rootText === publicText, rootText === publicText ? '' : 'they name different rules for the same host');

  let config;
  try {
    config = JSON.parse(publicText);
  } catch (err) {
    check('public/vercel.json parses', false, err.message);
    return;
  }

  // Without this, every extensionless address the site links to — /cart,
  // /products/<handle>, /collections/all — is a 404.
  check('clean URLs are switched on', config.cleanUrls === true,
    `cleanUrls is ${JSON.stringify(config.cleanUrls)}`);

  const targets = (config.redirects || []).map(r => r.destination);
  const hasPage = url => {
    const base = url.replace(/^\//, '').replace(/\/$/, '');
    return ['', '.html'].some(ext => fs.existsSync(path.join(ROOT, 'public', base + ext)))
      || fs.existsSync(path.join(ROOT, 'public', base, 'index.html'));
  };
  const dead = targets.filter(dest => !/^https?:\/\//.test(dest) && !hasPage(dest));
  check('every redirect names a page that exists',
    dead.length === 0,
    dead.length ? `no page at: ${dead.join(', ')}` : `${targets.length} redirect(s) checked`);
}

/**
 * A policy one host too tight fails silently: the page still renders and the buy
 * button stops working, with nothing but a console message to show for it. So do
 * not trust the directive list as written — derive the hosts and require each.
 *
 * Two sources, because one is not enough:
 *   - the committed files, for what a page loads on its own. Only fetching
 *     positions count: src/srcset/href/poster on a resource element, CSS url(),
 *     and origins named in the shipped JS. A bare anchor href navigates rather
 *     than fetches, which is why https://wa.me and the canonical links stay out,
 *     and `og:image` is fetched by crawlers rather than by this page's browser.
 *   - the live API, for what arrives at runtime. Every product image URL comes
 *     from `/api/products`, so `cdn.shopify.com` appears in no committed page in
 *     a position a browser loads — the static half alone would pass a policy that
 *     blocked every picture on the shop.
 */
async function checkContentSecurityPolicy() {
  let config;
  try {
    config = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'vercel.json'), 'utf8'));
  } catch (err) {
    check('the CSP is readable from public/vercel.json', false, err.message);
    return;
  }

  const rule = (config.headers || []).find(h => h.source === '/(.*)');
  const csp = rule && (rule.headers || []).find(h => h.key === 'Content-Security-Policy');
  check('every route ships a Content-Security-Policy', !!csp,
    'no CSP header for source /(.*) in the config Vercel reads');
  if (!csp) return;

  const allowed = new Set((csp.value.match(/https?:\/\/[a-z0-9.-]+/gi) || [])
    .map(u => u.replace(/^https?:\/\//i, '').toLowerCase()));

  const loaded = new Set();
  const addUrl = url => loaded.add(url.replace(/^https?:\/\//i, '').split('/')[0].toLowerCase());
  const grab = (name, text) => {
    for (const tag of text.match(/<(?:link|img|script|source|iframe|embed|input|track)\b[^>]*>/gi) || [])
      for (const m of tag.matchAll(/\b(?:src|srcset|href|poster)\s*=\s*["'](https?:\/\/[^"'\s]+)/gi)) addUrl(m[1]);
    for (const m of text.matchAll(/url\(\s*["']?(https?:\/\/[^"')\s]+)/gi)) addUrl(m[1]);
    if (name.endsWith('.js'))
      for (const m of text.matchAll(/["'`](https?:\/\/[^"'`\s]+)/g)) addUrl(m[1]);
  };
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.vercel' || entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(?:html|css|js)$/.test(entry.name))
        grab(entry.name, fs.readFileSync(full, 'utf8'));
    }
  };
  walk(path.join(ROOT, 'public'));

  const catalogue = await (await fetch(`${BASE}/api/products?first=100`)).json();
  for (const product of catalogue.products || []) {
    for (const image of product.images || []) if (image.url) addUrl(image.url);
    for (const variant of product.variants || [])
      if (variant.image) addUrl(typeof variant.image === 'string' ? variant.image : variant.image.url);
    // A description is injected as HTML, so an image embedded in it is fetched too.
    for (const m of (product.descriptionHtml || '').matchAll(/\bsrc\s*=\s*["'](https?:\/\/[^"'\s]+)/gi)) addUrl(m[1]);
  }
  check('the catalogue handed the CSP something to cover', (catalogue.products || []).length > 0,
    'no products, so the runtime half of this check proved nothing');

  // 'self' means the origin the page is served from, and nothing wider: the API
  // host shares the domain but is a different origin on www, so a policy that
  // dropped it from connect-src has to fail here rather than be excused by a
  // domain-suffix match. localhost is the origin api.js names for a page opened
  // off disk, which no customer loads and no policy should grant.
  const own = new Set(['www.emmluxuryhair.com', 'emmluxuryhair.com']);
  const loopback = h => /^(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(h);
  const fetched = [...loaded].filter(h => !own.has(h) && !loopback(h));
  const missing = fetched.filter(h => !allowed.has(h));
  check('the CSP covers every host a page fetches, built or live',
    missing.length === 0,
    missing.length ? `blocked by the policy: ${missing.join(', ')}`
      : `grants ${[...allowed].join(', ') || "'self' only"}`);
}

async function run(server) {
  checkNoBom();
  checkBakedPages();
  checkProductFallback();
  checkVercelConfig();
  await checkContentSecurityPolicy();
  checkPaymentStrip();
  checkNewsletter();
  checkSignupDialog();
  checkMobileNav();
  checkLocalCurrency();
  checkShippingTotals();
  checkPublishedShippingRates();
  checkFormStatusMessages();
  checkMobileHeader();

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

  // A subscriber list is PII, so it must have no read side at all — and a
  // malformed address has to fail validation before anything is stored.
  await json('/api/subscribers has no read endpoint', '/api/subscribers', (s, d) => (
    s === 404 && d && d.error === 'Unknown API endpoint'
  ));
  await postJson('/api/subscribers rejects a malformed address', '/api/subscribers', { email: 'not-an-address' }, (s, d) => (
    s === 400 && d && d.error ? true : `status ${s}, ${JSON.stringify(d || {}).slice(0, 120)}`
  ));

  await json('unknown API endpoint 404s as JSON', '/api/nope', (s, d) => (
    s === 404 && d && d.error === 'Unknown API endpoint'
  ));

  // The cart page's fallback: a priced destination, and Shopify's placeholder
  // for "no country yet", which must not be handed a price.
  await json('/api/shipping/quote prices an EU destination', '/api/shipping/quote?country=DE', (s, d) => (
    s === 200 && d && d.options && d.options[0]
    && d.options[0].cost.amount === '14.99' && d.options[0].cost.currencyCode === 'GBP'
    && !!d.options[0].eta ? true : `status ${s}, ${JSON.stringify(d || {}).slice(0, 120)}`
  ));
  await json('/api/shipping/quote refuses Shopify\'s "no country"', '/api/shipping/quote?country=ZZ', (s, d) => (
    s === 400 && d && d.error ? true : `status ${s}, ${JSON.stringify(d || {}).slice(0, 120)}`
  ));
  // A real country no zone names is a legitimate question with no price to give:
  // 400 would leave the cart page with its generic failure copy instead.
  await json('/api/shipping/quote gives no standing price to an unnamed country', '/api/shipping/quote?country=ZA', (s, d) => (
    s === 200 && d && d.priced === false && d.zone === null
    && Array.isArray(d.options) && d.options.length === 0
    ? true : `status ${s}, ${JSON.stringify(d || {}).slice(0, 120)}`
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
