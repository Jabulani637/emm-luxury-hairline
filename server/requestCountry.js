const { resolveShopperCountry, resolvePricingCountry } = require('./shopify/localization');

const HEADER = 'x-emm-country';

function sentCountry(req) {
  const sent = req.headers[HEADER];
  if (!sent) return null;
  return Array.isArray(sent) ? sent[0] : sent;
}

/**
 * Where this visitor said they are, for the routes that put a country on their
 * cart. Shopify lists the countries a buyer may check out from, and a cart
 * carrying one of them keeps its lines and its price, so this is the wider of
 * the two checks.
 */
async function shopperCountry(req) {
  const sent = sentCountry(req);
  return sent ? resolveShopperCountry(sent) : null;
}

/**
 * Where this visitor is, for the routes that read prices. Only a market Shopify
 * both quotes in its own currency and has published a catalogue to is worth
 * asking, so this returns null today and the storefront keeps showing GBP.
 */
async function pricingCountry(req) {
  const sent = sentCountry(req);
  return sent ? resolvePricingCountry(sent) : null;
}

module.exports = { shopperCountry, pricingCountry, COUNTRY_HEADER: HEADER };
