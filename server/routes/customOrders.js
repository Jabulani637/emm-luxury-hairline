const express = require('express');
const router = express.Router();

const { createDraftOrder } = require('../shopify/admin/mutations/createDraftOrder');
const { isAdminConfigured } = require('../shopify/admin/client');
const { getCountries } = require('../shopify/queries/getCountries');
const { saveRecord } = require('../localRecords');

function sanitizeString(str, maxLen = 500) {
  if (typeof str !== 'string') return '';
  const s = str.trim().slice(0, maxLen);
  return s.replace(/[\x00-\x1F\x7F]/g, '');
}

function isValidEmail(email) {
  if (typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** Storefront variant GIDs only; anything else would make Shopify reject the order. */
function safeVariantId(value) {
  const s = sanitizeString(value, 200);
  return /^gid:\/\/shopify\/ProductVariant\/\d+$/.test(s) ? s : null;
}

async function shopCurrency() {
  try {
    const info = await getCountries();
    return info.shopCurrency || 'GBP';
  } catch (err) {
    console.warn('[customOrders] Could not resolve shop currency, defaulting to GBP:', err.message);
    return 'GBP';
  }
}

router.post('/', async (req, res) => {
  const body = req.body || {};

  const name = sanitizeString(body.name, 120);
  const email = sanitizeString(body.email, 160);
  const phone = sanitizeString(body.phone, 60);
  const country = sanitizeString(body.country, 60);
  const message = sanitizeString(body.message, 4000);

  const productHandle = sanitizeString(body.productHandle, 160);
  const productTitle = sanitizeString(body.productTitle, 200);
  const variantId = safeVariantId(body.variantId);
  const variantTitle = sanitizeString(body.variantTitle, 200);
  const desiredPrice = sanitizeString(body.price, 40);
  const quotedCurrency = sanitizeString(body.currency, 8);
  const desiredQuantity = Math.min(50, Math.max(1, parseInt(body.quantity, 10) || 1));

  const desiredStyle = sanitizeString(body.desiredStyle, 200);
  const length = sanitizeString(body.length, 120);
  const color = sanitizeString(body.color, 120);

  if (!name || !email) {
    return res.status(400).json({ ok: false, error: 'Name and email are required.' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ ok: false, error: 'Please provide a valid email address.' });
  }
  if (!productHandle && !productTitle && !message && !desiredStyle) {
    return res.status(400).json({ ok: false, error: 'Please tell us which product you want to order, or include a short message.' });
  }

  const order = {
    id: 'co_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    createdAt: new Date().toISOString(),
    kind: 'custom-order',
    customer: { name, email, phone: phone || null, country: country || null },
    product: {
      handle: productHandle || null,
      title: productTitle || null,
      variantId,
      variantTitle: variantTitle || null,
      desiredPrice: desiredPrice || null,
      quotedCurrency: quotedCurrency || null,
      desiredQuantity,
      desiredStyle: desiredStyle || null,
      length: length || null,
      color: color || null,
    },
    message: message || null,
    status: 'new',
    shopifyDraftOrder: null,
    syncError: null,
  };

  // Persist before attempting Shopify: a slow or failing Admin API call must
  // not be able to lose the enquiry.
  saveRecord('custom-orders', order.id, order);

  const currency = await shopCurrency();

  try {
    const customAttributes = [];
    if (productHandle) customAttributes.push({ key: 'product_handle', value: productHandle });
    if (desiredStyle) customAttributes.push({ key: 'desired_style', value: desiredStyle });
    if (length) customAttributes.push({ key: 'length', value: length });
    if (color) customAttributes.push({ key: 'color', value: color });
    if (variantTitle) customAttributes.push({ key: 'variant_title', value: variantTitle });

    const noteParts = [];
    if (productHandle) noteParts.push(`Product handle: ${productHandle}`);
    if (desiredStyle) noteParts.push(`Desired style: ${desiredStyle}`);
    if (length) noteParts.push(`Length: ${length}`);
    if (color) noteParts.push(`Color: ${color}`);
    if (message) noteParts.push(message);

    const unitPrice = desiredPrice && !isNaN(parseFloat(desiredPrice))
      ? String(parseFloat(desiredPrice).toFixed(2))
      : null;

    const draftOrder = await createDraftOrder({
      customerName: name,
      customerEmail: email,
      customerPhone: phone || undefined,
      customerCountryCode: country || undefined,
      lineItems: [{
        title: productTitle || desiredStyle || 'Custom Order',
        quantity: desiredQuantity,
        variantId: variantId || undefined,
        variantTitle: variantTitle || undefined,
        originalUnitPrice: unitPrice || undefined,
        customAttributes,
      }],
      note: noteParts.join('\n') || null,
      tags: ['custom-order', order.id],
      currencyCode: currency,
      quotedCurrencyCode: quotedCurrency || undefined,
      sourceName: 'emm-luxury-hairline',
    });

    order.shopifyDraftOrder = {
      id: draftOrder.id,
      name: draftOrder.name,
      invoiceUrl: draftOrder.invoiceUrl,
      status: draftOrder.status,
    };
    order.status = 'synced';

    console.log('[customOrders] Shopify Draft Order created:', draftOrder.name, '|', draftOrder.id);
  } catch (err) {
    order.status = 'pending_shopify_sync';
    order.syncError = err.message || String(err);
    console.error('[customOrders] DRAFT ORDER NOT CREATED — order kept locally only:', order.id, '|', order.syncError);
  }

  saveRecord('custom-orders', order.id, order);

  const synced = Boolean(order.shopifyDraftOrder);

  res.status(201).json({
    ok: true,
    orderId: order.id,
    syncedToShopify: synced,
    draftOrderName: order.shopifyDraftOrder?.name || null,
    invoiceUrl: order.shopifyDraftOrder?.invoiceUrl || null,
    isShopify: synced,
    message: synced
      ? 'Thank you! Your custom order has been created in Shopify. We will review it and send a payment link shortly.'
      : 'Thank you! Your request has been saved and flagged for our team. We will email you a payment link within 24 hours.',
  });
});

/** Whether this endpoint can actually reach Shopify — surfaced on /api/health. */
router.get('/status', (req, res) => {
  res.json({ ok: true, adminConfigured: isAdminConfigured() });
});

module.exports = router;
