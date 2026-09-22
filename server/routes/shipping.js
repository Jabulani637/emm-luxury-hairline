const express = require('express');
const router = express.Router();
const { serverError } = require('../errorResponse');
const { quoteFor } = require('../shipping');

/**
 * GET /api/shipping/quote?country=DE
 *
 * The store's published delivery price for one country, for the cart page to
 * show when Shopify quoted nothing. Read-only and static, so it is cached in the
 * browser for an hour; it is deliberately not the amount a customer is charged,
 * which stays Shopify's decision at checkout.
 */
router.get('/quote', (req, res) => {
  try {
    const quote = quoteFor(req.query.country);
    if (!quote) {
      return res.status(400).json({ error: 'country must be a two-letter code' });
    }
    res.set('Cache-Control', 'public, max-age=3600');
    res.json(quote);
  } catch (error) {
    serverError(res, 'shipping.quote', error, 'We could not price delivery just now.');
  }
});

module.exports = router;
