const { shopifyAdminFetch } = require('../client');

const CREATE_DRAFT_ORDER_MUTATION = `
  mutation draftOrderCreate($input: DraftOrderInput!) {
    draftOrderCreate(input: $input) {
      draftOrder {
        id
        name
        email
        phone
        invoiceUrl
        status
        createdAt
        customer {
          id
          firstName
          lastName
          email
          phone
        }
        lineItems(first: 20) {
          edges {
            node {
              id
              title
              quantity
              variantTitle
              originalUnitPriceSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
            }
          }
        }
        subtotalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        totalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        tags
      }
      userErrors {
        field
        message
      }
    }
  }
`;

function parseName(fullName) {
  if (typeof fullName !== 'string' || !fullName.trim()) {
    return { firstName: 'Customer', lastName: '' };
  }
  const parts = fullName.trim().split(/\s+/);
  const firstName = parts.shift() || 'Customer';
  const lastName = parts.join(' ') || '';
  return { firstName, lastName };
}

function buildMoney(amountStr, currencyCode) {
  const amt = parseFloat(amountStr);
  if (!currencyCode || isNaN(amt)) return null;
  return { amount: amt.toFixed(2), currencyCode };
}

async function createDraftOrder({
  customerName,
  customerEmail,
  customerPhone,
  customerCountryCode,
  lineItems = [],
  note = '',
  tags = [],
  currencyCode = 'USD',
}) {
  const { firstName, lastName } = parseName(customerName);

  const input = {
    email: customerEmail || null,
    tags: Array.isArray(tags) && tags.length ? tags : ['custom-order'],
    note: note || null,
  };

  if (customerPhone) {
    input.phone = customerPhone;
  }

  const shippingAddress = {};
  let needsAddress = false;
  if (customerCountryCode) {
    shippingAddress.country = customerCountryCode;
    needsAddress = true;
  }
  if (firstName || lastName) {
    shippingAddress.firstName = firstName || undefined;
    shippingAddress.lastName = lastName || undefined;
    needsAddress = true;
  }
  if (needsAddress) {
    input.shippingAddress = shippingAddress;
  }

  const customAttrs = [];
  if (firstName) customAttrs.push({ key: 'first_name', value: firstName });
  if (lastName) customAttrs.push({ key: 'last_name', value: lastName });
  if (customAttrs.length > 0) {
    input.customAttributes = customAttrs;
  }

  if (currencyCode) {
    input.presentmentCurrencyCode = currencyCode;
  }

  if (lineItems && lineItems.length > 0) {
    input.lineItems = lineItems.map(item => {
      const li = {
        quantity: parseInt(item.quantity, 10) || 1,
      };

      if (item.variantId) {
        li.variantId = item.variantId;
        if (typeof item.originalUnitPrice === 'string' && !isNaN(parseFloat(item.originalUnitPrice))) {
          const pm = buildMoney(item.originalUnitPrice, currencyCode);
          if (pm) li.priceOverride = pm;
        }
      } else {
        const variantTitleStr = (typeof item.variantTitle === 'string')
          ? item.variantTitle
          : (Array.isArray(item.variantTitle) ? item.variantTitle.filter(Boolean).join(' · ') : '');
        const combinedTitle = [item.title || 'Custom Item', variantTitleStr].filter(Boolean).join(' · ');
        li.title = combinedTitle;
        li.requiresShipping = item.requiresShipping !== false;
        li.taxable = item.taxable !== false;

        const money = buildMoney(item.originalUnitPrice, currencyCode);
        if (money) {
          li.originalUnitPriceWithCurrency = money;
        }
      }

      if (Array.isArray(item.customAttributes) && item.customAttributes.length > 0) {
        li.customAttributes = item.customAttributes.filter(a => a && a.key);
      }

      if (item.appliedDiscount) {
        li.appliedDiscount = item.appliedDiscount;
      }

      return li;
    });
  } else {
    input.lineItems = [
      {
        title: 'Custom Order Request',
        quantity: 1,
        originalUnitPriceWithCurrency: { amount: '0.00', currencyCode: currencyCode || 'USD' },
        requiresShipping: true,
        taxable: true,
      },
    ];
  }

  const data = await shopifyAdminFetch({
    query: CREATE_DRAFT_ORDER_MUTATION,
    variables: { input },
  });

  const errors = data?.draftOrderCreate?.userErrors;
  if (Array.isArray(errors) && errors.length > 0) {
    throw new Error('Shopify Admin errors: ' + errors.map(e => (e.message || String(e))).join('; '));
  }

  const draftOrder = data?.draftOrderCreate?.draftOrder;
  if (!draftOrder) {
    throw new Error('Unexpected response: draftOrderCreate did not return a draftOrder object.');
  }

  return draftOrder;
}

module.exports = { createDraftOrder };
