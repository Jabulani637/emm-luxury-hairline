const { shopifyFetch } = require('../client');

const CART_DELIVERY_ADDRESS_UPDATE_MUTATION = `
  mutation cartDeliveryAddressUpdate($cartId: ID!, $deliveryAddress: DeliveryAddressInput!) {
    cartDeliveryAddressUpdate(cartId: $cartId, deliveryAddress: $deliveryAddress) {
      cart {
        id
        checkoutUrl
        totalQuantity
        cost {
          totalAmount {
            amount
            currencyCode
          }
          subtotalAmount {
            amount
            currencyCode
          }
          totalTaxAmount {
            amount
            currencyCode
          }
          totalDutyAmount {
            amount
            currencyCode
          }
        }
        lines(first: 100) {
          edges {
            node {
              id
              quantity
              merchandise {
                ... on ProductVariant {
                  id
                  title
                  price {
                    amount
                    currencyCode
                  }
                  product {
                    title
                    handle
                    images(first: 1) {
                      edges {
                        node {
                          url
                          altText
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
        deliveryGroups(first: 10) {
          edges {
            node {
              id
              selectedDeliveryOption {
                handle
                title
                cost {
                  amount
                  currencyCode
                }
              }
              deliveryOptions {
                handle
                title
                cost {
                  amount
                  currencyCode
                }
                description
                estimatedCost {
                  amount
                  currencyCode
                }
              }
            }
          }
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

async function cartDeliveryAddressUpdate(cartId, address) {
  const variables = {
    cartId,
    deliveryAddress: {
      firstName: address.firstName || '',
      lastName: address.lastName || '',
      address1: address.address1 || '',
      address2: address.address2 || null,
      city: address.city || '',
      company: address.company || null,
      country: address.country,
      province: address.province || null,
      zip: address.zip || '',
      phone: address.phone || null,
    },
  };

  const data = await shopifyFetch({
    query: CART_DELIVERY_ADDRESS_UPDATE_MUTATION,
    variables,
  });

  if (data.cartDeliveryAddressUpdate?.userErrors?.length) {
    const errors = data.cartDeliveryAddressUpdate.userErrors;
    throw new Error(errors.map(e => `${e.code ? `[${e.code}] ` : ''}${e.message}`).join(', '));
  }

  return data.cartDeliveryAddressUpdate.cart;
}

module.exports = { cartDeliveryAddressUpdate };
