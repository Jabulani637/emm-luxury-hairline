const axios = require('axios');
const { shopDomain, adminToken, CANONICAL, LEGACY } = require('../env');

const SHOP = shopDomain();
const ADMIN_TOKEN = adminToken();
const ADMIN_API_VERSION = process.env.SHOPIFY_ADMIN_API_VERSION || '2025-10';

function isConfigured() {
  return Boolean(SHOP && ADMIN_TOKEN);
}

function statusLog() {
  if (!SHOP) {
    return { ok: false, reason: `${CANONICAL.shop} env var missing` };
  }
  if (!ADMIN_TOKEN) {
    const set = [CANONICAL.admin, ...LEGACY.admin]
      .some(name => typeof process.env[name] === 'string' && process.env[name].trim());
    return {
      ok: false,
      reason: set
        ? `${CANONICAL.admin} is set to a placeholder or unusable value, not a real shpat_ token`
        : `${CANONICAL.admin} env var missing`,
    };
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
  } else {
    console.warn(`⚠️  Shopify Admin API not configured — custom orders will be saved to JSON only. Reason: ${s.reason}`);
  }
})();

module.exports = {
  shopifyAdminFetch,
  isAdminConfigured: isConfigured,
  adminStatus: statusLog,
};
