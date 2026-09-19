const { shopifyFetch } = require('../client');
const { CART_FIELDS } = require('../cartFields');

const CART_CREATE_MUTATION = `
  mutation cartCreate($input: CartInput!) {
    cartCreate(input: $input) {
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
 * Create a new cart with a line item.
 * buyerIdentity is intentionally left empty so Shopify's hosted checkout
 * allows the customer to freely choose their own country and address.
 */
async function cartCreate(variantId, quantity = 1) {
  const data = await shopifyFetch({
    query: CART_CREATE_MUTATION,
    variables: {
      input: {
        lines: [
          {
            merchandiseId: variantId,
            quantity,
          },
        ],
        // No buyerIdentity.countryCode — leaving it unset lets Shopify
        // show the country selector at checkout instead of locking it to
        // the store's base country (GB).
      },
    },
  });

  if (data.cartCreate?.userErrors?.length) {
    throw new Error(data.cartCreate.userErrors.map(e => e.message).join(', '));
  }

  return data.cartCreate.cart;
}

module.exports = { cartCreate };
