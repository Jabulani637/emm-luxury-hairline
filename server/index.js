const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const express = require('express');
const cors = require('cors');

const PROJECT_ROOT = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(PROJECT_ROOT, 'public');

const app = express();
const PORT = process.env.PORT || 3000;
// Middleware
app.use(cors());
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
app.use('/api/custom-orders', require('./routes/customOrders'));

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
