/**
 * Exchange the app's client credentials for an Admin API token that matches the
 * app's released version, then write it into .env.
 *
 *   npm run token:shopify
 *
 * A Dev Dashboard app no longer shows an Admin API token in the browser, and a
 * token minted before a scope change keeps whatever it was created with — which
 * is why `npm run verify:shopify` still reported "Access denied" after the
 * version listing all six scopes was released. This grant reads its scopes off
 * the released version, so it is the only way to get a token that matches it.
 *
 * The Client Secret is taken from WEBHOOK_SECRET, which is the same string:
 * Shopify signs webhook deliveries with the app's Client Secret, so the value
 * in that line is both the HMAC key and this exchange's client_secret.
 *
 * The token is written to .env only after it reads draft orders, orders and
 * products, so a token that authenticates but cannot do the work never replaces
 * the one already there. Its value is never printed.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const ENV_FILE = path.join(__dirname, '..', '..', '.env');
const SHOP = (process.env.SHOPIFY_STORE_DOMAIN || '').trim();
const CLIENT_ID = (process.env.SHOPIFY_CLIENT_ID || '').trim();
const CLIENT_SECRET = (process.env.WEBHOOK_SECRET || '').trim();
const API_VERSION = process.env.SHOPIFY_ADMIN_API_VERSION || '2025-10';

/** The three things this site asks the Admin API to do. A write scope carries its
 *  read scope, so one field read per resource proves the grant without touching data. */
const CAPABILITIES = [
  ['write_draft_orders', 'custom orders', '{ draftOrders(first: 1) { edges { node { name } } } }'],
  ['read_orders', 'order webhooks', '{ orders(first: 1) { edges { node { name } } } }'],
  ['read_products', 'product webhooks', '{ products(first: 1) { edges { node { title } } } }'],
];

function describe(value) {
  return value.length > 12 ? `${value.slice(0, 7)}… (${value.length} chars)` : `(${value.length} chars)`;
}

async function main() {
  const missing = [['SHOPIFY_STORE_DOMAIN', SHOP], ['SHOPIFY_CLIENT_ID', CLIENT_ID], ['WEBHOOK_SECRET', CLIENT_SECRET]]
    .filter(([, v]) => !v || /^(your|<|changeme|placeholder|todo)/i.test(v))
    .map(([k]) => k);
  if (missing.length) {
    console.error(`Cannot run: ${missing.join(', ')} is missing or still a placeholder in .env`);
    if (missing.includes('WEBHOOK_SECRET')) {
      console.error('Paste the app\'s Client Secret (starts with shpss_) into the WEBHOOK_SECRET line of .env.');
      console.error('Get it from Dev Dashboard → Emm Luxury Hairline Store → App settings → Credentials → Reveal.');
    }
    process.exit(1);
  }

  console.log(`Exchanging client credentials for ${SHOP} …`);
  let token;
  try {
    const resp = await axios.post(`https://${SHOP}/admin/oauth/access_token`, {
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'client_credentials',
    }, { timeout: 15000, validateStatus: () => true });

    if (resp.status !== 200 || !resp.data || !resp.data.access_token) {
      const why = (resp.data && (resp.data.error_description || resp.data.error)) || `HTTP ${resp.status}`;
      console.error(`Shopify refused the exchange: ${why}`);
      console.error('A 400 naming the client means the secret is not this app\'s current one —');
      console.error('check you copied "Secret New", not the revoked one above it.');
      process.exit(1);
    }
    token = resp.data.access_token;
  } catch (err) {
    console.error('Exchange failed:', err.message);
    process.exit(1);
  }

  console.log(`Got a token: ${describe(token)} — testing what it can actually do\n`);
  const endpoint = `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`;
  const failures = [];

  for (const [scope, purpose, query] of CAPABILITIES) {
    try {
      const resp = await axios.post(endpoint, { query }, {
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
        timeout: 15000,
      });
      if (Array.isArray(resp.data.errors) && resp.data.errors.length) {
        throw new Error(resp.data.errors.map((e) => e.message).join('; '));
      }
      console.log(`  ok    ${scope.padEnd(19)} ${purpose}`);
    } catch (err) {
      failures.push(scope);
      console.log(`  FAIL  ${scope.padEnd(19)} ${purpose} — ${err.message}`);
    }
  }

  if (failures.length) {
    console.log(`\nNot writing to .env: the new token is still missing ${failures.join(', ')}.`);
    console.log('Confirm the released version is marked Active, then re-run this.');
    process.exit(1);
  }

  const env = fs.readFileSync(ENV_FILE, 'utf8');
  const key = 'SHOPIFY_ADMIN_ACCESS_TOKEN';
  const line = `${key}=${token}`;
  const had = new RegExp(`^${key}=.*$`, 'm');
  const next = had.test(env) ? env.replace(had, line) : `${env.replace(/\s*$/, '')}\n${line}\n`;
  fs.writeFileSync(ENV_FILE, next);
  console.log(`\nAll three pass. Wrote the new token to .env as ${key} (${describe(token)}).`);
  console.log('Copy that line into Render as well — see npm run verify:shopify to re-check.');
}

main();
