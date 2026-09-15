const { shopifyFetch } = require('../client');

const GET_COUNTRIES_QUERY = `
  query shopCountries {
    shop {
      name
      currencyCode
      countries(first: 250) {
        availableShippingRates {
          count
        }
        code
        name
        provinces(first: 250) {
          code
          name
        }
      }
    }
  }
`;

async function getCountries() {
  const data = await shopifyFetch({
    query: GET_COUNTRIES_QUERY,
  });

  const shop = data.shop || {};
  const countries = (shop.countries || []).map(c => ({
    code: c.code,
    name: c.name,
    provinces: (c.provinces || []).map(p => ({
      code: p.code,
      name: p.name,
    })),
  }));

  return {
    shopName: shop.name || '',
    shopCurrency: shop.currencyCode || 'GBP',
    countries,
  };
}

module.exports = { getCountries };
