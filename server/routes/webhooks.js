const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { verifyWebhook } = require('../shopify');
const cache = require('../cache');

// POST /webhooks/shopify - receives Shopify webhooks
// Use express.raw in the route so we can verify HMAC using the raw body
const rawBodyParser = express.raw({ type: 'application/json' });

router.post('/shopify', rawBodyParser, async (req, res) => {
  try {
	const hmac = req.headers['x-shopify-hmac-sha256'];
	const topic = req.headers['x-shopify-topic'] || 'unknown';

	const raw = req.body; // Buffer provided by express.raw
	const verified = verifyWebhook(raw, hmac);
	if (!verified) return res.status(401).send('invalid webhook');

	const payload = JSON.parse(raw.toString('utf8'));

	// Simple processing: persist the webhook payload for audit and invalidate related caches
	const outDir = path.join(__dirname, '..', 'data', 'orders');
	fs.mkdirSync(outDir, { recursive: true });
	const id = payload.id || payload.order_id || Date.now();
	const filename = path.join(outDir, `${topic.replace(/\W+/g,'_')}-${id}.json`);
	fs.writeFileSync(filename, JSON.stringify({ receivedAt: new Date().toISOString(), topic, payload }, null, 2));

	// Invalidate cache entries that may be affected by order events
	cache.del('products.list');
	// respond to Shopify
	res.status(200).send('ok');
  } catch (err) {
	console.error('webhook handler error', err);
	res.status(500).send('error');
  }
});

module.exports = router;
