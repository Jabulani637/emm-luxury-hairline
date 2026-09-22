const express = require('express');
const router = express.Router();
const { getCountries } = require('../shopify/queries/getCountries');
const { getPurchasableMarkets } = require('../shopify/localization');
const { serverError } = require('../errorResponse');

// `countries` is every country Shopify lets a buyer check out from, which the
// address forms and the header's country picker both list.
//
// `markets` is the much shorter list of countries worth showing a different
// price in: those Shopify quotes in their own currency AND has published a
// catalogue to. It is empty today, so a shopper can say where they are without
// the storefront ever promising a conversion it cannot deliver.
router.get('/', async (req, res) => {
  try {
    const data = await getCountries();
    let markets = [];
    try {
      markets = await getPurchasableMarkets();
    } catch (error) {
      // A picker with no localised market still lists countries, so this must not
      // take the address forms down with it.
      console.error('[countries] Market probe failed:', error.message);
    }
    res.json({ ...data, markets });
  } catch (error) {
    serverError(res, 'countries', error, 'Unable to load shipping countries right now. Please try again shortly.');
  }
});

module.exports = router;
