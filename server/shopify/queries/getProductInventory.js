const { shopifyFetch } = require('../client');

/**
 * Stock counts live behind their own access scope
 * (`unauthenticated_read_product_inventory`), which the storefront token does not
 * have unless the app asks for it. `availableForSale` — which every product page
 * already reads — is only "at least one", so the number is a separate lookup:
 * asking for it inside the shared product fragment would make Shopify reject
 * every product page on the site the moment the scope is absent.
 *
 * Returns a `variantId → quantity` map, or null when Shopify would not say. The
 * caller shows no scarcity line at all in that case rather than guessing.
 */
const GET_INVENTORY_QUERY = `
  query GetProductInventory($handle: String!) {
    product(handle: $handle) {
      variants(first: 100) {
        nodes {
          id
          quantityAvailable
        }
      }
    }
  }
`;

async function getProductInventory(handle, { country } = {}) {
  try {
    const data = await shopifyFetch({
      query: GET_INVENTORY_QUERY,
      variables: { handle },
      bucket: 'inventory',
      ttlSeconds: 60,
      country,
    });
    if (!data?.product) return null;
    return Object.fromEntries(data.product.variants.nodes.map(v => [v.id, v.quantityAvailable]));
  } catch (err) {
    console.error('[shopify] inventory lookup failed', handle, err.message);
    return null;
  }
}

module.exports = { getProductInventory };
