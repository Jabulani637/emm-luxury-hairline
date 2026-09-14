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
