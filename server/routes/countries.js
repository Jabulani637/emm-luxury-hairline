const express = require('express');
const router = express.Router();
const { getCountries } = require('../shopify/queries/getCountries');
const { serverError } = require('../errorResponse');

router.get('/', async (req, res) => {
  try {
    const data = await getCountries();
    res.json(data);
  } catch (error) {
    serverError(res, 'countries', error, 'Unable to load shipping countries right now. Please try again shortly.');
  }
});

module.exports = router;
