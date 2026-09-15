/**
 * Collection Page JavaScript
 * Handles loading and displaying collection products
 */

document.addEventListener('DOMContentLoaded', async () => {
  const collectionPage = document.getElementById('collection-page');
  
  if (!collectionPage) return;

  // Get collection handle from URL
  const urlParams = new URLSearchParams(window.location.search);
  const handle = urlParams.get('handle');

  if (!handle) {
    collectionPage.innerHTML = '<div class="error-message"><p>Collection handle not specified.</p></div>';
    return;
  }

  try {
    const response = await window.collectionsAPI.getCollection(handle);
    
    if (!response.collection) {
      collectionPage.innerHTML = '<div class="error-message"><p>Collection not found.</p></div>';
      return;
    }

    const collection = response.collection;
    renderCollection(collection);
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
      <h1>${collection.title}</h1>
      ${collection.description ? `<p class="collection-description">${collection.description}</p>` : ''}
    </div>
    ${productsHtml}
  `;
}

function createProductCard(product) {
  const image = product.images && product.images.length > 0 ? product.images[0] : null;
  const price = product.priceRange?.minVariantPrice;
  const isNew = product.tags && product.tags.includes('new');
  const isBestseller = product.tags && product.tags.includes('bestseller');

  const badges = [];
  if (isNew) badges.push('<span class="product-badge gold">NEW</span>');
  if (isBestseller) badges.push('<span class="product-badge burgundy">BESTSELLER</span>');

  const variants = product.variants || [];
  const firstAvailable = variants.find(v => v && v.availableForSale === true) || variants[0] || null;
  const hasAnyAvailable = variants.some(v => v && v.availableForSale === true) || product.availableForSale === true;
  const singleVariant = variants.length === 1;
  const cardId = 'card-' + (product.handle || Math.random().toString(36).slice(2, 8));

  let availabilityBadge = '';
  if (!hasAnyAvailable) {
    badges.push('<span class="product-badge product-badge--soldout">SOLD OUT</span>');
    availabilityBadge = '<span class="card-availability sold-out-text">Out of stock</span>';
  } else if (singleVariant) {
    availabilityBadge = '<span class="card-availability in-stock">In stock</span>';
  } else {
    availabilityBadge = '<span class="card-availability multi-option">Multiple options</span>';
  }

  const imageHtml = image 
    ? `<img src="${image.url}" alt="${image.altText || product.title}" loading="lazy">`
    : '<div class="no-image">No image</div>';

  let actionButton;
  if (!hasAnyAvailable) {
    actionButton = `<button type="button" class="btn btn-block btn-secondary card-soldout-btn" data-handle="${encodeURIComponent(product.handle || '')}" data-title="${encodeURIComponent(product.title || '')}" data-variant-id="${encodeURIComponent(firstAvailable && firstAvailable.id ? firstAvailable.id : '')}" data-variant-title="${encodeURIComponent(firstAvailable && firstAvailable.title ? firstAvailable.title : '')}" data-price="${encodeURIComponent(price && price.amount ? price.amount : '')}" data-currency="${encodeURIComponent(price && price.currencyCode ? price.currencyCode : '')}">Sold Out — Custom Order</button>`;
  } else if (singleVariant && firstAvailable) {
    actionButton = `<button type="button" class="btn btn-block btn-primary card-add-btn" data-variant-id="${encodeURIComponent(firstAvailable.id)}" data-handle="${encodeURIComponent(product.handle || '')}">Add to Cart</button>`;
  } else {
    actionButton = `<a href="/products/product.html?handle=${encodeURIComponent(product.handle || '')}" class="btn btn-block btn-primary card-select-options">Select Options</a>`;
  }

  return `
    <div class="product-card-wrapper" id="${cardId}">
      <a href="/products/product.html?handle=${encodeURIComponent(product.handle || '')}" class="product-card">
        <div class="product-image">
          ${imageHtml}
          ${badges.join('')}
        </div>
        <div class="product-info">
          <h3 class="product-title">${product.title}</h3>
          <p class="product-price">${price ? formatPrice(price.amount, price.currencyCode) : ''}</p>
          <p class="product-availability">${availabilityBadge}</p>
        </div>
      </a>
      <div class="product-card-actions">
        ${actionButton}
      </div>
    </div>
  `;
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
      window.location.href = '/pages/custom-order.html?' + params.toString();
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

// After renderCollection runs, wire up the buttons
const _originalRenderCollection = window.renderCollection;
if (!_originalRenderCollection) {
  const origRender = renderCollection;
  window.renderCollection = function patchedRenderCollection(collection) {
    const result = origRenderCollection.apply(this, arguments);
    requestAnimationFrame(() => attachProductCardHandlers());
    return result;
  };
} else {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => attachProductCardHandlers(), 150);
  });
}
