const { shopifyFetch } = require('../client');
const { PRODUCT_FRAGMENT, normalizeProduct } = require('./productFragment');

const GET_PRODUCTS_QUERY = `
  ${PRODUCT_FRAGMENT}
  query GetProducts($first: Int!, $sortKey: ProductSortKeys, $reverse: Boolean, $query: String) {
    products(first: $first, sortKey: $sortKey, reverse: $reverse, query: $query) {
      edges {
        node {
          ...ProductFields
        }
      }
    }
  }
`;

/**
 * Fetch a list of products, optionally sorted/filtered
 */
async function getProducts({ first = 8, sortKey = 'BEST_SELLING', reverse = false, query } = {}) {
  const data = await shopifyFetch({
    query: GET_PRODUCTS_QUERY,
    variables: { first, sortKey, reverse, query },
    bucket: 'catalog',
  });

  return data.products.edges.map(e => normalizeProduct(e.node));
}

module.exports = { getProducts };
