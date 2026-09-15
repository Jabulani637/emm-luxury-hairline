/**
 * Product Page JavaScript
 * Handles product loading, variant selection, and add to cart
 */

document.addEventListener('DOMContentLoaded', async () => {
  const productPage = document.getElementById('product-page');
  
  if (!productPage) return;

  // Get product handle from URL
  const urlParams = new URLSearchParams(window.location.search);
  const handle = urlParams.get('handle');

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

    const product = response.product;
    renderProduct(product);
  } catch (error) {
    console.error('[Product] Failed to load product:', error);
    productPage.innerHTML = '<div class="error-message"><p>Unable to load this product at this time.</p></div>';
  }
});

function renderProduct(product) {
  const productPage = document.getElementById('product-page');
  const images = product.images || [];
  const price = product.priceRange?.minVariantPrice;
  const compareAtPrice = product.variants?.[0]?.compareAtPrice;

  const imagesHtml = images.length > 0 
    ? images.map(img => `<img src="${img.url}" alt="${img.altText || product.title}" loading="lazy">`).join('')
    : '<div class="no-image">No images available</div>';

  const compareAtPriceHtml = compareAtPrice
    ? `<span class="compare-at-price">${formatPrice(compareAtPrice.amount, compareAtPrice.currencyCode)}</span>`
    : '';

  const optionsHtml = (product.options || []).map(option => 
    createVariantSelector(option, product.variants)
  ).join('');

  productPage.innerHTML = `
    <div class="product-gallery">
      ${imagesHtml}
    </div>
    <div class="product-info">
      <h1>${product.title}</h1>
      <div class="product-price" id="product-price-display">
        <span class="current-price">${formatPrice(price.amount, price.currencyCode)}</span>
        ${compareAtPriceHtml}
      </div>
      <p class="product-description">${product.description || ''}</p>
      
      <div class="hair-quality-info">
        <h3>Hair Quality Options</h3>
        <div class="quality-option">
          <span class="gold">Raw Hair (Exclusive)</span>
          <span>— Unprocessed, cuticle-aligned, longest lifespan</span>
        </div>
        <div class="quality-option">
          <span class="burgundy">Virgin Hair (Premium)</span>
          <span>— Chemically unprocessed, exceptional quality</span>
        </div>
      </div>

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
    </div>
  `;

  setupVariantSelection(product);
  setupQuantityControls();
}

function createVariantSelector(option, variants) {
  const values = option.values || [];
  
  return `
    <div class="variant-option">
      <label>${option.name}</label>
      <div class="variant-buttons">
        ${values.map(value => `
          <button class="variant-button" data-option="${option.name}" data-value="${value}">
            ${value}
          </button>
        `).join('')}
      </div>
    </div>
  `;
}

function setupVariantSelection(product) {
  const variantButtons = document.querySelectorAll('.variant-button');
  const addToCartBtn = document.getElementById('add-to-cart');
  const soldOutBtn = document.getElementById('sold-out-btn');
  const availabilityNote = document.getElementById('product-availability-note');
  
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
  updateAvailability();

  variantButtons.forEach(button => {
    button.addEventListener('click', () => {
      const optionName = button.dataset.option;
      const value = button.dataset.value;
      
      selectedOptions[optionName] = value;
      selectedVariant = findVariant(product.variants, selectedOptions);
      updateVariantButtons();
      updatePrice();
      updateAvailability();
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
    if (selectedVariant) {
      const priceEl = document.querySelector('#product-price-display .current-price');
      if (priceEl) {
        priceEl.textContent = formatPrice(
          selectedVariant.price.amount, 
          selectedVariant.price.currencyCode
        );
      }
    }
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
  window.location.href = '/pages/custom-order.html?' + params.toString();
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
