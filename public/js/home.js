/**
 * Homepage JavaScript
 * Handles loading and displaying bestsellers
 */


document.addEventListener('DOMContentLoaded', async () => {
  const bestsellersGrid = document.getElementById('bestsellers-grid');
  
  if (!bestsellersGrid) return;

  try {
    const response = await window.productsAPI.getProducts({
      first: 4,
      sortKey: 'BEST_SELLING',
    });

    if (response.products && response.products.length > 0) {
      bestsellersGrid.innerHTML = response.products.map(product => createProductCard(product)).join('');
    } else {
      bestsellersGrid.innerHTML = `
        <div class="no-products">
          <p>No products available at this time. Check back soon for our latest arrivals!</p>
        </div>
      `;
    }
  } catch (error) {
    console.error('[Home] Failed to load bestsellers:', error);
    bestsellersGrid.innerHTML = `
      <div class="error-message" style="padding: 20px; background: #fee; border: 1px solid #fcc; border-radius: 8px; text-align: center;">
        <p style="color: #c33; font-weight: 600;">We're having trouble loading products right now.</p>
        <p style="color: #666; font-size: 14px; margin-top: 8px;">Please refresh the page or try again in a moment.</p>
      </div>
    `;
  }
});


document.addEventListener('DOMContentLoaded', function wireHomeCards() {
  const poll = () => {
    if (typeof window.attachProductCardHandlers === 'function') {
      window.attachProductCardHandlers();
      return;
    }
    const btns = document.querySelectorAll('.card-add-btn, .card-soldout-btn');
    if (btns.length === 0) {
      setTimeout(poll, 120);
      return;
    }
    // Collection helpers may not be loaded (e.g. no collection.js on home); provide fallback attachment.
    if (!window.attachProductCardHandlers) {
      attachHomeCardHandlers();
    } else {
      window.attachProductCardHandlers();
    }
  };
  setTimeout(poll, 80);
});

function attachHomeCardHandlers() {
  document.querySelectorAll('.card-add-btn').forEach(btn => {
    if (btn.dataset.handlerAttached === '1') return;
    btn.dataset.handlerAttached = '1';
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const variantId = btn.dataset.variantId;
      if (!variantId) {
        const link = btn.closest('.product-card-wrapper')?.querySelector('a.product-card');
        if (link) window.location.href = link.href;
        return;
      }
      const originalText = btn.textContent;
      try {
        btn.disabled = true;
        btn.textContent = 'Adding...';
        await window.cartManager.addToCart(variantId, 1);
        btn.textContent = 'Added ✓';
        btn.classList.add('added');
        setTimeout(() => {
          btn.textContent = originalText;
          btn.disabled = false;
          btn.classList.remove('added');
        }, 1800);
        const drawer = document.getElementById('cart-drawer');
        if (drawer) drawer.classList.add('open');
      } catch (err) {
        console.error('[Home] Add to cart failed:', err);
        alert('Failed to add this item to your cart. Please try again.');
        btn.disabled = false;
        btn.textContent = originalText;
      }
    });
  });

  document.querySelectorAll('.card-soldout-btn').forEach(btn => {
    if (btn.dataset.handlerAttached === '1') return;
    btn.dataset.handlerAttached = '1';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const params = new URLSearchParams();
      if (btn.dataset.handle) params.set('productHandle', decodeURIComponent(btn.dataset.handle));
      if (btn.dataset.title) params.set('productTitle', decodeURIComponent(btn.dataset.title));
      if (btn.dataset.variantId) params.set('variantId', decodeURIComponent(btn.dataset.variantId));
      if (btn.dataset.variantTitle) params.set('variantTitle', decodeURIComponent(btn.dataset.variantTitle));
      if (btn.dataset.price) params.set('price', decodeURIComponent(btn.dataset.price));
      if (btn.dataset.currency) params.set('currency', decodeURIComponent(btn.dataset.currency));
      window.location.href = '/pages/custom-order?' + params.toString();
    });
  });
}
