const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const PROJECT_ROOT = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(PROJECT_ROOT, 'public');

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
// If CORS_ALLOW_ALL=1 is set in environment, reflect the Origin header to allow cross-origin requests
// (useful for debugging; prefer setting FRONTEND_URL in production).
let corsOptions;
if (process.env.CORS_ALLOW_ALL === '1') {
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

// Security headers. CSP is intentionally disabled: the frontend uses inline
// scripts (the APP_CONFIG block), which the default policy would block.
// Revisit once inline scripts are externalized / output is escaped.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// General limiter for the JSON API. /webhooks is excluded on purpose —
// those are HMAC-verified requests from Shopify and must not be throttled.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

// Strict limiter for the unauthenticated custom-order endpoint, which
// creates Shopify draft orders. Keeps abuse/spam from flooding the admin.
const customOrderLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many custom order requests. Please try again later.' },
});

app.use('/api', apiLimiter);

app.use(express.json());
// Serve the public folder from the project root
app.use(express.static(PUBLIC_DIR));

// API Routes
app.use('/api/products', require('./routes/products'));
app.use('/api/collections', require('./routes/collections'));
app.use('/api/cart', require('./routes/cart'));
app.use('/webhooks', require('./routes/webhooks'));
app.use('/api/checkout', require('./routes/checkout'));
app.use('/api/config', require('./routes/config'));
app.use('/api/countries', require('./routes/countries'));
app.use('/api/custom-orders', customOrderLimiter, require('./routes/customOrders'));

// Health check route
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Test route
app.get('/test', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'test.html'));
});

// Serve specific HTML pages
app.get('/products/product.html', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'products/product.html'));
});

app.get('/collections/collection.html', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'collections/collection.html'));
});

app.get('/cart.html', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'cart.html'));
});

app.get('/pages/custom-order.html', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'pages', 'custom-order.html'));
});

app.get('/pages/shipping-returns', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'pages', 'shipping-returns.html'));
});

app.get('/pages/contact', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'pages', 'contact.html'));
});

app.get('/pages/contact.html', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'pages', 'contact.html'));
});

// Serve static files for all other routes (fallback to index.html)
app.use((req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📦 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📁 Project root: ${PROJECT_ROOT}`);
  console.log(`📂 Public dir:   ${PUBLIC_DIR}`);
  console.log(`🔍 CWD:          ${process.cwd()}`);
  
  const shopConfigured = process.env.SHOPIFY_STORE || process.env.SHOPIFY_STORE_DOMAIN;
  const tokenCandidates = [process.env.STOREFRONT_TOKEN, process.env.SHOPIFY_PUBLIC_ACCESS_TOKEN, process.env.SHOPIFY_STOREFRONT_TOKEN];
  const tokenConfigured = tokenCandidates.find(t => t && !t.startsWith('shpat_'));
  if (!shopConfigured || !tokenConfigured) {
    console.warn('⚠️  Warning: Shopify credentials not configured. Set SHOPIFY_STORE_DOMAIN and SHOPIFY_PUBLIC_ACCESS_TOKEN environment variables.');
  } else if (process.env.SHOPIFY_STOREFRONT_TOKEN && process.env.SHOPIFY_STOREFRONT_TOKEN.startsWith('shpat_')) {
    console.warn('⚠️  Note: SHOPIFY_STOREFRONT_TOKEN has shpat_ prefix (Admin API) — using SHOPIFY_PUBLIC_ACCESS_TOKEN for Storefront API instead.');
  } else {
    console.log(`✅ Shopify store: ${shopConfigured} — Storefront token configured.`);
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
