/**
 * Product page: what a shopper sees when they open a wig, and what they can
 * change about it.
 *
 * Everything on this page comes from the store. The spec rows, processing time,
 * sizing guide, category and pictures are read straight from the product, so a
 * merchant adding a product in Shopify gets a complete page without anyone
 * editing this file — and a field left empty in the admin leaves no trace here
 * rather than an empty label.
 */

// Shopify says "in stock" for anything above zero. Below this many, the count is
// worth telling the shopper about; above it, a number invites questions the
// store cannot answer (is that the whole stock, or just this warehouse?).
const SCARCITY_THRESHOLD = 5;

document.addEventListener('DOMContentLoaded', async () => {
  const productPage = document.getElementById('product-page');

  if (!productPage) return;

  // Get product handle from URL
  const handle = window.handleFromLocation('products');

  if (!handle) {
    productPage.innerHTML = '<div class="error-message"><p>Product handle not specified.</p></div>';
    return;
  }

  try {
    const response = await window.productsAPI.getProduct(handle);

    if (!response.product) {
      productPage.innerHTML = '<div class="error-message"><p>Product not found.</p></div>';
      return;
    }

    renderProduct(response.product);
  } catch (error) {
    console.error('[Product] Failed to load product:', error);
    productPage.innerHTML = '<div class="error-message"><p>Unable to load this product at this time.</p></div>';
  }
});

function renderProduct(product) {
  const productPage = document.getElementById('product-page');
  const media = product.media || [];
  const price = product.priceRange?.minVariantPrice;
  const optionsHtml = (product.options || []).map(option =>
    createVariantSelector(option, product.variants)
  ).join('');

  productPage.innerHTML = `
    <div class="product-gallery">
      <div class="product-media-main" id="product-media-main">${renderMedia(mainMedia(product), product.title)}</div>
      <div class="product-media-thumbs" id="product-media-thumbs">
        ${media.map((m, i) => renderThumb(m, i, product.title)).join('')}
      </div>
    </div>
    <div class="product-info">
      ${renderCategory(product)}
      <h1>${escapeHtml(product.title)}</h1>
      <div class="product-price" id="product-price-display">
        <span class="current-price">${price ? formatPrice(price.amount, price.currencyCode) : ''}</span>
      </div>
      <p class="product-scarcity" id="product-scarcity" hidden></p>
      <div class="product-description">${product.descriptionSafe
    || `<p>${escapeHtml(product.description || '')}</p>`}</div>
      ${renderSpecs(product.specs)}
      ${product.specs?.length ? '' : renderQualityNote()}
      <div class="variant-selector">
        ${optionsHtml}
      </div>

      <div class="product-quantity-row">
        <div class="product-incrementor">
          <button id="qty-decrease" type="button" class="qty-btn">−</button>
          <input id="qty-input" type="number" min="1" value="1" aria-label="Quantity">
          <button id="qty-increase" type="button" class="qty-btn">+</button>
        </div>
      </div>

      <div id="product-actions" class="product-actions">
        <button class="btn btn-primary add-to-cart" id="add-to-cart">Add to Cart</button>
        <button class="btn btn-secondary sold-out-btn" id="sold-out-btn" style="display:none;">
          Sold Out — Custom Order
        </button>
      </div>
      <p id="product-availability-note" class="product-availability-note"></p>
      ${renderNotes(product.notes)}
    </div>
  `;

  setupGallery(product);
  setupVariantSelection(product);
  setupQuantityControls();
}

/* ---------- the pictures ---------- */

/**
 * The picture a shopper sees for a chosen length or colour. Shopify lets a
 * merchant attach an image to each variant, so the grid can follow the selection
 * instead of showing one photo of a product that comes in six.
 */
function variantMediaIndex(product, variant) {
  const url = variant?.image?.url;
  if (!url) return 0;
  const base = url.split('?')[0];
  const found = (product.media || []).findIndex(m => m.url.split('?')[0] === base);
  return found === -1 ? 0 : found;
}

function mainMedia(product, index = 0) {
  const media = product.media || [];
  return media[index] || media[0] || null;
}

function renderMedia(item, title) {
  if (!item) return '<div class="no-image">No images available</div>';
  if (item.type === 'video') {
    return `<video src="${escapeHtml(item.url)}" poster="${escapeHtml(item.poster || '')}" controls playsinline preload="metadata" aria-label="${escapeHtml(title)}"></video>`;
  }
  return `<img src="${escapeHtml(item.url)}" alt="${escapeHtml(item.altText || title)}">`;
}

function renderThumb(item, index, title) {
  const preview = item.type === 'video' ? (item.poster || item.url) : item.url;
  return `<button type="button" class="product-thumb" data-index="${index}" aria-label="Show ${escapeHtml(item.type === 'video' ? 'video' : `image ${index + 1}`)} of ${escapeHtml(title)}">
      <img src="${escapeHtml(preview)}" alt="" loading="lazy">
      ${item.type === 'video' ? '<span class="product-thumb-badge" aria-hidden="true">▶</span>' : ''}
    </button>`;
}

function setupGallery(product) {
  const main = document.getElementById('product-media-main');
  const thumbs = Array.from(document.querySelectorAll('#product-media-thumbs .product-thumb'));
  if (!main || !thumbs.length) return;

  // One thumbnail at a time says "this is what you are looking at"; the variant
  // handlers below call show() with their own picture, so both paths agree.
  function show(index) {
    main.innerHTML = renderMedia(mainMedia(product, index), product.title);
    thumbs.forEach((t, i) => {
      t.classList.toggle('active', i === index);
      t.setAttribute('aria-current', i === index ? 'true' : 'false');
    });
  }

  thumbs.forEach(thumb => {
    thumb.addEventListener('click', () => show(parseInt(thumb.dataset.index, 10)));
  });

  window.productGallery = { show };
  show(0);
}

/* ---------- what the store says about the product ---------- */

function renderCategory(product) {
  const parts = [];
  if (product.productType) parts.push(`<span>${escapeHtml(product.productType)}</span>`);
  for (const collection of product.collections || []) {
    parts.push(`<a href="/collections/${escapeHtml(collection.handle)}">${escapeHtml(collection.title)}</a>`);
  }
  if (!parts.length) return '';
  return `<nav class="product-category" aria-label="Category">${parts.join('<span class="product-category-sep" aria-hidden="true">·</span>')}</nav>`;
}

/** Label/value rows from the store's metafields: wig type, colour, length, density… */
function renderSpecs(specs) {
  if (!specs?.length) return '';
  return `<dl class="product-specs">
      ${specs.map(s => `<div class="product-spec"><dt>${escapeHtml(s.label)}</dt><dd>${escapeHtml(s.value)}</dd></div>`).join('')}
    </dl>`;
}

/**
 * The hair-grade explainer. Only for a store that has not described the product
 * itself: once "Hair Type" is filled in on the product, this would say the same
 * thing twice and contradict it if the two disagreed.
 */
function renderQualityNote() {
  return `<div class="hair-quality-info">
      <h3>Hair Quality Options</h3>
      <div class="quality-option">
        <span class="gold">Raw Hair (Exclusive)</span>
        <span>— Unprocessed, cuticle-aligned, longest lifespan</span>
      </div>
      <div class="quality-option">
        <span class="burgundy">Virgin Hair (Premium)</span>
        <span>— Chemically unprocessed, exceptional quality</span>
      </div>
    </div>`;
}

/** Processing time and the sizing guide: short prose blocks under the buy button. */
function renderNotes(notes) {
  if (!notes?.length) return '';
  return notes.map(note => {
    const body = `<p>${escapeHtml(note.value).replace(/\n/g, '<br>')}</p>`;
    if (note.key === 'sizing_guide') {
      // Long enough to get in the way above the button, short enough not to
      // deserve its own page — so it opens on click.
      return `<details class="product-sizing">
          <summary>${escapeHtml(note.label)}</summary>
          ${body}
        </details>`;
    }
    return `<div class="product-note">
        <h3>${escapeHtml(note.label)}</h3>
        ${body}
      </div>`;
  }).join('');
}

/* ---------- options, price, stock ---------- */

function createVariantSelector(option, variants) {
  const values = option.values || [];

  return `
    <div class="variant-option">
      <label>${escapeHtml(option.name)}</label>
      <div class="variant-buttons">
        ${values.map(value => {
    const sample = (variants || []).find(v => v.selectedOptions?.some(o => o.name === option.name && o.value === value));
    const sold = sample && sample.availableForSale === false;
    return `
          <button class="variant-button${sold ? ' sold-out' : ''}" data-option="${escapeHtml(option.name)}" data-value="${escapeHtml(value)}">
            ${escapeHtml(value)}
          </button>`;
  }).join('')}
      </div>
    </div>
  `;
}

function setupVariantSelection(product) {
  const variantButtons = document.querySelectorAll('.variant-button');
  const addToCartBtn = document.getElementById('add-to-cart');
  const soldOutBtn = document.getElementById('sold-out-btn');
  const availabilityNote = document.getElementById('product-availability-note');
  const scarcity = document.getElementById('product-scarcity');

  let selectedOptions = {};
  let selectedVariant = null;

  // Initialize with first values
  (product.options || []).forEach(option => {
    if (option.values && option.values.length > 0) {
      selectedOptions[option.name] = option.values[0];
    }
  });

  selectedVariant = findVariant(product.variants, selectedOptions);
  updateVariantButtons();
  updatePrice();
  updateAvailability();
  showVariantMedia();

  variantButtons.forEach(button => {
    button.addEventListener('click', () => {
      selectedOptions[button.dataset.option] = button.dataset.value;
      selectedVariant = findVariant(product.variants, selectedOptions);
      updateVariantButtons();
      updatePrice();
      updateAvailability();
      showVariantMedia();
    });
  });

  if (addToCartBtn) {
    addToCartBtn.addEventListener('click', async () => {
      if (!selectedVariant) {
        alert('Please select all product options before adding to cart.');
        return;
      }
      if (!isVariantAvailable(selectedVariant)) {
        goToCustomOrder(product, selectedVariant);
        return;
      }
      const qty = getQuantity();
      try {
        addToCartBtn.disabled = true;
        const originalText = addToCartBtn.textContent;
        addToCartBtn.textContent = 'Adding...';

        await window.cartManager.addToCart(selectedVariant.id, qty);

        addToCartBtn.textContent = 'Added ✓';
        addToCartBtn.classList.add('added');
        setTimeout(() => {
          addToCartBtn.textContent = originalText;
          addToCartBtn.disabled = false;
          addToCartBtn.classList.remove('added');
        }, 1800);
        openCartDrawerIfAvailable();
      } catch (error) {
        console.error('[Product] Failed to add to cart:', error);
        alert('Failed to add to cart. Please try again.');
        addToCartBtn.textContent = 'Add to Cart';
        addToCartBtn.disabled = false;
      }
    });
  }

  if (soldOutBtn) {
    soldOutBtn.addEventListener('click', () => {
      goToCustomOrder(product, selectedVariant);
    });
  }

  function updateVariantButtons() {
    variantButtons.forEach(button => {
      const optionName = button.dataset.option;
      const value = button.dataset.value;
      const isSelected = selectedOptions[optionName] === value;
      const isQualityOption = optionName.toLowerCase().includes('quality') ||
                           optionName.toLowerCase().includes('hair');

      button.classList.toggle('selected', isSelected);
      button.classList.toggle('gold', isSelected && isQualityOption && value.toLowerCase().includes('raw'));
    });
  }

  function updatePrice() {
    const display = document.getElementById('product-price-display');
    if (!display) return;
    const price = selectedVariant?.price || product.priceRange?.minVariantPrice;
    if (!price) return;
    const compare = selectedVariant?.compareAtPrice;

    display.innerHTML = `<span class="current-price">${formatPrice(price.amount, price.currencyCode)}</span>`
      + (compare && parseFloat(compare.amount) > parseFloat(price.amount)
        ? `<span class="compare-at-price">${formatPrice(compare.amount, compare.currencyCode)}</span>`
        : '');
  }

  function updateAvailability() {
    const available = isVariantAvailable(selectedVariant);
    if (addToCartBtn) addToCartBtn.style.display = available ? '' : 'none';
    if (soldOutBtn) soldOutBtn.style.display = available ? 'none' : '';
    if (availabilityNote) {
      availabilityNote.textContent = available
        ? ''
        : 'This specific option is out of stock. Request a custom order below.';
      availabilityNote.style.display = available ? 'none' : 'block';
    }
    if (scarcity) {
      const left = selectedVariant?.quantityAvailable;
      const show = available && Number.isFinite(left) && left > 0 && left <= SCARCITY_THRESHOLD;
      scarcity.textContent = show
        ? `Hurry, only ${left} ${left === 1 ? 'item' : 'items'} left in stock!`
        : '';
      scarcity.hidden = !show;
    }
  }

  function showVariantMedia() {
    if (window.productGallery) window.productGallery.show(variantMediaIndex(product, selectedVariant));
  }
}

function setupQuantityControls() {
  const decreaseBtn = document.getElementById('qty-decrease');
  const increaseBtn = document.getElementById('qty-increase');
  const input = document.getElementById('qty-input');
  if (!input) return;

  if (decreaseBtn) {
    decreaseBtn.addEventListener('click', () => {
      const v = Math.max(1, parseInt(input.value || '1', 10) - 1);
      input.value = String(v);
    });
  }
  if (increaseBtn) {
    increaseBtn.addEventListener('click', () => {
      const v = parseInt(input.value || '1', 10) + 1;
      input.value = String(v);
    });
  }
  input.addEventListener('change', () => {
    const v = Math.max(1, parseInt(input.value || '1', 10));
    input.value = String(v);
  });
}

function getQuantity() {
  const input = document.getElementById('qty-input');
  if (!input) return 1;
  return Math.max(1, parseInt(input.value || '1', 10));
}

function isVariantAvailable(variant) {
  if (!variant) return false;
  return variant.availableForSale === true;
}

function goToCustomOrder(product, variant) {
  const params = new URLSearchParams();
  params.set('productHandle', product.handle || '');
  params.set('productTitle', product.title || '');
  if (variant) {
    params.set('variantId', variant.id || '');
    params.set('variantTitle', variant.title || '');
    const price = variant.price && variant.price.amount ? variant.price.amount : '';
    const currency = variant.price && variant.price.currencyCode ? variant.price.currencyCode : '';
    if (price) params.set('price', price);
    if (currency) params.set('currency', currency);
  }
  window.location.href = '/pages/custom-order?' + params.toString();
}

function openCartDrawerIfAvailable() {
  if (typeof window.openCartDrawer === 'function') {
    window.openCartDrawer();
    return;
  }
  const drawer = document.getElementById('cart-drawer');
  if (drawer) drawer.classList.add('open');
}

function findVariant(variants, selectedOptions) {
  if (!variants) return null;

  return variants.find(variant => {
    if (!variant.selectedOptions) return false;

    return variant.selectedOptions.every(option =>
      selectedOptions[option.name] === option.value
    );
  });
}
