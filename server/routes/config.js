const express = require('express');
const router  = express.Router();
const { shopDomain, storefrontToken, adminToken } = require('../shopify/env');

function normalizeUrl(value) {
  if (!value) return value;
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return withProtocol.replace(/\/$/, '');
}

/**
 * GET /api/config
 * Exposes public, non-sensitive configuration to the frontend.
 *
 * The Storefront token is designed to be public (it is scope-limited to reading
 * published catalogue data), which is why it can be returned here. The Admin
 * token never leaves the server — it is reported as a readiness boolean only.
 *
 * Frontend reads this once on load to know:
 *   - storeDomain / publicAccessToken  → Shopify Storefront API
 *   - apiBaseUrl                       → where to send all /api/* requests
 *   - frontendUrl                      → base URL of the site (for redirects etc.)
 */
router.get('/', (req, res) => {
  const storeDomain       = shopDomain() || '';
  const publicAccessToken = storefrontToken() || '';

  // Resolve backend URL:
  //   1. BACKEND_URL env var (set this in .env or Render dashboard)
  //   2. Fallback: derive from the incoming request (works on any host)
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.get('host');
  const backendUrl  = normalizeUrl(process.env.BACKEND_URL || `${proto}://${host}`);
  const frontendUrl = normalizeUrl(process.env.FRONTEND_URL || backendUrl);
  // Use the configured backend URL when available so separate frontend/backend domains resolve correctly.
  const apiBaseUrl  = `${backendUrl}/api`;

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
      adminConfigured:      !!adminToken(),
    },
  });
});

module.exports = router;
