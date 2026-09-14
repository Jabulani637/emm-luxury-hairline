const express = require('express');
const router = express.Router();

// GET /api/config - expose non-sensitive public config for storefront web components
router.get('/', (req, res) => {
  const storeDomain = process.env.SHOPIFY_STORE_DOMAIN || process.env.SHOPIFY_STORE || '';
  const publicAccessToken = process.env.SHOPIFY_PUBLIC_ACCESS_TOKEN || '';
  if (!storeDomain) return res.status(500).json({ error: 'store domain not configured' });
  res.json({ storeDomain, publicAccessToken });
});

module.exports = router;
