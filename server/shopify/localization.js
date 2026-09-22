/**
 * Which countries this store may sell to, and which of them may see prices in
 * their own currency.
 *
 * Shopify decides both, and the two answers are not the same question:
 *
 *   - `localization.availableCountries` lists the countries a buyer may check out
 *     from. Measured on the live shop, a cart that declares one of them keeps its
 *     lines and its price (£500 for GB, US, ZA, DE, AE and FR alike) and still
 *     has a working checkoutUrl, so a shopper can be asked where they are without
 *     anything else being ready.
 *   - `@inContext(country:)` asks for that country's *prices*, and a market with
 *     no products published to it answers with an empty catalogue. Converting a
 *     shopper there would trade a £500 product page for a blank one.
 *
 * So the two gates are read separately: `resolveShopperCountry` for what goes on
 * the cart, `resolvePricingCountry` for what goes inside a catalogue query.
 */
const cache = require('../cache');
const { shopifyFetch } = require('./client');

const ISO_COUNTRY = /^[A-Z]{2}$/;

// Prices and markets change rarely; both are re-read every 15 minutes.
const TTL_SECONDS = 900;

const MARKETS_QUERY = `
  query MarketCountries {
    paymentSettings {
      currencyCode
    }
    localization {
      availableCountries {
        isoCode
        name
        currency {
          isoCode
          symbol
        }
      }
    }
  }
`;

// A market Shopify lists but has not published a catalogue to answers with zero
// products, so converting a shopper's prices there would trade £500 for nothing.
const MARKET_HAS_PRODUCTS_QUERY = `
  query MarketHasProducts($country: CountryCode!) @inContext(country: $country) {
    products(first: 1) {
      edges {
        node {
          id
        }
      }
    }
  }
`;

async function getMarkets() {
  return cache.wrap('catalog:markets', async () => {
    const data = await shopifyFetch({
      query: MARKETS_QUERY,
      bucket: 'catalog',
      ttlSeconds: TTL_SECONDS,
    });

    const baseCurrency = data.paymentSettings?.currencyCode || 'GBP';
    const countries = (data.localization?.availableCountries || []).map(c => ({
      code: c.isoCode,
      name: c.name || c.isoCode,
      currency: c.currency?.isoCode || baseCurrency,
      symbol: c.currency?.symbol || '',
    }));

    return { baseCurrency, countries };
  }, TTL_SECONDS);
}

/**
 * Countries whose buyers are shown a different currency to the store's own, and
 * whose Shopify market actually carries products. Empty list means Shopify has
 * nothing to localise to yet, which is today's state: every one of the 185
 * offered countries still reads GBP.
 */
async function getPurchasableMarkets() {
  const { baseCurrency, countries } = await getMarkets();
  const candidates = countries.filter(c => c.currency !== baseCurrency);

  const settled = await Promise.all(candidates.map(async (country) => {
    const sellable = await cache.wrap(`catalog:market:${country.code}`, async () => {
      const data = await shopifyFetch({
        query: MARKET_HAS_PRODUCTS_QUERY,
        variables: { country: country.code },
      });
      return (data.products?.edges || []).length > 0;
    }, TTL_SECONDS);

    return sellable ? country : null;
  }));

  return settled.filter(Boolean);
}

/**
 * Every country Shopify lists for checkout, code and name and the currency a
 * buyer there is shown. Shopify's own answer, so the storefront's country
 * control never offers a place the shop cannot ship to.
 */
async function getAvailableCountries() {
  const { countries } = await getMarkets();
  return countries;
}

function normalized(raw) {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toUpperCase();
  return ISO_COUNTRY.test(code) ? code : null;
}

/**
 * The country to put on this shopper's cart, or null to leave it alone. A code
 * Shopify has not offered would be refused by the mutation, and the "unspecified"
 * country ZZ is not in the offered list — which is right, because measured on the
 * live shop it zeroes the cart's total and quantity.
 */
async function resolveShopperCountry(raw) {
  const code = normalized(raw);
  if (!code) return null;

  try {
    const countries = await getAvailableCountries();
    return countries.some(c => c.code === code) ? code : null;
  } catch (error) {
    // Shopify being unreachable must not cost the shopper their bag: with no
    // measured list the cart is left exactly as it was before this existed.
    console.warn('[localization] Could not measure Shopify markets:', error.message);
    return null;
  }
}

/**
 * The country to ask Shopify for prices in, or null to keep the store's own
 * currency. Stricter than a checkout country on purpose: only a market that both
 * quotes its buyers in a different currency and has products published to it has
 * anything to show, and the empty list here is today's live state.
 */
async function resolvePricingCountry(raw) {
  const code = normalized(raw);
  if (!code) return null;

  try {
    const markets = await getPurchasableMarkets();
    return markets.some(m => m.code === code) ? code : null;
  } catch (error) {
    console.warn('[localization] Could not measure Shopify markets:', error.message);
    return null;
  }
}

module.exports = {
  getMarkets,
  getAvailableCountries,
  getPurchasableMarkets,
  resolveShopperCountry,
  resolvePricingCountry,
};
