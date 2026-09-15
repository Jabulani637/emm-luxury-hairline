/**
 * API client - wraps fetch calls to your backend API
 * Never calls Shopify directly, always goes through your backend /api/* endpoints
 *
 * The backend URL is resolved in this order:
 *   1. window.APP_CONFIG.API_BASE_URL (set via <script> tag in HTML before api.js loads)
 *   2. VITE_API_BASE_URL / REACT_APP_API_BASE_URL etc. (if bundled with a build tool)
 *   3. Same origin: '/api' (frontend & backend on the same domain, e.g. Render serving public/)
 *   4. Fallback: the default Render backend URL below (EDIT THIS FOR YOUR DEPLOYMENT)
 */

const DEFAULT_RENDER_BACKEND = 'https://emm-luxury-hairline.onrender.com';

function resolveApiBase() {
  if (typeof window !== 'undefined' && window.APP_CONFIG && window.APP_CONFIG.API_BASE_URL) {
    const base = window.APP_CONFIG.API_BASE_URL.replace(/\/$/, '');
    console.log('[API] Using API_BASE_URL from window.APP_CONFIG:', base);
    return base;
  }

  const sameOriginBase = `${window.location.protocol}//${window.location.host}`;
  const candidates = [
    sameOriginBase + '/api',
  ];

  for (const base of candidates) {
    try {
      const url = new URL(base);
      if (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.port) {
        console.log('[API] Local dev detected — using same-origin API base:', base);
        return base;
      }
    } catch (_) {}
  }

  if (DEFAULT_RENDER_BACKEND && DEFAULT_RENDER_BACKEND !== 'https://your-backend.onrender.com') {
    const base = DEFAULT_RENDER_BACKEND.replace(/\/$/, '') + '/api';
    console.log('[API] Using default Render backend API base:', base);
    return base;
  }

  console.log('[API] Falling back to same-origin API base:', sameOriginBase + '/api');
  return sameOriginBase + '/api';
}

const API_BASE = resolveApiBase();

/**
 * Fetch wrapper with error handling
 */
async function apiFetch(endpoint, options = {}) {
  const url = API_BASE + endpoint;
  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });

    if (!response.ok) {
      let errorMsg = 'API request failed';
      try {
        const error = await response.json();
        errorMsg = error.error || errorMsg;
      } catch (_) {}
      throw new Error(`${errorMsg} (${response.status} ${response.statusText}) while calling ${url}`);
    }

    return await response.json();
  } catch (error) {
    console.error('[API] Error calling', url, ':', error.message);
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

window.__API_BASE__ = API_BASE;
window.productsAPI = productsAPI;
window.collectionsAPI = collectionsAPI;
window.cartAPI = cartAPI;
