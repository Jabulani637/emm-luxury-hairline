const { shopifyFetch } = require('../client');
const { CART_FIELDS } = require('../cartFields');

/**
 * cartBuyerIdentityUpdate — put the shopper's country on the cart just before
 * opening checkout, so Shopify's delivery form starts on their own country
 * instead of the store's. It does not re-price the bag by itself: measured on the
 * live shop a US, DE or FR cart still totals GBP until a market quotes its buyers
 * in their own currency.
 *
 * The response replaces the cart the browser is holding, so it returns the same
 * fields every other cart mutation does: a slim one would drop the lines, the
 * address and the shipping rate the shopper had already chosen.
 */
const CART_BUYER_IDENTITY_UPDATE_MUTATION = `
  mutation cartBuyerIdentityUpdate($cartId: ID!, $buyerIdentity: CartBuyerIdentityInput!) {
    cartBuyerIdentityUpdate(cartId: $cartId, buyerIdentity: $buyerIdentity) {
      cart {
        ${CART_FIELDS}
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
 * @param {object} identity - { countryCode: 'US' }. A real country only:
 *   Shopify's "unspecified" ZZ zeroes the cart's total and quantity.
 */
async function cartBuyerIdentityUpdate(cartId, identity) {
  if (!identity || !Object.keys(identity).length) {
    throw new Error('cartBuyerIdentityUpdate needs a country to set');
  }

  const data = await shopifyFetch({
    query: CART_BUYER_IDENTITY_UPDATE_MUTATION,
    variables: {
      cartId,
      buyerIdentity: identity,
    },
  });

  if (data.cartBuyerIdentityUpdate?.userErrors?.length) {
    const errors = data.cartBuyerIdentityUpdate.userErrors;
    throw new Error(errors.map(e => `${e.code ? `[${e.code}] ` : ''}${e.message}`).join(', '));
  }

  return data.cartBuyerIdentityUpdate.cart;
}

module.exports = { cartBuyerIdentityUpdate };
