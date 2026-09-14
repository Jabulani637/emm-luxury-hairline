const express = require('express');
const router = express.Router();
const { cartCreate } = require('../shopify/mutations/cartCreate');
const { cartLinesAdd } = require('../shopify/mutations/cartLinesAdd');
const { cartLinesUpdate } = require('../shopify/mutations/cartLinesUpdate');

// POST /api/cart/create - Create a new cart
router.post('/create', async (req, res) => {
  try {
    const { variantId, quantity } = req.body;
    
    if (!variantId) {
      return res.status(400).json({ error: 'variantId is required' });
    }

    const cart = await cartCreate(variantId, quantity || 1);
    res.json({ cart });
  } catch (error) {
    console.error('[API] Cart create error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/cart/add - Add items to existing cart
router.post('/add', async (req, res) => {
  try {
    const { cartId, lines } = req.body;
    
    if (!cartId || !lines) {
      return res.status(400).json({ error: 'cartId and lines are required' });
    }

    const cart = await cartLinesAdd(cartId, lines);
    res.json({ cart });
  } catch (error) {
    console.error('[API] Cart add error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/cart/update - Update cart items
router.post('/update', async (req, res) => {
  try {
    const { cartId, lines } = req.body;
    
    if (!cartId || !lines) {
      return res.status(400).json({ error: 'cartId and lines are required' });
    }

    const cart = await cartLinesUpdate(cartId, lines);
    res.json({ cart });
  } catch (error) {
    console.error('[API] Cart update error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
