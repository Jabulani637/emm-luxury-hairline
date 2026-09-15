const axios = require('axios');

const SHOP = process.env.SHOPIFY_STORE || process.env.SHOPIFY_STORE_DOMAIN;

function resolveStorefrontToken() {
  const candidates = [
    process.env.STOREFRONT_TOKEN,
    process.env.SHOPIFY_PUBLIC_ACCESS_TOKEN,
    process.env.SHOPIFY_STOREFRONT_TOKEN,
  ];
  for (const t of candidates) {
    if (!t) continue;
    if (t.startsWith('shpat_')) {
      console.warn('[shopify] Skipping token with shpat_ prefix (Admin API token) — use a Storefront API token instead');
      continue;
    }
    return t;
  }
  return null;
}

const TOKEN = resolveStorefrontToken();
const API_VERSION = process.env.SHOPIFY_STOREFRONT_API_VERSION || '2024-10';

if (!SHOP || !TOKEN) {
  console.error('[shopify] SHOPIFY_STORE or STOREFRONT_TOKEN is not set. Add them to .env');
}

const endpoint = `https://${SHOP}/api/${API_VERSION}/graphql.json`;

async function shopifyFetch({ query, variables = {} }) {
  if (!SHOP || !TOKEN) throw new Error('Shopify credentials missing');

  const resp = await axios.post(endpoint, { query, variables }, {
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Storefront-Access-Token': TOKEN
    },
    timeout: 10000,
  });

  if (resp.data?.errors) {
    throw new Error(`Shopify errors: ${resp.data.errors.map(e => e.message).join('; ')}`);
  }

  return resp.data.data;
}

module.exports = { shopifyFetch };
