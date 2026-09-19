const { shopifyFetch } = require('../client');

const GET_COLLECTIONS_QUERY = `
  query GetCollections($first: Int!) {
    collections(first: $first) {
      edges {
        node {
          id
          handle
          title
          description
        }
      }
    }
  }
`;

/** Lists the published collections. Used to build the sitemap. */
async function getCollections(first = 100) {
  const data = await shopifyFetch({
    query: GET_COLLECTIONS_QUERY,
    variables: { first },
    bucket: 'catalog',
    ttlSeconds: 3600,
  });

  return (data.collections?.edges || []).map(e => e.node);
}

module.exports = { getCollections };
