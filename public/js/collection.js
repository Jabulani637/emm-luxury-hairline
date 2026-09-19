/**
 * Collection Page JavaScript
 * Handles loading and displaying collection products.
 * Falls back to fetching all products when the collection handle
 * is "all" or when no matching Shopify collection is found.
 */


document.addEventListener('DOMContentLoaded', async () => {
  const collectionPage = document.getElementById('collection-page');
  
  if (!collectionPage) return;

  const handle = window.handleFromLocation('collections') || 'all';

  // "all" is Shopify's virtual collection — not a real collection handle.
  // Fetch all products directly via the products API instead.
  if (handle === 'all') {
    try {
      collectionPage.innerHTML = '<div class="loading">Loading products…</div>';
      const response = await window.productsAPI.getProducts({ first: 24, sortKey: 'BEST_SELLING' });
      const products = response.products || [];
      renderCollection({
        title: 'All Products',
        description: '',
        products,
      });
    } catch (error) {
      console.error('[Collection] Failed to load all products:', error);
      collectionPage.innerHTML = '<div class="error-message"><p>Unable to load products at this time.</p></div>';
    }
    return;
  }

  try {
    collectionPage.innerHTML = '<div class="loading">Loading collection…</div>';
    const response = await window.collectionsAPI.getCollection(handle);
    
    if (!response.collection) {
      // Collection handle doesn't exist in Shopify yet — show all products
      const fallback = await window.productsAPI.getProducts({ first: 24, sortKey: 'BEST_SELLING' });
      renderCollection({
        title: handle.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        description: '',
        products: fallback.products || [],
      });
      return;
    }

    renderCollection(response.collection);
  } catch (error) {
    console.error('[Collection] Failed to load collection:', error);
    collectionPage.innerHTML = '<div class="error-message"><p>Unable to load this collection at this time.</p></div>';
  }
});

function renderCollection(collection) {
  const collectionPage = document.getElementById('collection-page');
  const products = collection.products || [];

  const productsHtml = products.length > 0
    ? `<div class="product-grid">
        ${products.map(product => createProductCard(product)).join('')}
       </div>`
    : '<p class="no-products">No products in this collection yet — check back soon.</p>';

  collectionPage.innerHTML = `
    <div class="collection-header">
      <h1>${escapeHtml(collection.title)}</h1>
      ${collection.description ? `<p class="collection-description">${escapeHtml(collection.description)}</p>` : ''}
    </div>
    ${productsHtml}
  `;

  attachProductCardHandlers(collectionPage);
}


// After render, attach click handlers for inline add-to-cart and sold-out buttons
function attachProductCardHandlers(scopeEl) {
  const root = scopeEl || document;

  root.querySelectorAll('.card-add-btn').forEach(btn => {
    if (btn.dataset.handlerAttached === '1') return;
    btn.dataset.handlerAttached = '1';
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const variantId = btn.dataset.variantId;
      if (!variantId) {
        window.location.href = btn.closest('.product-card-wrapper')?.querySelector('a.product-card')?.href || '/collections/all';
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
        openCartDrawerIfAvailableGeneric();
      } catch (err) {
        console.error('[Collection] Add to cart failed:', err);
        alert('Failed to add this item to your cart. Please try again.');
        btn.disabled = false;
        btn.textContent = originalText;
      }
    });
  });

  root.querySelectorAll('.card-soldout-btn').forEach(btn => {
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

function openCartDrawerIfAvailableGeneric() {
  if (typeof window.openCartDrawer === 'function') {
    window.openCartDrawer();
    return;
  }
  const drawer = document.getElementById('cart-drawer');
  if (drawer) drawer.classList.add('open');
}

// Make the handler attach helper available globally (home.js etc. reuse this)
window.attachProductCardHandlers = attachProductCardHandlers;
