const { shopifyFetch } = require('../client');
const { PRODUCT_FRAGMENT, normalizeProduct } = require('./productFragment');

const GET_PRODUCT_QUERY = `
  ${PRODUCT_FRAGMENT}
  query GetProduct($handle: String!) {
    product(handle: $handle) {
      ...ProductFields
    }
  }
`;

/**
 * Fetch a single product by handle, priced for `country` when a shopper has
 * picked one.
 */
async function getProduct(handle, { country } = {}) {
  const data = await shopifyFetch({
    query: GET_PRODUCT_QUERY,
    variables: { handle },
    bucket: 'catalog',
    country,
  });

  if (!data.product) {
    return null;
  }

  return normalizeProduct(data.product);
}

module.exports = { getProduct };
