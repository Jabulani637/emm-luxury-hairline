const axios = require('axios');
const crypto = require('crypto');

// Accept either new or older env names for flexibility
const SHOP = process.env.SHOPIFY_STORE || process.env.SHOPIFY_STORE_DOMAIN;
const TOKEN = process.env.STOREFRONT_TOKEN || process.env.SHOPIFY_STOREFRONT_TOKEN;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';

if (!SHOP || !TOKEN) {
  console.warn('SHOPIFY_STORE or STOREFRONT_TOKEN not set. Some operations will fail.');
}

const apiVersion = process.env.SHOPIFY_STOREFRONT_API_VERSION || '2024-10';
const endpoint = `https://${SHOP}/api/${apiVersion}/graphql.json`;

async function handleGraphQL(query, variables = {}) {
  const resp = await axios.post(endpoint, { query, variables }, {
	headers: {
	  'Content-Type': 'application/json',
	  'X-Shopify-Storefront-Access-Token': TOKEN
	},
	timeout: 10000
  });
  return resp.data;
}

function verifyWebhook(rawBodyBuffer, expectedHmac) {
  if (!WEBHOOK_SECRET) return false;
  const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET).update(rawBodyBuffer).digest('base64');
  try {
	return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(expectedHmac));
  } catch (e) {
	return false;
  }
}

module.exports = { handleGraphQL, verifyWebhook };
