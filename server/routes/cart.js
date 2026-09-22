const express = require('express');
const router = express.Router();
const { serverError } = require('../errorResponse');
const { shopperCountry } = require('../requestCountry');
const { cartCreate } = require('../shopify/mutations/cartCreate');
const { cartLinesAdd } = require('../shopify/mutations/cartLinesAdd');
const { cartLinesUpdate } = require('../shopify/mutations/cartLinesUpdate');
const { cartDeliveryAddressUpdate } = require('../shopify/mutations/cartDeliveryAddressUpdate');
const { cartDeliveryOptionsUpdate } = require('../shopify/mutations/cartDeliveryOptionsUpdate');
const { cartBuyerIdentityUpdate } = require('../shopify/mutations/cartBuyerIdentityUpdate');
const { getCart } = require('../shopify/queries/getCart');

const CART_FAILED = 'We could not update your cart. Please check your connection and try again.';

// POST /api/cart/create - Create a new cart
router.post('/create', async (req, res) => {
  try {
    const { variantId, quantity } = req.body;
    
    if (!variantId) {
      return res.status(400).json({ error: 'variantId is required' });
    }

    const cart = await cartCreate(variantId, quantity || 1, await shopperCountry(req));
    res.json({ cart });
  } catch (error) {
    serverError(res, 'cart.create', error, CART_FAILED);
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
    serverError(res, 'cart.add', error, CART_FAILED);
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
    serverError(res, 'cart.update', error, CART_FAILED);
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
    serverError(res, 'cart.deliveryAddress', error, 'We could not calculate shipping for this address. Please try again.');
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
    serverError(res, 'cart.deliveryOptions', error, 'We could not set your delivery option. Please try again.');
  }
});

// POST /api/cart/buyer-identity - Put this shopper's market on their cart, and
// hand back the cart Shopify actually has.
//
// The checkout button calls this first: a bag kept in localStorage can outlive
// the cart behind it, and a dead one must be rebuilt rather than opened. With a
// country Shopify sells to it goes on the cart, so checkout opens with that
// country already chosen instead of locked to the store's own — measured on the
// live shop it does not re-price the bag, which stays in the store's currency
// until a market quotes its buyers in their own. Without a country nothing is
// written, because the "unspecified" one (ZZ) zeroes the cart's total and
// quantity.
router.post('/buyer-identity', async (req, res) => {
  try {
    const { cartId } = req.body;

    if (!cartId) {
      return res.status(400).json({ error: 'cartId is required' });
    }

    const country = await shopperCountry(req);
    const cart = country
      ? await cartBuyerIdentityUpdate(cartId, { countryCode: country })
      : await getCart(cartId);

    res.json({ cart });
  } catch (error) {
    // Non-fatal for the shopper: the caller rebuilds the bag when this fails, so
    // checkout still opens and only the market pre-selection is lost.
    serverError(res, 'cart.buyerIdentity', error, 'Checkout is ready — we could not set your country.');
  }
});

module.exports = router;
