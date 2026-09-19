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

function normalizeCurrency(value) {
  if (typeof value !== 'string') return null;
  const s = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(s) ? s : null;
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
  currencyCode = 'GBP',
  quotedCurrencyCode,
  visibleToCustomer = true,
  sourceName,
}) {
  const { firstName, lastName } = parseName(customerName);

  const shopCurrency = normalizeCurrency(currencyCode) || 'GBP';

  const input = {
    email: customerEmail || null,
    tags: Array.isArray(tags) && tags.length ? tags : ['custom-order'],
    note: note || null,
    visibleToCustomer,
  };

  if (sourceName) input.sourceName = sourceName;

  if (customerPhone) {
    input.phone = customerPhone;
  }

  const shippingAddress = {};
  let needsAddress = false;
  const isoCountry = typeof customerCountryCode === 'string' && /^[A-Z]{2,3}$/i.test(customerCountryCode.trim())
    ? customerCountryCode.trim().toUpperCase()
    : null;
  if (isoCountry) {
    shippingAddress.countryCode = isoCountry;
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
  const quoted = normalizeCurrency(quotedCurrencyCode);
  if (quoted && quoted !== shopCurrency) {
    customAttrs.push({ key: 'quoted_currency', value: quoted });
  }
  if (customAttrs.length > 0) {
    input.customAttributes = customAttrs;
  }

  if (lineItems && lineItems.length > 0) {
    input.lineItems = lineItems.map(item => {
      const li = {
        quantity: parseInt(item.quantity, 10) || 1,
      };

      if (item.variantId) {
        li.variantId = item.variantId;
        if (typeof item.originalUnitPrice === 'string' && !isNaN(parseFloat(item.originalUnitPrice))) {
          const pm = buildMoney(item.originalUnitPrice, shopCurrency);
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

        const money = buildMoney(item.originalUnitPrice, shopCurrency);
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
        originalUnitPriceWithCurrency: { amount: '0.00', currencyCode: shopCurrency },
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
