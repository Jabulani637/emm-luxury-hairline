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
      <div class="product-price">
        <span>${formatPrice(price.amount, price.currencyCode)}</span>
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

      <button class="btn btn-primary add-to-cart" id="add-to-cart">Add to Bag</button>
      
      ${!product.availableForSale ? '<p class="sold-out">This product is currently sold out.</p>' : ''}
    </div>
  `;

  // Setup variant selection logic
  setupVariantSelection(product);
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
  
  let selectedOptions = {};
  let selectedVariant = null;

  // Initialize with first values
  (product.options || []).forEach(option => {
    if (option.values && option.values.length > 0) {
      selectedOptions[option.name] = option.values[0];
    }
  });

  // Find initial variant
  selectedVariant = findVariant(product.variants, selectedOptions);
  updateVariantButtons();

  // Add click handlers
  variantButtons.forEach(button => {
    button.addEventListener('click', () => {
      const optionName = button.dataset.option;
      const value = button.dataset.value;
      
      selectedOptions[optionName] = value;
      selectedVariant = findVariant(product.variants, selectedOptions);
      updateVariantButtons();
      updatePrice();
    });
  });

  // Add to cart handler
  if (addToCartBtn) {
    addToCartBtn.addEventListener('click', async () => {
      if (!selectedVariant) {
        alert('Please select a variant');
        return;
      }

      try {
        addToCartBtn.disabled = true;
        addToCartBtn.textContent = 'Adding...';
        
        await window.cartManager.addToCart(selectedVariant.id, 1);
        
        addToCartBtn.textContent = 'Added!';
        setTimeout(() => {
          addToCartBtn.textContent = 'Add to Bag';
          addToCartBtn.disabled = false;
        }, 2000);
      } catch (error) {
        console.error('[Product] Failed to add to cart:', error);
        alert('Failed to add to cart. Please try again.');
        addToCartBtn.textContent = 'Add to Bag';
        addToCartBtn.disabled = false;
      }
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
      const priceEl = document.querySelector('.product-price span:first-child');
      if (priceEl) {
        priceEl.textContent = formatPrice(
          selectedVariant.price.amount, 
          selectedVariant.price.currencyCode
        );
      }
    }
  }
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
