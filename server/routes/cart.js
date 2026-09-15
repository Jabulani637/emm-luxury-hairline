const express = require('express');
const router = express.Router();
const { cartCreate } = require('../shopify/mutations/cartCreate');
const { cartLinesAdd } = require('../shopify/mutations/cartLinesAdd');
const { cartLinesUpdate } = require('../shopify/mutations/cartLinesUpdate');
const { cartDeliveryAddressUpdate } = require('../shopify/mutations/cartDeliveryAddressUpdate');
const { cartDeliveryOptionsUpdate } = require('../shopify/mutations/cartDeliveryOptionsUpdate');

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

// POST /api/cart/delivery-address - Set delivery address on cart to calculate shipping rates
router.post('/delivery-address', async (req, res) => {
  try {
    const { cartId, address } = req.body;

    if (!cartId || !address) {
      return res.status(400).json({ error: 'cartId and address are required' });
    }
    if (!address.country) {
      return res.status(400).json({ error: 'address.country (country code or name) is required' });
    }

    const cart = await cartDeliveryAddressUpdate(cartId, address);
    res.json({ cart });
  } catch (error) {
    console.error('[API] Cart delivery address error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/cart/delivery-options - Select a specific shipping rate on the cart before checkout
router.post('/delivery-options', async (req, res) => {
  try {
    const { cartId, deliveryOptions } = req.body;

    if (!cartId || !deliveryOptions || !Array.isArray(deliveryOptions)) {
      return res.status(400).json({ error: 'cartId and deliveryOptions array are required' });
    }

    for (const opt of deliveryOptions) {
      if (!opt.deliveryGroupId || !opt.deliveryOptionHandle) {
        return res.status(400).json({ error: 'Each deliveryOption must have deliveryGroupId and deliveryOptionHandle' });
      }
    }

    const cart = await cartDeliveryOptionsUpdate(cartId, deliveryOptions);
    res.json({ cart });
  } catch (error) {
    console.error('[API] Cart delivery options error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
