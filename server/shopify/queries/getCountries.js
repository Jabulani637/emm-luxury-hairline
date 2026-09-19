const { shopifyFetch } = require('../client');

// Storefront API 2025-10 reorganised localization data:
//   - country list moved from `shop.countries` to the root `localization.availableCountries`
//   - shop currency moved from `shop.currencyCode` to the root `paymentSettings.currencyCode`
//   - `Country` now exposes `isoCode` (was `code`) and NO LONGER exposes `provinces`,
//     so the shipping estimator's province dropdown degrades to country-only. That is a
//     Storefront API limitation, not a bug here; provinces would need another data source.
const GET_COUNTRIES_QUERY = `
  query shopCountries {
    shop {
      name
    }
    paymentSettings {
      currencyCode
    }
    localization {
      availableCountries {
        isoCode
        name
      }
    }
  }
`;

async function getCountries() {
  const data = await shopifyFetch({
    query: GET_COUNTRIES_QUERY,
    bucket: 'catalog',
    ttlSeconds: 3600,
  });

  const availableCountries = data.localization?.availableCountries || [];

  const countries = availableCountries.map(c => ({
    code: c.isoCode,
    name: c.name,
    provinces: [],
  }));

  return {
    shopName: data.shop?.name || '',
    shopCurrency: data.paymentSettings?.currencyCode || 'GBP',
    countries,
  };
}

module.exports = { getCountries };
