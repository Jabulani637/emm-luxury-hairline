const { shopifyFetch } = require('../client');
const { CART_FIELDS } = require('../cartFields');

/**
 * Read a cart back from Shopify by its id.
 *
 * `cart(id:)` is a query, so unlike every cart mutation it changes nothing —
 * which matters here, because putting the "unspecified" country (ZZ) on a cart
 * zeroes its total and its quantity. A cart the shopper left in localStorage for
 * a week reads back as null rather than throwing, so this is also how the
 * storefront tells "gone" from "still there".
 */
const GET_CART_QUERY = `
  query GetCart($id: ID!) {
    cart(id: $id) {
      ${CART_FIELDS}
      buyerIdentity {
        countryCode
      }
    }
  }
`;

async function getCart(cartId) {
  const data = await shopifyFetch({
    query: GET_CART_QUERY,
    variables: { id: cartId },
  });

  return data.cart || null;
}

module.exports = { getCart };
