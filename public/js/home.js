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

  const badge = isNew ? '<span class="product-badge gold">NEW</span>' : 
                 isBestseller ? '<span class="product-badge burgundy">BESTSELLER</span>' : '';

  const imageHtml = image 
    ? `<img src="${image.url}" alt="${image.altText || product.title}" loading="lazy">`
    : '<div class="no-image">No image</div>';

  return `
    <a href="/products/product.html?handle=${product.handle}" class="product-card">
      <div class="product-image">
        ${imageHtml}
        ${badge}
      </div>
      <div class="product-info">
        <h3 class="product-title">${product.title}</h3>
        <p class="product-price">${formatPrice(price.amount, price.currencyCode)}</p>
        <p class="product-availability">Raw & Virgin options available</p>
      </div>
    </a>
  `;
}
