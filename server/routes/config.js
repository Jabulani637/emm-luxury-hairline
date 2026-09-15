const express = require('express');
const router = express.Router();

// GET /api/config - expose non-sensitive public config for storefront web components
router.get('/', (req, res) => {
  const storeDomain = process.env.SHOPIFY_STORE_DOMAIN || process.env.SHOPIFY_STORE || '';
  const publicAccessToken = process.env.SHOPIFY_PUBLIC_ACCESS_TOKEN || '';

  const apiBaseUrl = `${req.protocol}://${req.get('host')}/api`;

  const product = (() => {
    try {
      const tokenCandidates = [process.env.STOREFRONT_TOKEN, process.env.SHOPIFY_PUBLIC_ACCESS_TOKEN, process.env.SHOPIFY_STOREFRONT_TOKEN];
      const tokenConfigured = tokenCandidates.find(t => t && !t.startsWith('shpat_'));
      return {
        storeConfigured: !!storeDomain,
        tokenConfigured: !!tokenConfigured,
        tokenUsesShpatPrefix: !!(process.env.SHOPIFY_STOREFRONT_TOKEN && process.env.SHOPIFY_STOREFRONT_TOKEN.startsWith('shpat_')),
      };
    } catch (_) {
      return { storeConfigured: !!storeDomain, tokenConfigured: !!publicAccessToken };
    }
  })();

  if (!storeDomain) return res.status(500).json({ error: 'store domain not configured' });
  res.json({ storeDomain, publicAccessToken, apiBaseUrl, status: product });
});

module.exports = router;
