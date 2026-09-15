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
    const errorMessage = error.message || 'Unknown error';
    bestsellersGrid.innerHTML = `
      <div class="error-message" style="padding: 20px; background: #fee; border: 1px solid #fcc; border-radius: 8px; text-align: center;">
        <p style="color: #c33; font-weight: 600;">Unable to load products</p>
        <p style="color: #666; font-size: 14px; margin-top: 8px;">Error: ${errorMessage}</p>
        <p style="color: #666; font-size: 12px; margin-top: 8px;">Please check your Shopify credentials in the .env file</p>
      </div>
    `;
  }
});

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
    <div class="product-card-wrapper">
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
      window.location.href = '/pages/custom-order.html?' + params.toString();
    });
  });
}
