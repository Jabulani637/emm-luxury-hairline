const axios = require('axios');

const SHOP = process.env.SHOPIFY_STORE || process.env.SHOPIFY_STORE_DOMAIN;

function looksLikeAdminToken(t) {
  if (typeof t !== 'string') return false;
  const s = t.trim();
  if (!s) return false;
  return /^(shpat_|shpss_|shpca_|sh_)/i.test(s);
}

function resolveAdminToken() {
  const directCandidates = [
    process.env.SHOPIFY_ADMIN_ACCESS_TOKEN,
    process.env.SHOPIFY_ADMIN_TOKEN,
    process.env.SHOPIFY_ADMIN_API_TOKEN,
  ];
  for (const t of directCandidates) {
    if (typeof t !== 'string') continue;
    const trimmed = t.trim();
    if (!trimmed) continue;
    return trimmed;
  }
  const fallbackCandidates = [
    process.env.SHOPIFY_STOREFRONT_TOKEN,
    process.env.STOREFRONT_TOKEN,
  ];
  for (const t of fallbackCandidates) {
    if (looksLikeAdminToken(t)) {
      return t.trim();
    }
  }
  return null;
}

const ADMIN_TOKEN = resolveAdminToken();
const ADMIN_API_VERSION = process.env.SHOPIFY_ADMIN_API_VERSION || '2024-10';

let warned = false;
function isConfigured() {
  return Boolean(SHOP && ADMIN_TOKEN);
}

function statusLog() {
  if (!SHOP) {
    return { ok: false, reason: 'SHOPIFY_STORE / SHOPIFY_STORE_DOMAIN env var missing' };
  }
  if (!ADMIN_TOKEN) {
    return { ok: false, reason: 'SHOPIFY_ADMIN_ACCESS_TOKEN env var missing' };
  }
  return { ok: true, shop: SHOP, apiVersion: ADMIN_API_VERSION };
}

const adminEndpoint = `https://${SHOP}/admin/api/${ADMIN_API_VERSION}/graphql.json`;

async function shopifyAdminFetch({ query, variables = {} }) {
  if (!isConfigured()) {
    const s = statusLog();
    throw new Error('Shopify Admin API unavailable — ' + (s.reason || 'not configured'));
  }

  const resp = await axios.post(adminEndpoint, { query, variables }, {
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': ADMIN_TOKEN,
    },
    timeout: 15000,
  });

  if (Array.isArray(resp.data?.errors) && resp.data.errors.length > 0) {
    throw new Error('Shopify Admin errors: ' + resp.data.errors.map(e => (e.message || String(e))).join('; '));
  }

  return resp.data?.data || resp.data || {};
}

// Emit a startup status once, so it's clear whether Admin integration is active.
(function bootLog() {
  const s = statusLog();
  if (s.ok) {
    console.log(`✅ Shopify Admin API: store=${s.shop} apiVersion=${s.apiVersion}`);
  } else if (!warned) {
    warned = true;
    console.warn(`⚠️  Shopify Admin API not configured — custom orders will be saved to JSON only. Reason: ${s.reason}`);
  }
})();

module.exports = {
  shopifyAdminFetch,
  isAdminConfigured: isConfigured,
  adminStatus: statusLog,
};
