require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
// Middleware
app.use(cors());
app.use(express.json());
// Serve the public folder from the project root (one level up from server/)
app.use(express.static(path.join(__dirname, '..', 'public')));

// API Routes
app.use('/api/products', require('./routes/products'));
app.use('/api/collections', require('./routes/collections'));
app.use('/api/cart', require('./routes/cart'));
app.use('/webhooks', require('./routes/webhooks'));
app.use('/api/checkout', require('./routes/checkout'));
app.use('/api/config', require('./routes/config'));

// Health check route
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Test route
app.get('/test', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/test.html'));
});

// Serve specific HTML pages
app.get('/products/product.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/products/product.html'));
});

app.get('/collections/collection.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/collections/collection.html'));
});

app.get('/cart.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/cart.html'));
});

// Serve static files for all other routes (fallback to index.html)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📦 Environment: ${process.env.NODE_ENV || 'development'}`);
  
  if (!process.env.SHOPIFY_STORE || !process.env.STOREFRONT_TOKEN) {
    console.warn('⚠️  Warning: Shopify credentials (SHOPIFY_STORE and STOREFRONT_TOKEN) not configured. Check your .env file.');
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
