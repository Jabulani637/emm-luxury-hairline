const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const cache = require('../cache');
const { saveRecord, appendEvent } = require('../localRecords');
const { isConfigured } = require('../envFlags');

const WEBHOOK_SECRET = isConfigured(process.env.WEBHOOK_SECRET) ? process.env.WEBHOOK_SECRET.trim() : '';

/**
 * Deliveries since this process started, reported by /api/health. Render's free
 * plan offers no way back into a finished deploy's logs, so without this the
 * question "did Shopify ever call us?" is unanswerable. Counters and a topic
 * name only — no order, customer or payload data is retained here.
 */
const deliveries = { accepted: 0, rejected: 0, secretMissing: 0, last: null };

/**
 * Shopify signs the exact raw request bytes with HMAC-SHA256 and sends the
 * Base64 result in X-Shopify-Hmac-Sha256. Because it signs the raw bytes, this
 * router MUST be mounted before express.json() — once that parser runs, the
 * body is an object and the signature can never be reproduced.
 */
function verifySignature(rawBody, header) {
  if (!WEBHOOK_SECRET || !header || !Buffer.isBuffer(rawBody)) return false;
  const digest = crypto.createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('base64');
  const expected = Buffer.from(digest);
  const received = Buffer.from(String(header));
  if (expected.length !== received.length) return false;
  return crypto.timingSafeEqual(expected, received);
}

/** Trim an order webhook down to the fields worth keeping a local copy of. */
function summariseOrder(payload, topic, shopDomain) {
  return {
    topic,
    receivedAt: new Date().toISOString(),
    shopDomain: shopDomain || null,
    shopifyOrderId: payload.id ?? null,
    name: payload.name || null,
    test: payload.test === true,
    email: payload.email || null,
    phone: payload.phone || null,
    currency: payload.currency || null,
    totalPrice: payload.total_price ?? null,
    subtotalPrice: payload.total_line_items_price ?? null,
    financialStatus: payload.financial_status || null,
    fulfillmentStatus: payload.fulfillment_status || null,
    sourceName: payload.source_name || null,
    tags: payload.tags || null,
    note: payload.note || null,
    lineItems: (payload.line_items || []).map(li => ({
      title: li.title,
      quantity: li.quantity,
      price: li.price,
      sku: li.sku || null,
      productId: li.product_id || null,
      variantId: li.variant_id || null,
    })),
    orderCreatedAt: payload.created_at || null,
    orderPaidAt: payload.paid_at || payload.processed_at || null,
  };
}

// Shopify's own spellings. `orders/deleted` carries a 'd': a misnamed topic
// simply never fires, which is indistinguishable from a webhook nobody set up.
const ORDER_TOPICS = new Set([
  'orders/create',
  'orders/paid',
  'orders/updated',
  'orders/fulfilled',
  'orders/partually_fulfilled',
  'orders/cancelled',
  'orders/deleted',
]);

const PRODUCT_TOPICS = new Set([
  'products/create',
  'products/update',
  'products/delete',
]);

/** Product events move prices, images and sold-out badges. No customer data. */
function summariseProduct(payload, topic, shopDomain) {
  return {
    topic,
    receivedAt: new Date().toISOString(),
    shopDomain: shopDomain || null,
    shopifyProductId: payload.id ?? null,
    title: payload.title || null,
    handle: payload.handle || null,
    status: payload.status || null,
    variants: (payload.variants || []).map(v => ({
      title: v.title,
      price: v.price,
      sku: v.sku || null,
      inventoryQuantity: v.inventory_quantity ?? null,
    })),
  };
}

// `type: () => true` keeps the body a Buffer whatever content-type Shopify
// sends, so a future switch to XML or an odd client header can't skip the parser.
const rawParser = express.raw({ type: () => true });

router.post('/shopify', rawParser, (req, res) => {
  const topic = req.headers['x-shopify-topic'] || 'unknown';
  const record = (outcome) => {
    deliveries.last = { at: new Date().toISOString(), topic, outcome };
  };

  if (!WEBHOOK_SECRET) {
    deliveries.secretMissing++;
    record('secret-missing');
    console.error('[webhooks] WEBHOOK_SECRET is not set — refusing delivery. Configure it in .env and in the Shopify webhook subscription.');
    return res.status(503).send('webhook secret not configured');
  }

  if (!verifySignature(req.body, req.headers['x-shopify-hmac-sha256'])) {
    deliveries.rejected++;
    record('rejected');
    console.warn('[webhooks] Rejected delivery: signature mismatch for topic', topic);
    return res.status(401).send('invalid signature');
  }

  const shopDomain = req.headers['x-shopify-shop-domain'];

  let payload;
  try {
    payload = JSON.parse(req.body.toString('utf8'));
  } catch (err) {
    record('unparseable');
    console.error('[webhooks] Signature valid but body is not JSON:', err.message);
    return res.status(400).send('unparseable payload');
  }

  deliveries.accepted++;
  record('accepted');

  // Acknowledge first: Shopify retries (and eventually disables) subscriptions
  // that do not answer quickly.
  res.status(200).send('ok');

  try {
    if (ORDER_TOPICS.has(topic)) {
      const summary = summariseOrder(payload, topic, shopDomain);
      const ref = summary.name ? summary.name.replace(/\D+/g, '') : `anon-${summary.shopifyOrderId || Date.now()}`;
      saveRecord('shopify-orders', ref, summary);
      appendEvent('shopify-events', {
        at: summary.receivedAt,
        topic,
        name: summary.name,
        shopifyOrderId: summary.shopifyOrderId,
        financialStatus: summary.financialStatus,
        fulfillmentStatus: summary.fulfillmentStatus,
        totalPrice: summary.totalPrice,
        currency: summary.currency,
      });
      // A placed order can change stock and sold-out badges.
      const dropped = cache.invalidate('catalog');
      console.log(`[webhooks] ${topic} for ${summary.name || summary.shopifyOrderId} — invalidated ${dropped} cached catalog responses`);
    } else if (PRODUCT_TOPICS.has(topic)) {
      const summary = summariseProduct(payload, topic, shopDomain);
      const ref = summary.handle || `anon-${summary.shopifyProductId || Date.now()}`;
      saveRecord('shopify-products', ref, summary);
      appendEvent('shopify-events', {
        at: summary.receivedAt,
        topic,
        title: summary.title,
        handle: summary.handle,
        status: summary.status,
      });
      const dropped = cache.invalidate('catalog');
      console.log(`[webhooks] ${topic} for ${summary.title || summary.shopifyProductId} — invalidated ${dropped} cached catalog responses`);
    } else {
      appendEvent('shopify-events', { at: deliveries.last.at, topic, handled: false });
      console.log('[webhooks] Accepted unhandled topic:', topic);
    }
  } catch (err) {
    console.error('[webhooks] Post-acknowledge handling failed for', topic, ':', err);
  }
});

router.stats = () => ({ ...deliveries, last: deliveries.last ? { ...deliveries.last } : null });

module.exports = router;
