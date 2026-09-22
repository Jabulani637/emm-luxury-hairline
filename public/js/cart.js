/**
 * Cart State Management
 * Handles cart operations and localStorage persistence
 */

/**
 * Whether Shopify would take this cart to a payment page. A cart with no lines
 * prices at 0, and Shopify answers a visit to one by redirecting to the
 * storefront home instead of opening a checkout.
 */
function isBuyableCart(cart) {
  if (!cart || !cart.checkoutUrl) return false;
  const lines = (cart.lines && cart.lines.edges) || [];
  if (lines.length === 0) return false;
  const total = cart.cost && cart.cost.totalAmount && cart.cost.totalAmount.amount;
  return parseFloat(total) > 0;
}

class CartManager {
  constructor() {
    this.cart = this.loadCart();
    this.listeners = [];
  }

  loadCart() {
    try {
      const saved = localStorage.getItem('emm_cart');
      return saved ? JSON.parse(saved) : null;
    } catch (error) {
      console.error('[Cart] Failed to load cart:', error);
      return null;
    }
  }

  saveCart() {
    try {
      if (this.cart) {
        localStorage.setItem('emm_cart', JSON.stringify(this.cart));
      } else {
        localStorage.removeItem('emm_cart');
      }
      this.notifyListeners();
    } catch (error) {
      console.error('[Cart] Failed to save cart:', error);
    }
  }

  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  notifyListeners() {
    this.listeners.forEach(listener => listener(this.cart));
  }

  getCart() {
    return this.cart;
  }

  getItemCount() {
    if (!this.cart) return 0;
    const total = this.cart.totalQuantity;
    if (typeof total === 'number' && total > 0) return total;
    const edges = (this.cart.lines && this.cart.lines.edges) || [];
    return edges.reduce((sum, line) => sum + (line.node?.quantity || 0), 0);
  }

  async addToCart(variantId, quantity = 1) {
    try {
      if (!this.cart) {
        // Create new cart
        const response = await window.cartAPI.createCart(variantId, quantity);
        this.cart = response.cart;
      } else {
        // Add to existing cart
        const response = await window.cartAPI.addToCart(this.cart.id, [
          { merchandiseId: variantId, quantity },
        ]);
        this.cart = response.cart;
      }
      
      this.saveCart();
      return this.cart;
    } catch (error) {
      console.error('[Cart] Failed to add item:', error);
      throw error;
    }
  }

  async updateQuantity(lineId, quantity) {
    if (!this.cart) return;

    try {
      const response = await window.cartAPI.updateCart(this.cart.id, [
        { id: lineId, quantity },
      ]);
      this.cart = response.cart;
      this.saveCart();
      return this.cart;
    } catch (error) {
      console.error('[Cart] Failed to update quantity:', error);
      throw error;
    }
  }

  async removeItem(lineId) {
    return this.updateQuantity(lineId, 0);
  }

  clearCart() {
    this.cart = null;
    this.saveCart();
  }

  /**
   * The bag as Shopify needs to receive it: variant ids and quantities only, so
   * a cart can be rebuilt from whatever localStorage remembers.
   */
  getCheckoutLines() {
    const edges = (this.cart && this.cart.lines && this.cart.lines.edges) || [];
    return edges
      .map(line => ({
        merchandiseId: line.node && line.node.merchandise && line.node.merchandise.id,
        quantity: (line.node && line.node.quantity) || 0,
      }))
      .filter(line => line.merchandiseId && line.quantity > 0);
  }

  /**
   * Open Shopify's payment page with this bag on it.
   *
   * The stored checkoutUrl is never used. A bag left in localStorage can outlive
   * the Shopify cart behind it, and visiting a cart that no longer has lines
   * sends the shopper to the storefront home instead of the payment page. So the
   * click asks Shopify for the cart it actually has — which is also the call
   * that sets the cart's market — and rebuilds the bag when that cart is gone.
   */
  async beginCheckout() {
    const lines = this.getCheckoutLines();
    if (lines.length === 0) return { ok: false, reason: 'empty' };

    let cart = null;
    if (this.cart) {
      try {
        const response = await window.cartAPI.applyBuyerIdentity(this.cart.id);
        cart = response.cart;
      } catch (error) {
        console.warn('[Cart] Stored cart is no longer on Shopify:', error.message);
      }
    }

    if (!isBuyableCart(cart)) {
      try {
        cart = await this.rebuildCart(lines);
      } catch (error) {
        // Shopify answered and refused, so the bag itself is unsellable; a
        // TypeError means the request never landed and the bag is worth keeping.
        console.warn('[Cart] Could not rebuild the bag:', error.message);
        return { ok: false, reason: error instanceof TypeError ? 'network' : 'unavailable' };
      }
    }

    if (!isBuyableCart(cart)) return { ok: false, reason: 'unavailable' };

    this.cart = cart;
    this.saveCart();
    return { ok: true, checkoutUrl: cart.checkoutUrl };
  }

  async rebuildCart(lines) {
    const [first, ...rest] = lines;
    let cart = (await window.cartAPI.createCart(first.merchandiseId, first.quantity)).cart;
    if (rest.length > 0) {
      const added = rest.map(line => ({ merchandiseId: line.merchandiseId, quantity: line.quantity }));
      cart = (await window.cartAPI.addToCart(cart.id, added)).cart;
    }
    return cart;
  }

  getTotal() {
    return this.getGrandTotal().amount;
  }

  getCurrency() {
    return this.getGrandTotal().currencyCode;
  }

  async estimateShipping(address) {
    if (!this.cart) {
      throw new Error('No cart exists. Add items first.');
    }

    try {
      const response = await window.cartAPI.updateDeliveryAddress(this.cart.id, address);
      this.cart = response.cart;
      this.saveCart();
      return this.getShippingRates();
    } catch (error) {
      console.error('[Cart] Failed to estimate shipping:', error);
      throw error;
    }
  }

  getShippingRates() {
    if (!this.cart || !this.cart.deliveryGroups) return [];

    const rates = [];
    const groups = this.cart.deliveryGroups.edges || [];

    for (const group of groups) {
      const groupId = group.node.id;
      const options = group.node.deliveryOptions || [];
      const selected = group.node.selectedDeliveryOption;
      for (const option of options) {
        rates.push({
          deliveryGroupId: groupId,
          handle: option.handle,
          title: option.title,
          description: option.description,
          cost: option.estimatedCost,
          selected: selected ? selected.handle === option.handle : false,
        });
      }
    }

    return rates;
  }

  async selectShippingRate(handle, deliveryGroupId) {
    if (!this.cart) {
      throw new Error('No cart exists. Add items first.');
    }

    const groups = (this.cart.deliveryGroups && this.cart.deliveryGroups.edges) || [];
    if (groups.length === 0) {
      throw new Error('No delivery groups found. Set a delivery address first.');
    }

    const deliveryOptions = [];
    for (const group of groups) {
      const gid = deliveryGroupId || group.node.id;
      if (gid && deliveryGroupId && gid !== deliveryGroupId) continue;
      deliveryOptions.push({
        deliveryGroupId: gid,
        deliveryOptionHandle: handle,
      });
    }

    try {
      const response = await window.cartAPI.selectDeliveryOptions(this.cart.id, deliveryOptions);
      this.cart = response.cart;
      this.saveCart();
      return this.cart;
    } catch (error) {
      console.error('[Cart] Failed to select shipping rate:', error);
      throw error;
    }
  }

  /**
   * The shipping figure the shopper has committed to, or null when they have
   * not estimated yet. Shopify stopped exposing a shipping total on CartCost,
   * so it is the sum of each delivery group's selected option.
   */
  getShippingAmount() {
    const groups = (this.cart && this.cart.deliveryGroups && this.cart.deliveryGroups.edges) || [];
    let selected = null;
    let total = 0;

    for (const group of groups) {
      const option = group.node && group.node.selectedDeliveryOption;
      const cost = option && option.estimatedCost;
      if (!cost) continue;
      selected = selected || cost.currencyCode || 'GBP';
      total += parseFloat(cost.amount) || 0;
    }

    if (!selected) return null;
    return { amount: total.toFixed(2), currencyCode: selected };
  }

  /**
   * Goods only, before delivery. An older build saved carts that never asked
   * for subtotalAmount, so those fall back to the grand total — which is the
   * same number, because a cart without delivery groups has no shipping in it.
   */
  getSubtotal() {
    const subtotal = this.cart && this.cart.cost && this.cart.cost.subtotalAmount;
    if (subtotal) return { amount: subtotal.amount, currencyCode: subtotal.currencyCode || 'GBP' };
    return this.getGrandTotal();
  }

  /**
   * What the shopper is about to pay. This is Shopify's totalAmount as-is:
   * measured on the live store, a £450.00 bag with a £6.99 Express rate came
   * back as £456.99, so shipping is already inside it and adding the shipping
   * row here would charge for it twice.
   */
  getGrandTotal() {
    const total = this.cart && this.cart.cost && this.cart.cost.totalAmount;
    if (!total) return { amount: '0.00', currencyCode: 'GBP' };
    return { amount: total.amount || '0.00', currencyCode: total.currencyCode || 'GBP' };
  }
}

// Initialize cart manager
const cartManager = new CartManager();

// Make available globally
window.cartManager = cartManager;

// Format price for display
function formatPrice(amount, currencyCode = 'GBP') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode,
  }).format(parseFloat(amount));
}

// Make formatPrice available globally
window.formatPrice = formatPrice;
