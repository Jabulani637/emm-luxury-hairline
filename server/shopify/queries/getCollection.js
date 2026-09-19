const { shopifyFetch } = require('../client');

const PRODUCT_FRAGMENT = `
  fragment ProductFields on Product {
    id
    handle
    title
    description
    availableForSale
    tags
    priceRange {
      minVariantPrice {
        amount
        currencyCode
      }
    }
    images(first: 1) {
      edges {
        node {
          url
          altText
        }
      }
    }
  }
`;

const GET_COLLECTION_QUERY = `
  ${PRODUCT_FRAGMENT}
  query GetCollection($handle: String!, $first: Int!) {
    collection(handle: $handle) {
      id
      handle
      title
      description
      products(first: $first) {
        edges {
          node {
            ...ProductFields
          }
        }
      }
    }
  }
`;

function normalizeProduct(node) {
  return {
    id: node.id,
    handle: node.handle,
    title: node.title,
    description: node.description,
    availableForSale: node.availableForSale,
    tags: node.tags || [],
    priceRange: node.priceRange,
    images: (node.images?.edges || []).map(e => e.node),
  };
}

/**
 * Fetch a collection by handle with its products
 */
async function getCollection(handle, first = 24) {
  const data = await shopifyFetch({
    query: GET_COLLECTION_QUERY,
    variables: { handle, first },
    bucket: 'catalog',
  });

  if (!data.collection) {
    return null;
  }

  return {
    id: data.collection.id,
    handle: data.collection.handle,
    title: data.collection.title,
    description: data.collection.description,
    products: data.collection.products.edges.map(e => normalizeProduct(e.node)),
  };
}

module.exports = { getCollection };
