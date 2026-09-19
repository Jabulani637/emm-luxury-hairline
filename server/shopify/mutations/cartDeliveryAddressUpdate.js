const { shopifyFetch } = require('../client');
const { CART_FIELDS, CART_ERRORS } = require('../cartFields');

/**
 * cartDeliveryAddressUpdate — puts a destination on the cart so Shopify will
 * price the delivery groups.
 *
 * This used to call `cartDeliveryAddressUpdate` in the Storefront API, which no
 * longer exists: a cart now holds a list of selectable addresses, so the quote
 * replaces that list with the one address the shopper typed in. `oneTimeUse`
 * keeps it out of the customer's saved addresses, and COUNTRY_CODE_ONLY means a
 * mistyped street or county cannot sink the whole estimate.
 */
const CART_DELIVERY_ADDRESS_UPDATE_MUTATION = `
  mutation cartDeliveryAddressUpdate($cartId: ID!, $addresses: [CartSelectableAddressInput!]!) {
    cartDeliveryAddressesReplace(cartId: $cartId, addresses: $addresses) {
      cart {
        ${CART_FIELDS}
      }
      ${CART_ERRORS}
    }
  }
`;

async function cartDeliveryAddressUpdate(cartId, address) {
  const deliveryAddress = { countryCode: address.country };
  if (address.zip) deliveryAddress.zip = address.zip;
  // provinceCode is a code (GB-LND, NY, Gauteng), never the display name:
  // the cart page sends whatever the <select> holds, which is the code.
  if (address.province) deliveryAddress.provinceCode = address.province;

  const data = await shopifyFetch({
    query: CART_DELIVERY_ADDRESS_UPDATE_MUTATION,
    variables: {
      cartId,
      addresses: [{
        address: { deliveryAddress },
        selected: true,
        oneTimeUse: true,
        validationStrategy: 'COUNTRY_CODE_ONLY',
      }],
    },
  });

  if (data.cartDeliveryAddressesReplace?.userErrors?.length) {
    throw new Error(data.cartDeliveryAddressesReplace.userErrors.map(e => e.message).join(', '));
  }

  return data.cartDeliveryAddressesReplace.cart;
}

module.exports = { cartDeliveryAddressUpdate };
