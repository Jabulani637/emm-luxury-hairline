/**
 * The cart fields every mutation hands back to the browser, in one place.
 *
 * Field names here were checked against the live 2025-10 Storefront schema,
 * because the shape moved under us once already:
 *   - `CartCost` only has subtotalAmount, totalAmount and checkoutChargeAmount.
 *     totalShippingAmount / totalTaxAmount / totalDutyAmount are gone, and
 *     GraphQL rejects a whole mutation for one unknown field.
 *   - `CartDeliveryOption` prices itself with `estimatedCost`; `cost` does
 *     not exist on it.
 *   - `cost.totalAmount` already includes the selected shipping rate (a £450
 *     basket with a £6.99 Express rate came back as 456.99), so shipping is
 *     displayed alongside the total but never added to it again.
 *
 * `deliveryGroups` belongs in here for the same reason the totals do: the
 * browser stores whichever cart object a mutation returned last, so if adding
 * an item came back without the groups, the rate the shopper had just picked
 * would disappear from the summary.
 */
const CART_FIELDS = `
  id
  checkoutUrl
  totalQuantity
  cost {
    subtotalAmount {
      amount
      currencyCode
    }
    totalAmount {
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
        deliveryAddress {
          countryCode
        }
        selectedDeliveryOption {
          handle
          title
          description
          estimatedCost {
            amount
            currencyCode
          }
        }
        deliveryOptions {
          handle
          title
          description
          estimatedCost {
            amount
            currencyCode
          }
        }
      }
    }
  }
`;

/** Two cart mutations can also want to know what Shopify objected to. */
const CART_ERRORS = `
  userErrors {
    field
    message
  }
`;

module.exports = { CART_FIELDS, CART_ERRORS };
