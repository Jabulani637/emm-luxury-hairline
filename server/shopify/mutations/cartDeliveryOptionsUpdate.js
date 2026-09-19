const { shopifyFetch } = require('../client');
const { CART_FIELDS, CART_ERRORS } = require('../cartFields');

/**
 * cartDeliveryOptionsUpdate — records which rate the shopper picked so the
 * hosted checkout opens on the same one.
 *
 * The API call is now `cartSelectedDeliveryOptionsUpdate`, and the totals come
 * from the shared cart fragment: CartCost no longer exposes a shipping field of
 * its own because cost.totalAmount already includes the selected rate.
 */
const CART_DELIVERY_OPTIONS_UPDATE_MUTATION = `
  mutation cartDeliveryOptionsUpdate($cartId: ID!, $deliveryOptions: [CartSelectedDeliveryOptionInput!]!) {
    cartSelectedDeliveryOptionsUpdate(cartId: $cartId, selectedDeliveryOptions: $deliveryOptions) {
      cart {
        ${CART_FIELDS}
      }
      ${CART_ERRORS}
    }
  }
`;

async function cartDeliveryOptionsUpdate(cartId, deliveryOptions) {
  const variables = {
    cartId,
    deliveryOptions: deliveryOptions.map(opt => ({
      deliveryGroupId: opt.deliveryGroupId,
      deliveryOptionHandle: opt.deliveryOptionHandle,
    })),
  };

  const data = await shopifyFetch({
    query: CART_DELIVERY_OPTIONS_UPDATE_MUTATION,
    variables,
  });

  const payload = data.cartSelectedDeliveryOptionsUpdate;
  if (payload?.userErrors?.length) {
    throw new Error(payload.userErrors.map(e => e.message).join(', '));
  }

  return payload.cart;
}

module.exports = { cartDeliveryOptionsUpdate };
