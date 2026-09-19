/**
 * Every Shopify credential the server needs, resolved from exactly one place.
 *
 * This project accumulated four names for the Storefront token and three for the
 * Admin token, and whichever was read first won — which is how an Admin token
 * ended up being sent to the Storefront API and how the startup warnings became
 * impossible to interpret. Each credential now has one canonical name; the old
 * names still work, but they announce themselves so they can be deleted.
 *
 * Values are shape-checked as well as present-checked, because a placeholder
 * like "your_storefront_token_here" passes `if (process.env.X)` and then fails
 * somewhere much later as an unexplained 403.
 */
const { isConfigured } = require('../envFlags');

const CANONICAL = {
  shop: 'SHOPIFY_STORE_DOMAIN',
  storefront: 'SHOPIFY_PUBLIC_ACCESS_TOKEN',
  admin: 'SHOPIFY_ADMIN_ACCESS_TOKEN',
};

const LEGACY = {
  shop: ['SHOPIFY_STORE'],
  storefront: ['SHOPIFY_STOREFRONT_TOKEN', 'STOREFRONT_TOKEN'],
  admin: ['SHOPIFY_ADMIN_TOKEN', 'SHOPIFY_ADMIN_API_TOKEN'],
};

const warned = new Set();
function note(message) {
  if (warned.has(message)) return;
  warned.add(message);
  console.warn(message);
}

/** true to accept, or a string explaining why the value is unusable. */
const validators = {
  shop: value => (
    /^[a-z0-9-]+\.myshopify\.com$/i.test(value.replace(/\/+$/, ''))
      ? true
      : 'expected a *.myshopify.com domain, not a URL with a path or protocol'
  ),
  storefront: value => {
    if (value.startsWith('shpat_')) return 'this is an Admin API token; the Storefront API needs the 32-character public token';
    return isConfigured(value) ? true : 'not a usable token';
  },
  admin: value => {
    if (!isConfigured(value)) return 'placeholder value';
    if (!value.startsWith('shpat_')) note(`[shopify] ${CANONICAL.admin} does not start with shpat_ — double-check it is an Admin API token`);
    return true;
  },
};

function resolve(kind) {
  const canonical = CANONICAL[kind];
  const valid = validators[kind];
  const set = name => (typeof process.env[name] === 'string' && process.env[name].trim() ? name : null);
  const present = [canonical, ...LEGACY[kind]].filter(set);

  if (present.length > 1) {
    note(`[shopify] ${present.join(' and ')} are all set — using ${canonical}. Delete the others.`);
  } else if (present.length === 1 && present[0] !== canonical) {
    note(`[shopify] ${canonical} is the name this server reads; ${present[0]} works but is legacy — rename it.`);
  }

  for (const name of present) {
    const value = process.env[name].trim();
    const verdict = valid(value);
    if (verdict === true) return value;
    note(`[shopify] Ignoring ${name}: ${verdict}`);
  }
  return null;
}

const shopDomain = () => resolve('shop');
const storefrontToken = () => resolve('storefront');
const adminToken = () => resolve('admin');

module.exports = { shopDomain, storefrontToken, adminToken, CANONICAL, LEGACY };
