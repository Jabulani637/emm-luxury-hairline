/**
 * Navigation JavaScript
 * Shared header/cart-count logic across all pages
 */

document.addEventListener('DOMContentLoaded', () => {
  initializeCartDrawer();
  updateCartCount();
  setupCartListener();
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

  // Checkout button
  const checkoutBtn = document.querySelector('.checkout-btn');
  if (checkoutBtn) {
    checkoutBtn.addEventListener('click', () => {
      const checkoutUrl = window.cartManager.getCheckoutUrl();
      if (checkoutUrl) {
        window.location.href = checkoutUrl;
      } else {
        alert('Your cart is empty');
      }
    });
  }
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

function renderCartItems() {
  const cartItemsContainer = document.getElementById('cart-items');
  const cartTotalEl = document.getElementById('cart-total');
  
  if (!cartItemsContainer) return;

  const cart = window.cartManager.getCart();

  if (!cart || !cart.lines || cart.lines.edges.length === 0) {
    cartItemsContainer.innerHTML = '<p class="empty-cart">Your bag is empty</p>';
    if (cartTotalEl) {
      cartTotalEl.textContent = '$0.00';
    }
    return;
  }

  const itemsHtml = cart.lines.edges.map(line => {
    const lineItem = line.node;
    const merchandise = lineItem.merchandise;
    const product = merchandise?.product;
    const image = merchandise?.image || product?.images?.[0];

    return `
      <div class="cart-item">
        <div class="cart-item-image">
          ${image ? `<img src="${image.url}" alt="${image.altText || merchandise.title}">` : '<div class="no-image">No image</div>'}
        </div>
        <div class="cart-item-details">
          <p class="cart-item-title">${product?.title || 'Product'}</p>
          <p class="cart-item-variant">${merchandise?.title || ''}</p>
          <p class="cart-item-price">${formatPrice(merchandise?.price?.amount || 0, merchandise?.price?.currencyCode || 'USD')}</p>
          <div class="cart-item-quantity">
            <button class="quantity-decrease" data-line-id="${lineItem.id}">−</button>
            <span>${lineItem.quantity}</span>
            <button class="quantity-increase" data-line-id="${lineItem.id}">+</button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  cartItemsContainer.innerHTML = itemsHtml;

  // Update total
  if (cartTotalEl) {
    const total = window.cartManager.getTotal();
    const currency = window.cartManager.getCurrency();
    cartTotalEl.textContent = formatPrice(total, currency);
  }

  // Setup quantity change handlers
  setupQuantityHandlers();
}

function setupQuantityHandlers() {
  const decreaseButtons = document.querySelectorAll('.quantity-decrease');
  const increaseButtons = document.querySelectorAll('.quantity-increase');

  decreaseButtons.forEach(button => {
    button.addEventListener('click', async () => {
      const lineId = button.dataset.lineId;
      const currentQuantity = parseInt(button.nextElementSibling.textContent);
      
      if (currentQuantity > 1) {
        try {
          await window.cartManager.updateQuantity(lineId, currentQuantity - 1);
        } catch (error) {
          console.error('[Cart] Failed to update quantity:', error);
          alert('Failed to update quantity');
        }
      }
    });
  });

  increaseButtons.forEach(button => {
    button.addEventListener('click', async () => {
      const lineId = button.dataset.lineId;
      const currentQuantity = parseInt(button.previousElementSibling.textContent);
      
      try {
        await window.cartManager.updateQuantity(lineId, currentQuantity + 1);
      } catch (error) {
        console.error('[Cart] Failed to update quantity:', error);
        alert('Failed to update quantity');
      }
    });
  });
}
