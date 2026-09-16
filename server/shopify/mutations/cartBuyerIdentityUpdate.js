const { shopifyFetch } = require('../client');

/**
 * cartBuyerIdentityUpdate — clears the countryCode from the cart's buyer
 * identity so Shopify's hosted checkout shows the full country selector
 * instead of locking it to the store's base country (GB).
 *
 * Called once just before redirecting to checkoutUrl.
 */
const CART_BUYER_IDENTITY_UPDATE_MUTATION = `
  mutation cartBuyerIdentityUpdate($cartId: ID!, $buyerIdentity: CartBuyerIdentityInput!) {
    cartBuyerIdentityUpdate(cartId: $cartId, buyerIdentity: $buyerIdentity) {
      cart {
        id
        checkoutUrl
        buyerIdentity {
          countryCode
        }
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

/**
 * @param {string} cartId
 * @param {object} identity - pass {} to use ZZ (unspecified) which unlocks the country selector
 */
async function cartBuyerIdentityUpdate(cartId, identity = {}) {
  // Shopify uses countryCode "ZZ" as the "unspecified / let customer choose" value.
  // Passing an empty object still defaults to the store's base country (GB).
  // Explicitly setting ZZ removes the country lock so the checkout country
  // selector is fully open to any country.
  const buyerIdentity = Object.keys(identity).length > 0
    ? identity
    : { countryCode: 'ZZ' };

  const data = await shopifyFetch({
    query: CART_BUYER_IDENTITY_UPDATE_MUTATION,
    variables: {
      cartId,
      buyerIdentity,
    },
  });

  if (data.cartBuyerIdentityUpdate?.userErrors?.length) {
    const errors = data.cartBuyerIdentityUpdate.userErrors;
    throw new Error(errors.map(e => `${e.code ? `[${e.code}] ` : ''}${e.message}`).join(', '));
  }

  return data.cartBuyerIdentityUpdate.cart;
}

module.exports = { cartBuyerIdentityUpdate };
