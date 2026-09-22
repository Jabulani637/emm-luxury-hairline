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
 * Ask Shopify to answer as if the buyer lived in `country`, which is what makes
 * prices come back in that shopper's currency. `@inContext` is an operation
 * directive, so it goes after `query Name($var: Type)` — and the pattern is
 * anchored to the start of a line because catalogue queries open with a
 * fragment declaration that mentions neither operation.
 *
 * The code is interpolated rather than passed as a variable, so it is checked
 * here as well as in localization.js: only two uppercase letters get through.
 */
function withContext(query, country) {
  if (!country) return query;
  const code = String(country).toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) {
    throw new Error(`Refusing to put "${country}" in a Shopify query: expected a two-letter country code`);
  }
  if (query.includes('@inContext')) return query;
  return query.replace(
    /^([ \t]*(?:query|mutation)[ \t]+[A-Za-z0-9_]*[ \t]*(?:\([^)]*\))?)/m,
    `$1 @inContext(country: ${code})`
  );
}

/**
 * Run a Storefront API query.
 *
 * `bucket` opts into caching: results are stored under `bucket:hash` so
 * cache.invalidate(bucket) drops them all. Only GET-style reads should pass a
 * bucket — never call this for a cart mutation you expect to be live.
 *
 * `country` is a shopper's ISO country code, already measured against Shopify's
 * own markets by localization.js. It rewrites the query, so cached results stay
 * per-currency: a US and a GB buyer never share one entry.
 */
async function shopifyFetch({ query, variables = {}, bucket, ttlSeconds, country }) {
  if (!SHOP || !TOKEN) throw new Error('Shopify credentials missing');

  const text = withContext(query, country);

  const run = async () => {
    const resp = await axios.post(endpoint, { query: text, variables }, {
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
  return cache.wrap(`${bucket}:${cacheKey(text, variables)}`, run, ttlSeconds);
}

function isStorefrontConfigured() {
  return Boolean(SHOP && TOKEN);
}

module.exports = { shopifyFetch, isStorefrontConfigured, withContext, API_VERSION };
