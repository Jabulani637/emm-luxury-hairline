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
 *
 * With no `country`, buyerIdentity is left empty and Shopify decides the market
 * itself — measured on the live shop, it predicts the buyer's country from their
 * request, which is why an untouched cart can open on a foreign checkout. When
 * the shopper has picked a country Shopify lists, that one goes on the cart
 * instead, so checkout starts where they said they live. Either way the bag stays
 * priced in the store's own currency until a market quotes its buyers in their
 * own.
 */
async function cartCreate(variantId, quantity = 1, country) {
  const input = {
    lines: [
      {
        merchandiseId: variantId,
        quantity,
      },
    ],
  };
  if (country) input.buyerIdentity = { countryCode: country };

  const data = await shopifyFetch({
    query: CART_CREATE_MUTATION,
    variables: { input },
  });

  if (data.cartCreate?.userErrors?.length) {
    throw new Error(data.cartCreate.userErrors.map(e => e.message).join(', '));
  }

  return data.cartCreate.cart;
}

module.exports = { cartCreate };
