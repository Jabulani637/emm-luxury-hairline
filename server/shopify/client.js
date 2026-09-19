const crypto = require('crypto');
const axios = require('axios');
const cache = require('../cache');
const { shopDomain, storefrontToken } = require('./env');

const SHOP = shopDomain();
const TOKEN = storefrontToken();
const API_VERSION = process.env.SHOPIFY_STOREFRONT_API_VERSION || '2025-10';

if (!SHOP || !TOKEN) {
  console.error('[shopify] SHOPIFY_STORE_DOMAIN or a Storefront API token is not set. Add them to .env');
}

const endpoint = `https://${SHOP}/api/${API_VERSION}/graphql.json`;

function cacheKey(query, variables) {
  const digest = crypto.createHash('sha1').update(query).update(JSON.stringify(variables || {})).digest('hex').slice(0, 16);
  return `${digest}`;
}

/**
 * Run a Storefront API query.
 *
 * `bucket` opts into caching: results are stored under `bucket:hash` so
 * cache.invalidate(bucket) drops them all. Only GET-style reads should pass a
 * bucket — never call this for a cart mutation you expect to be live.
 */
async function shopifyFetch({ query, variables = {}, bucket, ttlSeconds }) {
  if (!SHOP || !TOKEN) throw new Error('Shopify credentials missing');

  const run = async () => {
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
  };

  if (!bucket) return run();
  return cache.wrap(`${bucket}:${cacheKey(query, variables)}`, run, ttlSeconds);
}

function isStorefrontConfigured() {
  return Boolean(SHOP && TOKEN);
}

module.exports = { shopifyFetch, isStorefrontConfigured, API_VERSION };
