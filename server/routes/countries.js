const express = require('express');
const router = express.Router();
const { getCountries } = require('../shopify/queries/getCountries');

router.get('/', async (req, res) => {
  try {
    const data = await getCountries();
    res.json(data);
  } catch (error) {
    console.error('[API] Countries error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
