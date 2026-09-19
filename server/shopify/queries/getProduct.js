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
 * Fetch a single product by handle
 */
async function getProduct(handle) {
  const data = await shopifyFetch({
    query: GET_PRODUCT_QUERY,
    variables: { handle },
    bucket: 'catalog',
  });

  if (!data.product) {
    return null;
  }

  return normalizeProduct(data.product);
}

module.exports = { getProduct };
