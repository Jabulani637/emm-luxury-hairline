const { shopifyFetch } = require('../client');

const CART_DELIVERY_OPTIONS_UPDATE_MUTATION = `
  mutation cartDeliveryOptionsUpdate($cartId: ID!, $deliveryOptions: [CartSelectedDeliveryOptionInput!]!) {
    cartDeliveryOptionsUpdate(cartId: $cartId, selectedDeliveryOptions: $deliveryOptions) {
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
          totalShippingAmount {
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

  if (data.cartDeliveryOptionsUpdate?.userErrors?.length) {
    const errors = data.cartDeliveryOptionsUpdate.userErrors;
    throw new Error(errors.map(e => `${e.code ? `[${e.code}] ` : ''}${e.message}`).join(', '));
  }

  return data.cartDeliveryOptionsUpdate.cart;
}

module.exports = { cartDeliveryOptionsUpdate };
