const express = require('express');
const router = express.Router();
const { getCollection } = require('../shopify/queries/getCollection');
const { serverError } = require('../errorResponse');

// GET /api/collections/:handle - Get collection by handle
router.get('/:handle', async (req, res) => {
  try {
    const { handle } = req.params;
    const parsedFirst = parseInt(req.query.first, 10);
    const safeFirst = Number.isInteger(parsedFirst) && parsedFirst > 0
      ? Math.min(parsedFirst, 100)
      : 24;

    const collection = await getCollection(handle, safeFirst);

    if (!collection) {
      return res.status(404).json({ error: 'Collection not found' });
    }

    res.json({ collection });
  } catch (error) {
    serverError(res, 'collections.byHandle', error, 'Unable to load this collection right now. Please try again shortly.');
  }
});

module.exports = router;
