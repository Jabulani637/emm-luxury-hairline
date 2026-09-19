/**
 * Shared UI helpers — loaded right after api.js on every page.
 *
 * Single source of truth for utilities that were previously copy-pasted
 * across home.js, collection.js, cart-page.js, nav.js and product.js.
 * Exposed on window so page scripts can call them as bare globals.
 */

/** Escape a value for safe interpolation into HTML text and quoted attributes. */
function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Convert Shopify's cart permalink (/cart/c/TOKEN) to the direct checkout URL
 * (/checkouts/cn/TOKEN?skip_shop_pay=true) so the browser lands on the standard
 * checkout form instead of being intercepted by Shop Pay or bounced home.
 */
function buildDirectCheckoutUrl(cartCheckoutUrl) {
  try {
    const url = new URL(cartCheckoutUrl);
    const match = url.pathname.match(/^\/cart\/c\/([^/?]+)/);
    if (match) {
      url.pathname = '/checkouts/cn/' + match[1];
    }
    url.searchParams.delete('_s');
    url.searchParams.delete('_y');
    url.searchParams.set('skip_shop_pay', 'true');
    return url.toString();
  } catch (_) {
    return cartCheckoutUrl;
  }
}

/**
 * Render a product card. Shared by the home bestsellers grid and collection
 * grids. data-* attribute values are escapeHtml'd (NOT encodeURIComponent'd):
 * dataset reads back the raw string, and percent-encoding a GID would make
 * Shopify reject it. The browser decodes HTML entities automatically.
 */
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
    ? `<img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.altText || product.title)}" loading="lazy">`
    : '<div class="no-image">No image</div>';

  const safeAttr = (val) => escapeHtml(val);

  let actionButton;
  if (!hasAnyAvailable) {
    actionButton = `<button type="button" class="btn btn-block btn-secondary card-soldout-btn"
      data-handle="${safeAttr(product.handle)}"
      data-title="${safeAttr(product.title)}"
      data-variant-id="${safeAttr(firstAvailable && firstAvailable.id ? firstAvailable.id : '')}"
      data-variant-title="${safeAttr(firstAvailable && firstAvailable.title ? firstAvailable.title : '')}"
      data-price="${safeAttr(price && price.amount ? price.amount : '')}"
      data-currency="${safeAttr(price && price.currencyCode ? price.currencyCode : '')}">Sold Out — Custom Order</button>`;
  } else if (singleVariant && firstAvailable) {
    actionButton = `<button type="button" class="btn btn-block btn-primary card-add-btn"
      data-variant-id="${safeAttr(firstAvailable.id)}"
      data-handle="${safeAttr(product.handle)}">Add to Cart</button>`;
  } else {
    actionButton = `<a href="/products/${encodeURIComponent(product.handle || '')}" class="btn btn-block btn-primary card-select-options">Select Options</a>`;
  }

  const priceHtml = price
    ? (typeof window.formatPrice === 'function'
        ? window.formatPrice(price.amount, price.currencyCode)
        : `${price.currencyCode} ${price.amount}`)
    : '';

  return `
    <div class="product-card-wrapper">
      <a href="/products/${encodeURIComponent(product.handle || '')}" class="product-card">
        <div class="product-image">
          ${imageHtml}
          ${badges.join('')}
        </div>
        <div class="product-info">
          <h3 class="product-title">${escapeHtml(product.title)}</h3>
          <p class="product-price">${priceHtml}</p>
          <p class="product-availability">${availabilityBadge}</p>
        </div>
      </a>
      <div class="product-card-actions">
        ${actionButton}
      </div>
    </div>
  `;
}

/**
 * Reads the handle this page is about.
 *
 * Clean URLs carry it in the path (/products/blue-blonde-wig); the older
 * ?handle= form is still honoured so nothing that links here breaks.
 */
function handleFromLocation(kind) {
  const fromPath = window.location.pathname.match(new RegExp('^/' + kind + '/([^/]+)'));
  if (fromPath) {
    try { return decodeURIComponent(fromPath[1]); } catch (e) { return fromPath[1]; }
  }
  return new URLSearchParams(window.location.search).get('handle') || '';
}

window.escapeHtml = escapeHtml;
window.buildDirectCheckoutUrl = buildDirectCheckoutUrl;
window.createProductCard = createProductCard;
window.handleFromLocation = handleFromLocation;
