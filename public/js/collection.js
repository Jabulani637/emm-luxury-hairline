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
