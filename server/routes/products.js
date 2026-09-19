const express = require('express');
const router = express.Router();
const { getProducts } = require('../shopify/queries/getProducts');
const { getProduct } = require('../shopify/queries/getProduct');
const { serverError } = require('../errorResponse');

const ALLOWED_SORT_KEYS = new Set([
  'BEST_SELLING', 'RELEVANCE', 'NAME', 'PRICE', 'CREATED_AT', 'UPDATED_AT',
  'ID', 'PRODUCT_TYPE', 'VENDOR', 'INVENTORY_SQUARED',
]);

// GET /api/products - Get list of products
router.get('/', async (req, res) => {
  try {
    const { first, sortKey, reverse, query } = req.query;

    const parsedFirst = parseInt(first, 10);
    const safeFirst = Number.isInteger(parsedFirst) && parsedFirst > 0
      ? Math.min(parsedFirst, 100)
      : 8;

    const safeSortKey = ALLOWED_SORT_KEYS.has(sortKey) ? sortKey : 'BEST_SELLING';
    const safeQuery = typeof query === 'string' ? query.trim().slice(0, 100) : undefined;

    const products = await getProducts({
      first: safeFirst,
      sortKey: safeSortKey,
      reverse: reverse === 'true',
      query: safeQuery,
    });

    res.json({ products });
  } catch (error) {
    serverError(res, 'products.list', error, 'Unable to load products right now. Please try again shortly.');
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
    serverError(res, 'products.byHandle', error, 'Unable to load this product right now. Please try again shortly.');
  }
});

module.exports = router;
