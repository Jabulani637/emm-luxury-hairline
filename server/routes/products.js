const express = require('express');
const router = express.Router();
const { getProducts } = require('../shopify/queries/getProducts');
const { getProduct } = require('../shopify/queries/getProduct');

// GET /api/products - Get list of products
router.get('/', async (req, res) => {
  try {
    const { first, sortKey, reverse, query } = req.query;
    
    const products = await getProducts({
      first: first ? parseInt(first) : 8,
      sortKey: sortKey || 'BEST_SELLING',
      reverse: reverse === 'true',
      query,
    });

    res.json({ products });
  } catch (error) {
    console.error('[API] Products error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/products/:handle - Get single product by handle
router.get('/:handle', async (req, res) => {
  try {
    const { handle } = req.params;
    const product = await getProduct(handle);

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({ product });
  } catch (error) {
    console.error('[API] Product error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
