const express = require('express');
const router = express.Router();
const { handleGraphQL } = require('../shopify');

// POST /api/checkout - create a checkout and return webUrl
router.post('/', async (req, res) => {
  try {
	const { lineItems } = req.body;
	if (!lineItems || !Array.isArray(lineItems)) return res.status(400).json({ error: 'lineItems required' });

	const mutation = `
	  mutation checkoutCreate($input: CheckoutCreateInput!) {
		checkoutCreate(input: $input) {
		  checkout { id webUrl }
		  userErrors { field message }
		}
	  }
	`;
	const input = { lineItems };
	const result = await handleGraphQL(mutation, { input });
	const checkout = result.data.checkoutCreate.checkout;
	if (!checkout) return res.status(500).json({ error: 'failed to create checkout' });
	res.json({ webUrl: checkout.webUrl });
  } catch (err) {
	console.error('[API] checkout error', err);
	res.status(500).json({ error: 'failed to create checkout' });
  }
});

module.exports = router;
