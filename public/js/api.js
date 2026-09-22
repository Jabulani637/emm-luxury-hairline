/**
 * API client — wraps all fetch calls to the backend /api/* endpoints.
 *
 * This file is the only place on the frontend that decides where the API lives.
 * Resolution order:
 *   1. The production API origin, when the page is served from one of the live
 *      emmluxuryhair.com hosts — the pages are static files hosted apart from
 *      the API there, so a relative path would be wrong.
 *   2. window.APP_CONFIG.API_BASE_URL, if something set it before this loaded.
 *   3. GET /api/config, whose apiBaseUrl comes from the server's BACKEND_URL —
 *      collapsed back to a relative /api whenever it names the origin the page
 *      is already on.
 *   4. This page's own origin + /api, which is correct for local dev and for
 *      any host that serves the frontend and the API together.
 */

let _apiBase = null;          // resolved once, cached for the session
let _configPromise = null;    // single in-flight request guard

function sameOriginAsPage(absoluteUrl) {
  if (typeof window === 'undefined') return false;
  try {
    return new URL(absoluteUrl, window.location.href).origin === window.location.origin;
  } catch (_) {
    return false;
  }
}

async function resolveApiBase() {
  // Already resolved this session
  if (_apiBase) return _apiBase;

  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname.toLowerCase();
    if (hostname === 'api.emmluxuryhair.com' || hostname === 'www.emmluxuryhair.com' || hostname === 'emmluxuryhair.com') {
      // The pages are hosted as static files, separately from the API, so a
      // relative /api would hit the file host and 404. Name the API origin.
      _apiBase = 'https://api.emmluxuryhair.com/api';
      window.APP_CONFIG = window.APP_CONFIG || {};
      window.APP_CONFIG.API_BASE_URL = _apiBase;
      return _apiBase;
    }
  }

  // Explicit override: anything set on the page before this script loads wins
  if (typeof window !== 'undefined' && window.APP_CONFIG && window.APP_CONFIG.API_BASE_URL) {
    _apiBase = window.APP_CONFIG.API_BASE_URL.replace(/\/$/, '');
    return _apiBase;
  }

  // Only fire one /api/config request even if multiple callers hit this simultaneously
  if (!_configPromise) {
    // Try with a short timeout to avoid long waits when page is served from file:// or a different host
    _configPromise = (async () => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 1500);
        const r = await fetch('/api/config', { signal: controller.signal });
        clearTimeout(timer);
        if (!r.ok) return null;
        return await r.json();
      } catch (err) {
        return null;
      }
    })();
  }

  const cfg = await _configPromise;
  if (cfg && cfg.apiBaseUrl) {
    const configured = cfg.apiBaseUrl.replace(/\/$/, '');
    // BACKEND_URL is absolute, so it can name an origin the page is not actually
    // on — a dev server started on another port, or a preview URL. When the two
    // do match, stay relative: one less hop, and same-origin calls are what a
    // connect-src 'self' policy can cover without ever being widened.
    _apiBase = sameOriginAsPage(configured) ? '/api' : configured;
    // Make it available to other scripts that read window.APP_CONFIG
    if (typeof window !== 'undefined') {
      window.APP_CONFIG = window.APP_CONFIG || {};
      window.APP_CONFIG.API_BASE_URL = _apiBase;
    }
    return _apiBase;
  }
  // Fallbacks in order:
  // 1) If the page is opened straight off disk -> assume a local server
  if (typeof window !== 'undefined' && window.location && window.location.protocol === 'file:') {
    _apiBase = 'http://localhost:3000/api';
    return _apiBase;
  }
  // 2) Same-origin backend (when frontend served by same host)
  if (typeof window !== 'undefined') {
    _apiBase = `${window.location.protocol}//${window.location.host}/api`;
    return _apiBase;
  }
  _apiBase = '/api';
  return _apiBase;
}

/**
 * The country this visitor asked to be shown prices for, or null for "the
 * store's own". The server ignores a country it cannot sell to, so remembering a
 * choice is safe even if Shopify later closes that market.
 */
const COUNTRY_KEY = 'emm_country';

const emmMarket = {
  getCountry() {
    let saved = null;
    try {
      saved = window.localStorage.getItem(COUNTRY_KEY);
    } catch (_) {
      return null; // private mode, or storage disabled
    }
    return typeof saved === 'string' && /^[A-Za-z]{2}$/.test(saved)
      ? saved.toUpperCase()
      : null;
  },
  setCountry(code) {
    try {
      if (code) {
        window.localStorage.setItem(COUNTRY_KEY, String(code).toUpperCase());
      } else {
        window.localStorage.removeItem(COUNTRY_KEY);
      }
    } catch (_) { /* the choice simply will not persist */ }
  },
};

/**
 * Core fetch wrapper — resolves the base URL first, then makes the request.
 */
async function apiFetch(endpoint, options = {}) {
  const base = await resolveApiBase();
  const url  = base + endpoint;

  const country = emmMarket.getCountry();

  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...(country ? { 'X-EMM-Country': country } : null),
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

  // Reads back the cart Shopify actually has, and puts this visitor's market on
  // it when the X-EMM-Country header names one Shopify sells to. A null cart is
  // one that no longer exists, which the caller rebuilds from.
  applyBuyerIdentity: (cartId) =>
    apiFetch('/cart/buyer-identity', { method: 'POST', body: JSON.stringify({ cartId }) }),
};

const countriesAPI = {
  getCountries: () => apiFetch('/countries'),
};

// What delivery to one country costs at the prices published in Shopify admin.
// The cart page only asks after Shopify itself has quoted nothing.
const shippingAPI = {
  getQuote: (country) => apiFetch(`/shipping/quote?country=${encodeURIComponent(country)}`),
};

const ratesAPI = {
  getRates: () => apiFetch('/rates'),
};

const contactAPI = {
  submit: (payload) => apiFetch('/contact', { method: 'POST', body: JSON.stringify(payload) }),
};

const subscribersAPI = {
  subscribe: (email, honeypot) =>
    apiFetch('/subscribers', { method: 'POST', body: JSON.stringify({ email, website: honeypot }) }),
};

/* ── Expose globals ───────────────────────────────────────────────────── */
window.productsAPI    = productsAPI;
window.collectionsAPI = collectionsAPI;
window.cartAPI        = cartAPI;
window.countriesAPI   = countriesAPI;
window.shippingAPI    = shippingAPI;
window.ratesAPI       = ratesAPI;
window.contactAPI     = contactAPI;
window.subscribersAPI = subscribersAPI;
window.emmMarket      = emmMarket;
window.__resolveApiBase = resolveApiBase; // for debugging
