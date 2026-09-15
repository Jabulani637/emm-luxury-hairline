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

const GET_PRODUCT_QUERY = `
  ${PRODUCT_FRAGMENT}
  query GetProduct($handle: String!) {
    product(handle: $handle) {
      ...ProductFields
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
 * Fetch a single product by handle
 */
async function getProduct(handle) {
  const data = await shopifyFetch({
    query: GET_PRODUCT_QUERY,
    variables: { handle },
  });

  if (!data.product) {
    return null;
  }

  return normalizeProduct(data.product);
}

module.exports = { getProduct };
