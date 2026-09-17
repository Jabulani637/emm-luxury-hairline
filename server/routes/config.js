const express = require('express');
const router  = express.Router();

/**
 * GET /api/config
 * Exposes public, non-sensitive configuration to the frontend.
 * All values come from environment variables — never hardcoded.
 *
 * Frontend reads this once on load to know:
 *   - storeDomain / publicAccessToken  → Shopify Storefront API
 *   - apiBaseUrl                       → where to send all /api/* requests
 *   - frontendUrl                      → base URL of the site (for redirects etc.)
 */
router.get('/', (req, res) => {
  const storeDomain       = process.env.SHOPIFY_STORE_DOMAIN || process.env.SHOPIFY_STORE || '';
  const publicAccessToken = process.env.SHOPIFY_PUBLIC_ACCESS_TOKEN || '';

  // Resolve backend URL:
  //   1. BACKEND_URL env var (set this in .env or Render dashboard)
  //   2. Fallback: derive from the incoming request (works on any host)
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.get('host');
  const backendUrl  = (process.env.BACKEND_URL || `${proto}://${host}`).replace(/\/$/, '');
  const frontendUrl = (process.env.FRONTEND_URL || backendUrl).replace(/\/$/, '');
  // compute api base from incoming request so clients receive an absolute backend API URL
  const apiBaseUrl  = `${proto}://${host}/api`;

  if (!storeDomain) {
    return res.status(500).json({ error: 'Store domain not configured. Set SHOPIFY_STORE_DOMAIN in .env' });
  }

  res.json({
    storeDomain,
    publicAccessToken,
    apiBaseUrl,
    backendUrl,
    frontendUrl,
    // diagnostic — never expose secrets, only readiness flags
    status: {
      storeConfigured:      !!storeDomain,
      tokenConfigured:      !!publicAccessToken,
      adminConfigured:      !!(process.env.SHOPIFY_ADMIN_ACCESS_TOKEN),
    },
  });
});

module.exports = router;
