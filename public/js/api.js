/**
 * API client — wraps all fetch calls to the backend /api/* endpoints.
 *
 * API base URL resolution order:
 *   1. Fetched from GET /api/config  (server reads BACKEND_URL from .env)
 *   2. window.APP_CONFIG.API_BASE_URL if already set by an inline script
 *   3. Same-origin /api  (safe fallback — works when frontend & backend share a host)
 *
 * This means NO URL is ever hardcoded here. Change BACKEND_URL in .env
 * and the whole site picks it up automatically.
 */

let _apiBase = null;          // resolved once, cached for the session
let _configPromise = null;    // single in-flight request guard

async function resolveApiBase() {
  // Already resolved this session
  if (_apiBase) return _apiBase;

  // Inline APP_CONFIG set before this script loaded (legacy support)
  if (typeof window !== 'undefined' && window.APP_CONFIG && window.APP_CONFIG.API_BASE_URL) {
    _apiBase = window.APP_CONFIG.API_BASE_URL.replace(/\/$/, '');
    return _apiBase;
  }

  // Only fire one /api/config request even if multiple callers hit this simultaneously
  if (!_configPromise) {
    _configPromise = fetch('/api/config')
      .then(r => r.ok ? r.json() : null)
      .catch(() => null);
  }

  const cfg = await _configPromise;
  if (cfg && cfg.apiBaseUrl) {
    _apiBase = cfg.apiBaseUrl.replace(/\/$/, '');
    // Make it available to other scripts that read window.APP_CONFIG
    if (typeof window !== 'undefined') {
      window.APP_CONFIG = window.APP_CONFIG || {};
      window.APP_CONFIG.API_BASE_URL = _apiBase;
    }
    return _apiBase;
  }

  // Ultimate fallback: same origin
  _apiBase = (typeof window !== 'undefined')
    ? `${window.location.protocol}//${window.location.host}/api`
    : '/api';
  return _apiBase;
}

/**
 * Core fetch wrapper — resolves the base URL first, then makes the request.
 */
async function apiFetch(endpoint, options = {}) {
  const base = await resolveApiBase();
  const url  = base + endpoint;

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
        const err = await response.json();
        errorMsg = err.error || errorMsg;
      } catch (_) {}
      throw new Error(`${errorMsg} (${response.status} ${response.statusText})`);
    }

    return await response.json();
  } catch (error) {
    console.error('[API] Error calling', url, ':', error.message);
    throw error;
  }
}

/* ── Domain APIs ──────────────────────────────────────────────────────── */

const productsAPI = {
  getProducts: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/products?${qs}`);
  },
  getProduct: (handle) => apiFetch(`/products/${handle}`),
};

const collectionsAPI = {
  getCollection: (handle, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/collections/${handle}?${qs}`);
  },
};

const cartAPI = {
  createCart: (variantId, quantity = 1) =>
    apiFetch('/cart/create', { method: 'POST', body: JSON.stringify({ variantId, quantity }) }),

  addToCart: (cartId, lines) =>
    apiFetch('/cart/add', { method: 'POST', body: JSON.stringify({ cartId, lines }) }),

  updateCart: (cartId, lines) =>
    apiFetch('/cart/update', { method: 'POST', body: JSON.stringify({ cartId, lines }) }),

  updateDeliveryAddress: (cartId, address) =>
    apiFetch('/cart/delivery-address', { method: 'POST', body: JSON.stringify({ cartId, address }) }),

  selectDeliveryOptions: (cartId, deliveryOptions) =>
    apiFetch('/cart/delivery-options', { method: 'POST', body: JSON.stringify({ cartId, deliveryOptions }) }),

  clearBuyerIdentity: (cartId) =>
    apiFetch('/cart/buyer-identity', { method: 'POST', body: JSON.stringify({ cartId }) }),
};

const countriesAPI = {
  getCountries: () => apiFetch('/countries'),
};

/* ── Expose globals ───────────────────────────────────────────────────── */
window.productsAPI    = productsAPI;
window.collectionsAPI = collectionsAPI;
window.cartAPI        = cartAPI;
window.countriesAPI   = countriesAPI;
window.__resolveApiBase = resolveApiBase; // for debugging
