const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const PROJECT_ROOT = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(PROJECT_ROOT, 'public');

const cache = require('./cache');
const { isAdminConfigured, adminStatus } = require('./shopify/admin/client');
const { isStorefrontConfigured } = require('./shopify/client');
const { shopDomain } = require('./shopify/env');
const { isConfigured } = require('./envFlags');
const reviewsStore = require('./reviews/store');
const supabaseClient = require('./db/supabase');
const adminAuth = require('./adminAuth');

const app = express();
const PORT = process.env.PORT || 3000;

// Behind Render's reverse proxy — trust the first hop so rate limiting
// keys on the real client IP (X-Forwarded-For) rather than the proxy IP.
app.set('trust proxy', 1);

function normalizeOrigin(value) {
  if (!value) return value;
  try {
    return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).origin;
  } catch (_) {
    return value.replace(/\/$/, '');
  }
}

// CORS — allow the production frontend/backend domains and localhost dev
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'https://www.emmluxuryhair.com',
  'https://emmluxuryhair.com',
  'https://api.emmluxuryhair.com',
  normalizeOrigin(process.env.FRONTEND_URL),
  normalizeOrigin(process.env.BACKEND_URL),
].filter(Boolean);

// Build CORS options that will echo the incoming Origin when it is allowed.
// CORS_ALLOW_ALL=1 is a local debugging aid only; it is ignored in production
// because reflecting an arbitrary origin with credentials is not safe to ship.
const corsAllowAllRequested = process.env.CORS_ALLOW_ALL === '1';
const corsAllowAllActive = corsAllowAllRequested && process.env.NODE_ENV !== 'production';
if (corsAllowAllRequested && !corsAllowAllActive) {
  console.warn('⚠️  CORS_ALLOW_ALL=1 is ignored because NODE_ENV=production. Set FRONTEND_URL/BACKEND_URL instead.');
}

let corsOptions;
if (corsAllowAllActive) {
  corsOptions = {
    origin: true, // reflect request origin
    credentials: true,
    optionsSuccessStatus: 204,
    exposedHeaders: ['ETag']
  };
} else {
  corsOptions = {
    origin: function (origin, callback) {
      // Allow requests with no origin (mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);
      // Exact match allowed origins
      if (allowedOrigins.includes(origin)) return callback(null, true);
      // If FRONTEND_URL is set and origin matches its hostname (allow subpaths), permit it
      try {
        const allowedHostnames = allowedOrigins.map(o => {
          try { return new URL(o).origin; } catch (e) { return o; }
        });
        if (allowedHostnames.includes(origin)) return callback(null, true);
      } catch (e) { /* ignore */ }
      // Not allowed - do not error here (error causes no CORS headers). Return false so cors middleware will not set origin header.
      return callback(null, false);
    },
    credentials: true,
    optionsSuccessStatus: 204,
    exposedHeaders: ['ETag']
  };
}

// Apply CORS preflight handler and middleware
app.options('*', cors(corsOptions));
app.use(cors(corsOptions));

// Security headers. The policy below is only as wide as what the site actually
// loads: same-origin scripts, Google Fonts for CSS/woff2, Shopify's CDN for
// product images, and the API origin the browser resolves from /api/config.
// 'unsafe-inline' is allowed for styles (a few elements carry a style attribute)
// but deliberately NOT for scripts — no page ships an inline script anymore.
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https://cdn.shopify.com'],
      connectSrc: ["'self'", 'https://api.emmluxuryhair.com'],
      frameAncestors: ["'self'"],
      objectSrc: ["'none'"],
    },
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// Render free plan serves this app with no CDN in front of it, so gzip has to
// happen here. Catalog JSON is the biggest payload the storefront downloads.
app.use(compression());

// One site, one hostname. Search engines treat www, the apex and api.* as three
// different websites unless the others 301 to the canonical one, which splits
// every ranking signal between them. Only requests already addressed to our own
// domain are moved: a mistyped FRONTEND_URL must never bounce real visitors to
// localhost, and Render's own *.onrender.com health checks stay untouched.
const CANONICAL_ORIGIN = normalizeOrigin(process.env.FRONTEND_URL || 'https://www.emmluxuryhair.com');
// req.hostname drops the port, so the comparison host has to drop it too.
const CANONICAL_HOST = CANONICAL_ORIGIN.replace(/^\w+:\/\//, '').replace(/:\d+$/, '').toLowerCase();

app.use((req, res, next) => {
  const url = req.originalUrl || req.url;
  const host = String(req.hostname).toLowerCase();
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (!/(^|\.)emmluxuryhair\.com$/.test(host)) return next();
  if (host === CANONICAL_HOST) return next();
  // Webhooks are HMAC-signed against a fixed URL and Shopify never follows a
  // redirect, and the JSON API belongs to whichever host served the page.
  // /admin/reviews is excused for the same reason as /api: its queue is fetched
  // with relative URLs and authenticated by a cookie this process issues, so
  // bounced to www it would 404 and never sign in. Only the rest of the
  // human-facing documents move.
  if (/^\/(api|webhooks|admin)(\/|\?|$)/.test(url)) return next();
  return res.redirect(301, `${CANONICAL_ORIGIN}${url}`);
});

// General limiter for the JSON API. /webhooks is excluded on purpose —
// those are HMAC-verified requests from Shopify and must not be throttled.
// Mobile carriers put whole neighbourhoods behind one address, and a single
// catalogue page fires several API calls, so the ceiling has to be generous
// for reads. The state-changing endpoints below get their own tight limit.
const apiLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 1200,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => (req.originalUrl || req.url).startsWith('/api/health'),
  message: { error: 'Too many requests. Please wait a minute and try again.' },
});

// Cart mutations: an add-to-cart session needs a handful of these, not hundreds.
const cartWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 150,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many cart updates. Please wait a moment and try again.' },
});

// Strict limiter for the two unauthenticated form endpoints that both create
// Shopify draft orders. Keeps spam and abuse from flooding the admin.
const formSubmitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many submissions from you today. Please try again later.' },
});

app.use('/api', apiLimiter);

// Webhooks MUST be mounted before express.json(). That parser flags the
// request as already-read, which makes this router's express.raw parser skip,
// leaving req.body as a plain object — and Shopify signs the raw request bytes,
// so the HMAC cannot be reproduced from a parsed object.
app.use('/webhooks', require('./routes/webhooks'));

app.use(express.json({ limit: '32kb' }));

// robots.txt, sitemap.xml and the HTML pages. Mounted before express.static so
// legacy /foo/bar.html addresses are redirected to their canonical clean URL
// instead of the static handler serving the same document twice.
const pagesRouter = require('./routes/pages');
app.use('/', require('./routes/seo'));
app.use('/', pagesRouter);

// Serve the public folder from the project root. Assets are not content-hashed,
// so production caches them for only an hour: long enough to skip repeat
// downloads, short enough that a deploy cannot leave a visitor on a stale
// stylesheet for a day. Locally maxAge is 0 so an edit shows up on reload.
app.use(express.static(PUBLIC_DIR, {
  maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
  etag: true,
}));

// API Routes
app.use('/api/products', require('./routes/products'));
app.use('/api/collections', require('./routes/collections'));
app.use('/api/cart', cartWriteLimiter, require('./routes/cart'));
app.use('/api/config', require('./routes/config'));
app.use('/api/countries', require('./routes/countries'));
app.use('/api/custom-orders', formSubmitLimiter, require('./routes/customOrders'));
app.use('/api/contact', formSubmitLimiter, require('./routes/contact'));
app.use('/api/reviews', require('./routes/reviews'));
app.use('/api/admin/reviews', require('./routes/adminReviews'));

// Health / readiness check. Booleans only — never expose secrets or PII here.
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Server is running',
    readiness: {
      storefrontConfigured: isStorefrontConfigured(),
      adminConfigured: isAdminConfigured(),
      webhookSecretConfigured: isConfigured(process.env.WEBHOOK_SECRET),
      reviewsBackend: reviewsStore.backend(),
      moderationEnabled: adminAuth.enabled(),
      cacheEntries: cache.stats().size,
    },
  });
});

// Anything else under /api is a genuine 404. The page catch-all below returns
// HTML, which is the wrong shape for an API client.
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Unknown API endpoint' });
});

// Every HTML page is served through routes/pages.js so each one can carry its
// own title, canonical and structured data. Anything that reaches here is not
// a page, and must 404: answering with the homepage at status 200 tells search
// engines the homepage *is* that URL, which is how soft-404 penalties start.
app.use((req, res) => {
  pagesRouter.notFound(res);
});

// Last resort for anything that throws — a malformed JSON body, a rejected
// middleware. Express's default handler would write the stack trace into the
// response whenever NODE_ENV is not "production", so this keeps the detail in
// the server log and gives the visitor a flat message.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = Number.isInteger(err.status) ? err.status : (err.statusCode || 500);
  console.error(`[server] Unhandled error on ${req.method} ${req.originalUrl}:`, err);
  res.status(status >= 400 && status < 500 ? status : 500).json({
    error: status < 500 ? 'That request could not be read. Please try again.' : 'Something went wrong on our end. Please try again.',
  });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📦 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📁 Project root: ${PROJECT_ROOT}`);
  console.log(`📂 Public dir:   ${PUBLIC_DIR}`);
  console.log(`🔍 CWD:          ${process.cwd()}`);
  
  const shop = shopDomain();

  const problems = [];
  if (!shop) problems.push('SHOPIFY_STORE_DOMAIN is not set (or is not a *.myshopify.com domain) — no Shopify data can be read.');
  if (!isStorefrontConfigured()) problems.push('No usable Storefront API token — products, cart and search will fail. It must be a 32-char public token, not an shpat_ Admin token.');
  const admin = adminStatus();
  if (!admin.ok) problems.push(`${admin.reason} — custom orders and contact enquiries CANNOT reach Shopify.`);
  if (!isConfigured(process.env.WEBHOOK_SECRET)) problems.push('WEBHOOK_SECRET is missing or still a placeholder — every Shopify webhook delivery will be rejected. Set it to your custom app\'s Client Secret.');
  if (reviewsStore.backend() !== 'supabase') problems.push(`Reviews are being written to data/reviews/reviews.json, which Render deletes on every deploy — ${supabaseClient.configError() || 'check SUPABASE_URL and SUPABASE_SECRET_KEY'}`);
  if (!adminAuth.enabled()) problems.push('ADMIN_PASSWORD is not set — the review moderation queue is switched off, so no submitted review can ever be approved.');

  if (problems.length) {
    console.warn('\n⚠️  Configuration problems detected:');
    problems.forEach(p => console.warn('   • ' + p));
    console.warn('');
  } else {
    console.log(`✅ Shopify ready — store ${shop}, Storefront + Admin API configured.`);
  }
});

// Handle server errors
server.on('error', (error) => {
  console.error('Server error:', error);
});

// Keep process alive
process.on('SIGINT', () => {
  console.log('Shutting down server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
