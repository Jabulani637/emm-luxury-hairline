/**
 * Converts Shopify's cart permalink (/cart/c/TOKEN) to the direct checkout
 * URL (/checkouts/cn/TOKEN?skip_shop_pay=true) so the browser lands on the
 * standard Shopify checkout form instead of being intercepted by Shop Pay
 * or bounced back to the storefront homepage.
 */
function buildDirectCheckoutUrl(cartCheckoutUrl) {
  try {
    const url = new URL(cartCheckoutUrl);
    const match = url.pathname.match(/^\/cart\/c\/([^/?]+)/);
    if (match) {
      url.pathname = '/checkouts/cn/' + match[1];
    }
    url.searchParams.delete('_s');
    url.searchParams.delete('_y');
    url.searchParams.set('skip_shop_pay', 'true');
    return url.toString();
  } catch (_) {
    return cartCheckoutUrl;
  }
}

/**
 * Navigation JavaScript
 * Shared header/cart-count logic across all pages
 */

document.addEventListener('DOMContentLoaded', () => {
  initializeCartDrawer();
  updateCartCount();
  setupCartListener();
  initAccountLinks();   // wire account icon → Shopify hosted account
});

function initializeCartDrawer() {
  const cartBtn = document.querySelector('.cart-btn');
  const cartDrawer = document.getElementById('cart-drawer');
  const closeCartBtn = document.querySelector('.close-cart');
  const cartOverlay = document.querySelector('.cart-overlay');

  if (!cartBtn || !cartDrawer) return;

  // Open cart drawer
  cartBtn.addEventListener('click', () => {
    cartDrawer.classList.add('open');
    renderCartItems();
  });

  // Close cart drawer
  if (closeCartBtn) {
    closeCartBtn.addEventListener('click', () => {
      cartDrawer.classList.remove('open');
    });
  }

  if (cartOverlay) {
    cartOverlay.addEventListener('click', () => {
      cartDrawer.classList.remove('open');
    });
  }

  // Checkout button — clear country lock before redirecting
  const checkoutBtn = cartDrawer.querySelector('.checkout-btn');
  if (checkoutBtn) {
    checkoutBtn.addEventListener('click', async () => {
      const cart = window.cartManager.getCart();
      const rawCheckoutUrl = window.cartManager.getCheckoutUrl();

      if (!rawCheckoutUrl || !cart) {
        alert('Your cart is empty');
        return;
      }

      const originalText = checkoutBtn.textContent;
      checkoutBtn.disabled = true;
      checkoutBtn.textContent = 'Redirecting…';

      try {
        await window.cartAPI.clearBuyerIdentity(cart.id);
      } catch (err) {
        console.warn('[Cart] Could not clear buyer identity:', err.message);
      }

      // Use direct /checkouts/cn/ URL to bypass Shop Pay interception
      const directUrl = buildDirectCheckoutUrl(rawCheckoutUrl);
      window.location.href = directUrl;
    });
  }

  // Wire up quantity steppers once — delegated listener survives re-renders
  initCartQuantityHandlers();
}

function updateCartCount() {
  const cartCountEl = document.getElementById('cart-count');
  if (cartCountEl) {
    const count = window.cartManager.getItemCount();
    cartCountEl.textContent = count;
  }
}

function setupCartListener() {
  window.cartManager.subscribe(() => {
    updateCartCount();
    renderCartItems();
  });
}

// Expose so other scripts (collection.js, home.js) can open the drawer
window.openCartDrawer = function () {
  const cartDrawer = document.getElementById('cart-drawer');
  if (cartDrawer) {
    cartDrawer.classList.add('open');
    renderCartItems();
  }
};

function renderCartItems() {
  const cartItemsContainer = document.getElementById('cart-items');
  const cartTotalEl = document.getElementById('cart-total');
  
  if (!cartItemsContainer) return;

  const cart = window.cartManager.getCart();

  if (!cart || !cart.lines || cart.lines.edges.length === 0) {
    cartItemsContainer.innerHTML = '<p class="empty-cart">Your bag is empty</p>';
    if (cartTotalEl) cartTotalEl.textContent = '$0.00';
    return;
  }

  const itemsHtml = cart.lines.edges.map(line => {
    const lineItem = line.node;
    const merchandise = lineItem.merchandise;
    const product = merchandise?.product;
    // Image is nested: merchandise.image (direct) OR product.images.edges[0].node
    const image = merchandise?.image
      || product?.images?.edges?.[0]?.node
      || product?.images?.[0]
      || null;
    // Store lineId and current quantity directly on the stepper buttons as data attrs.
    // Use encodeURIComponent so the GID (which contains ? = :) is safe inside the attribute.
    const safeId = encodeURIComponent(lineItem.id);

    return `
      <div class="cart-item">
        <div class="cart-item-image">
          ${image ? `<img src="${image.url}" alt="${escapeHtml(image.altText || merchandise.title || '')}">` : '<div class="no-image">No image</div>'}
        </div>
        <div class="cart-item-details">
          <p class="cart-item-title">${escapeHtml(product?.title || 'Product')}</p>
          <p class="cart-item-variant">${escapeHtml(merchandise?.title || '')}</p>
          <p class="cart-item-price">${formatPrice(merchandise?.price?.amount || 0, merchandise?.price?.currencyCode || 'GBP')}</p>
          <div class="cart-item-quantity">
            <button class="quantity-decrease" data-line-id="${safeId}" data-qty="${lineItem.quantity}">−</button>
            <span>${lineItem.quantity}</span>
            <button class="quantity-increase" data-line-id="${safeId}" data-qty="${lineItem.quantity}">+</button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  cartItemsContainer.innerHTML = itemsHtml;

  if (cartTotalEl) {
    const total = window.cartManager.getTotal();
    const currency = window.cartManager.getCurrency();
    cartTotalEl.textContent = formatPrice(total, currency);
  }
}

// Attach ONE delegated listener on the cart-items container (runs once at page load).
// This survives innerHTML replacements because it listens on the stable parent.
function initCartQuantityHandlers() {
  const cartItemsContainer = document.getElementById('cart-items');
  if (!cartItemsContainer) return;

  cartItemsContainer.addEventListener('click', async (e) => {
    const btn = e.target.closest('.quantity-decrease, .quantity-increase');
    if (!btn) return;

    const lineId = decodeURIComponent(btn.dataset.lineId || '');
    if (!lineId) return;

    const currentQty = parseInt(btn.dataset.qty, 10) || 1;
    const isDecrease = btn.classList.contains('quantity-decrease');
    const newQty = isDecrease ? currentQty - 1 : currentQty + 1;

    if (isDecrease && currentQty <= 1) return; // don't go below 1

    // Optimistically disable both steppers for this line to prevent double-clicks
    const wrapper = btn.closest('.cart-item-quantity');
    if (wrapper) wrapper.querySelectorAll('button').forEach(b => { b.disabled = true; });

    try {
      await window.cartManager.updateQuantity(lineId, newQty);
      // cartManager.subscribe → renderCartItems will re-render automatically
    } catch (error) {
      console.error('[Cart] Failed to update quantity:', error);
      alert('Failed to update quantity. Please try again.');
      // Re-enable on failure (re-render would do it on success)
      if (wrapper) wrapper.querySelectorAll('button').forEach(b => { b.disabled = false; });
    }
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Account links — resolves Shopify's hosted account/login URL from /api/config
 * and sets it on every .account-link element in the page.
 *
 * Shopify hosted account URLs:
 *   Login / Register : https://<store>/account/login
 *   Account dashboard: https://<store>/account
 *
 * We always send to /account/login — Shopify automatically redirects logged-in
 * customers to the dashboard and new visitors to the login/register page.
 */
async function initAccountLinks() {
  const links = document.querySelectorAll('.account-link');
  if (!links.length) return;

  try {
    const cfg = await fetch('/api/config').then(r => r.json());
    const storeDomain = cfg.storeDomain;
    if (!storeDomain) return;

    const accountUrl = `https://${storeDomain}/account`;
    const loginUrl   = `https://${storeDomain}/account/login`;

    links.forEach(link => {
      // Send to /account — Shopify redirects to login if not logged in,
      // or to the dashboard if already logged in.
      link.href = accountUrl;
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
      link.setAttribute('title', 'My Account');
    });

    // Show a subtle "Login" label next to the icon if the user hasn't logged in.
    // We can't check session state from the frontend without a customer token,
    // so we just make the link clearly navigable with a tooltip.
  } catch (err) {
    console.warn('[Nav] Could not resolve Shopify account URL:', err.message);
  }
}
