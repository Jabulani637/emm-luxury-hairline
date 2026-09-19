const { shopifyFetch } = require('../client');
const { CART_FIELDS } = require('../cartFields');

const CART_LINES_UPDATE_MUTATION = `
  mutation cartLinesUpdate($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
    cartLinesUpdate(cartId: $cartId, lines: $lines) {
      cart {
        ${CART_FIELDS}
      }
      userErrors {
        field
        message
      }
    }
  }
`;

/**
 * Update line items in an existing cart
 */
async function cartLinesUpdate(cartId, lines) {
  const data = await shopifyFetch({
    query: CART_LINES_UPDATE_MUTATION,
    variables: { cartId, lines },
  });

  if (data.cartLinesUpdate?.userErrors?.length) {
    throw new Error(data.cartLinesUpdate.userErrors.map(e => e.message).join(', '));
  }

  return data.cartLinesUpdate.cart;
}

module.exports = { cartLinesUpdate };
