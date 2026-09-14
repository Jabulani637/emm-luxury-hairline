/**
 * Cart Page JavaScript
 * Handles cart page rendering and operations
 */

document.addEventListener('DOMContentLoaded', () => {
  const cartItemsSection = document.getElementById('cart-items-section');
  const cartSubtotalEl = document.getElementById('cart-subtotal');
  const cartTotalEl = document.getElementById('cart-total');
  
  if (!cartItemsSection) return;

  renderCartPage();

  // Subscribe to cart changes
  window.cartManager.subscribe(renderCartPage);
});

function renderCartPage() {
  const cartItemsSection = document.getElementById('cart-items-section');
  const cartSubtotalEl = document.getElementById('cart-subtotal');
  const cartTotalEl = document.getElementById('cart-total');
  
  const cart = window.cartManager.getCart();

  if (!cart || !cart.lines || cart.lines.edges.length === 0) {
    cartItemsSection.innerHTML = `
      <div class="empty-cart">
        <p>Your bag is empty</p>
        <a href="/" class="btn btn-primary">Continue Shopping</a>
      </div>
    `;
    if (cartSubtotalEl) cartSubtotalEl.textContent = '$0.00';
    if (cartTotalEl) cartTotalEl.textContent = '$0.00';
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

  cartItemsSection.innerHTML = itemsHtml;

  // Update totals
  const total = window.cartManager.getTotal();
  const currency = window.cartManager.getCurrency();
  
  if (cartSubtotalEl) {
    cartSubtotalEl.textContent = formatPrice(total, currency);
  }
  if (cartTotalEl) {
    cartTotalEl.textContent = formatPrice(total, currency);
  }

  // Setup quantity change handlers
  setupQuantityHandlers();

  // Setup checkout button
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
