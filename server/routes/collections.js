const express = require('express');
const router = express.Router();
const { getCollection } = require('../shopify/queries/getCollection');

// GET /api/collections/:handle - Get collection by handle
router.get('/:handle', async (req, res) => {
  try {
    const { handle } = req.params;
    const { first } = req.query;
    
    const collection = await getCollection(handle, first ? parseInt(first) : 24);

    if (!collection) {
      return res.status(404).json({ error: 'Collection not found' });
    }

    res.json({ collection });
  } catch (error) {
    console.error('[API] Collection error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
