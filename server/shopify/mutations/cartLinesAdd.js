const { shopifyFetch } = require('../client');
const { CART_FIELDS } = require('../cartFields');

const CART_LINES_ADD_MUTATION = `
  mutation cartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
    cartLinesAdd(cartId: $cartId, lines: $lines) {
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
 * Add line items to an existing cart
 */
async function cartLinesAdd(cartId, lines) {
  const data = await shopifyFetch({
    query: CART_LINES_ADD_MUTATION,
    variables: { cartId, lines },
  });

  if (data.cartLinesAdd?.userErrors?.length) {
    throw new Error(data.cartLinesAdd.userErrors.map(e => e.message).join(', '));
  }

  return data.cartLinesAdd.cart;
}

module.exports = { cartLinesAdd };
