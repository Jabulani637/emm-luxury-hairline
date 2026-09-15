const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const { createDraftOrder } = require('../shopify/admin/mutations/createDraftOrder');
const { isAdminConfigured } = require('../shopify/admin/client');

const ORDERS_DIR = process.env.CUSTOM_ORDERS_DIR || path.resolve(__dirname, '..', '..', 'data', 'custom-orders');

function ensureOrdersDir() {
  try {
    if (!fs.existsSync(ORDERS_DIR)) {
      fs.mkdirSync(ORDERS_DIR, { recursive: true });
    }
    return true;
  } catch (err) {
    console.error('[customOrders] Cannot create orders directory:', err);
    return false;
  }
}

function sanitizeString(str, maxLen = 500) {
  if (typeof str !== 'string') return '';
  const s = str.trim().slice(0, maxLen);
  return s.replace(/[\x00-\x1F\x7F]/g, '');
}

function isValidEmail(email) {
  if (typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

router.post('/', async (req, res) => {
  try {
    const body = req.body || {};
    const name = sanitizeString(body.name, 120);
    const email = sanitizeString(body.email, 160);
    const phone = sanitizeString(body.phone, 60);
    const country = sanitizeString(body.country, 60);
    const message = sanitizeString(body.message, 4000);

    const productHandle = sanitizeString(body.productHandle, 160);
    const productTitle = sanitizeString(body.productTitle, 200);
    const variantId = sanitizeString(body.variantId, 200);
    const variantTitle = sanitizeString(body.variantTitle, 200);
    const desiredPrice = sanitizeString(body.price, 40);
    const currency = sanitizeString(body.currency, 8) || 'USD';
    const desiredQuantity = parseInt(body.quantity || '1', 10) || 1;

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
      customer: {
        name,
        email,
        phone: phone || null,
        country: country || null,
      },
      product: {
        handle: productHandle || null,
        title: productTitle || null,
        variantId: variantId || null,
        variantTitle: variantTitle || null,
        desiredPrice: desiredPrice || null,
        currency: currency || null,
        desiredQuantity,
        desiredStyle: desiredStyle || null,
        length: length || null,
        color: color || null,
      },
      message: message || null,
      status: 'new',
      shopifyDraftOrder: null,
    };

    let draftOrderResult = null;
    let adminError = null;

    if (isAdminConfigured()) {
      try {
        const lineItems = [];
        const mainTitle = productTitle || desiredStyle || 'Custom Order';
        const variantSuffix = [length, color].filter(Boolean).join(' · ');
        const vTitle = variantTitle || variantSuffix || null;
        const unitPrice = desiredPrice && !isNaN(parseFloat(desiredPrice))
          ? String(parseFloat(desiredPrice).toFixed(2))
          : null;

        const customAttributes = [];
        if (productHandle) customAttributes.push({ key: 'product_handle', value: productHandle });
        if (desiredStyle) customAttributes.push({ key: 'desired_style', value: desiredStyle });
        if (length) customAttributes.push({ key: 'length', value: length });
        if (color) customAttributes.push({ key: 'color', value: color });
        if (variantTitle) customAttributes.push({ key: 'variant_title', value: variantTitle });

        lineItems.push({
          title: mainTitle,
          quantity: desiredQuantity,
          variantId: variantId || undefined,
          variantTitle: vTitle || undefined,
          originalUnitPrice: unitPrice || undefined,
          customAttributes: customAttributes.length ? customAttributes : undefined,
        });

        const noteParts = [];
        if (productHandle) noteParts.push(`Product handle: ${productHandle}`);
        if (desiredStyle) noteParts.push(`Desired style: ${desiredStyle}`);
        if (length) noteParts.push(`Length: ${length}`);
        if (color) noteParts.push(`Color: ${color}`);
        if (message) noteParts.push(message);
        const fullNote = noteParts.join('\n') || null;

        draftOrderResult = await createDraftOrder({
          customerName: name,
          customerEmail: email,
          customerPhone: phone || undefined,
          customerCountryCode: country || undefined,
          lineItems,
          note: fullNote,
          tags: ['custom-order', order.id],
          currencyCode: currency,
        });

        order.shopifyDraftOrder = {
          id: draftOrderResult.id,
          name: draftOrderResult.name,
          invoiceUrl: draftOrderResult.invoiceUrl,
          status: draftOrderResult.status,
        };

        console.log('[customOrders] Shopify Draft Order created:', draftOrderResult.name, '|', draftOrderResult.id);
      } catch (err) {
        adminError = err.message || String(err);
        console.error('[customOrders] Shopify Admin createDraftOrder failed — continuing with JSON save only:', adminError);
      }
    } else {
      console.warn('[customOrders] Shopify Admin API not configured — order saved to JSON only.');
    }

    const dirOk = ensureOrdersDir();
    if (dirOk) {
      const file = path.join(ORDERS_DIR, `${order.id}.json`);
      try {
        fs.writeFileSync(file, JSON.stringify(order, null, 2), 'utf8');
      } catch (err) {
        console.error('[customOrders] Failed to save order file:', err);
      }
    }

    console.log('[customOrders] New custom order request received:', order.id, '|', productTitle || desiredStyle || '(custom note)', '|', email);

    const response = {
      ok: true,
      orderId: order.id,
      draftOrderName: order.shopifyDraftOrder?.name || null,
      invoiceUrl: order.shopifyDraftOrder?.invoiceUrl || null,
    };

    if (draftOrderResult) {
      response.message = 'Thank you! Your custom order has been created in Shopify. We will review it and send a payment link shortly.';
      response.isShopify = true;
    } else if (adminError) {
      response.message = 'Thank you! Your request has been saved. We experienced a small issue syncing to Shopify — we will contact you within 24 hours with your payment link.';
      response.isShopify = false;
    } else {
      response.message = 'Thank you! Your custom order request has been received. We will contact you within 24 hours.';
      response.isShopify = false;
    }

    res.status(201).json(response);
  } catch (error) {
    console.error('[customOrders] Failed to process custom order:', error);
    res.status(500).json({ ok: false, error: 'Failed to submit your order. Please try again or email us directly.' });
  }
});

module.exports = router;
