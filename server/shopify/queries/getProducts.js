const { shopifyFetch } = require('../client');

const PRODUCT_FRAGMENT = `
  fragment ProductFields on Product {
    id
    handle
    title
    description
    descriptionHtml
    availableForSale
    tags
    priceRange {
      minVariantPrice {
        amount
        currencyCode
      }
      maxVariantPrice {
        amount
        currencyCode
      }
    }
    options {
      id
      name
      values
    }
    images(first: 10) {
      edges {
        node {
          url
          altText
          width
          height
        }
      }
    }
    variants(first: 100) {
      edges {
        node {
          id
          title
          availableForSale
          quantityAvailable
          price {
            amount
            currencyCode
          }
          compareAtPrice {
            amount
            currencyCode
          }
          selectedOptions {
            name
            value
          }
          image {
            url
            altText
            width
            height
          }
        }
      }
    }
  }
`;

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

function normalizeProduct(node) {
  return {
    id: node.id,
    handle: node.handle,
    title: node.title,
    description: node.description,
    descriptionHtml: node.descriptionHtml,
    availableForSale: node.availableForSale,
    tags: node.tags || [],
    priceRange: node.priceRange,
    options: node.options || [],
    images: (node.images?.edges || []).map(e => e.node),
    variants: (node.variants?.edges || []).map(e => e.node),
  };
}

/**
 * Fetch a list of products, optionally sorted/filtered
 */
async function getProducts({ first = 8, sortKey = 'BEST_SELLING', reverse = false, query } = {}) {
  const data = await shopifyFetch({
    query: GET_PRODUCTS_QUERY,
    variables: { first, sortKey, reverse, query },
  });

  return data.products.edges.map(e => normalizeProduct(e.node));
}

module.exports = { getProducts };
