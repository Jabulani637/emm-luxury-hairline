/**
 * API client - wraps fetch calls to your backend API
 * Never calls Shopify directly, always goes through your /api/* endpoints
 */

const API_BASE = '/api';

/**
 * Fetch wrapper with error handling
 */
async function apiFetch(endpoint, options = {}) {
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'API request failed');
    }

    return await response.json();
  } catch (error) {
    console.error('[API] Error:', error);
    throw error;
  }
}

/**
 * Products API
 */
const productsAPI = {
  getProducts: (params = {}) => {
    const queryParams = new URLSearchParams(params).toString();
    return apiFetch(`/products?${queryParams}`);
  },
  
  getProduct: (handle) => {
    return apiFetch(`/products/${handle}`);
  },
};

/**
 * Collections API
 */
const collectionsAPI = {
  getCollection: (handle, params = {}) => {
    const queryParams = new URLSearchParams(params).toString();
    return apiFetch(`/collections/${handle}?${queryParams}`);
  },
};

/**
 * Cart API
 */
const cartAPI = {
  createCart: (variantId, quantity = 1) => {
    return apiFetch('/cart/create', {
      method: 'POST',
      body: JSON.stringify({ variantId, quantity }),
    });
  },
  
  addToCart: (cartId, lines) => {
    return apiFetch('/cart/add', {
      method: 'POST',
      body: JSON.stringify({ cartId, lines }),
    });
  },
  
  updateCart: (cartId, lines) => {
    return apiFetch('/cart/update', {
      method: 'POST',
      body: JSON.stringify({ cartId, lines }),
    });
  },
};

// Make available globally for browser
window.productsAPI = productsAPI;
window.collectionsAPI = collectionsAPI;
window.cartAPI = cartAPI;
