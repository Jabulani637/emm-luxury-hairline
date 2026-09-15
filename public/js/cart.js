/**
 * Cart State Management
 * Handles cart operations and localStorage persistence
 */

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
    return this.cart.totalQuantity || 0;
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

  getCheckoutUrl() {
    return this.cart?.checkoutUrl || null;
  }

  getTotal() {
    if (!this.cart) return '0.00';
    return this.cart.cost?.totalAmount?.amount || '0.00';
  }

  getCurrency() {
    if (!this.cart) return 'USD';
    return this.cart.cost?.totalAmount?.currencyCode || 'USD';
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
          cost: option.estimatedCost || option.cost,
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

  getShippingAmount() {
    if (!this.cart) return { amount: '0.00', currencyCode: 'USD' };

    if (this.cart.cost && this.cart.cost.totalShippingAmount) {
      const s = this.cart.cost.totalShippingAmount;
      return { amount: s.amount || '0.00', currencyCode: s.currencyCode || 'USD' };
    }

    const groups = (this.cart.deliveryGroups && this.cart.deliveryGroups.edges) || [];
    for (const group of groups) {
      const sel = group.node.selectedDeliveryOption;
      if (sel && sel.cost) {
        return { amount: sel.cost.amount, currencyCode: sel.cost.currencyCode };
      }
    }

    const currency = (this.cart.cost && this.cart.cost.totalAmount && this.cart.cost.totalAmount.currencyCode) || 'USD';
    return { amount: '0.00', currencyCode: currency };
  }

  getGrandTotal() {
    const cart = this.cart;
    if (!cart || !cart.cost || !cart.cost.totalAmount) {
      return { amount: '0.00', currencyCode: 'USD' };
    }

    const total = cart.cost.totalAmount;
    return { amount: total.amount, currencyCode: total.currencyCode };
  }
}

// Initialize cart manager
const cartManager = new CartManager();

// Make available globally
window.cartManager = cartManager;

// Format price for display
function formatPrice(amount, currencyCode = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode,
  }).format(parseFloat(amount));
}

// Make formatPrice available globally
window.formatPrice = formatPrice;
