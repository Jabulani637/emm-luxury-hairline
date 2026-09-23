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

/* ── Local-currency prices ────────────────────────────────────────────── */

/**
 * Two modes off one country-to-currency map.
 *
 * Chosen — the header picker names a country whose money is not sterling, so
 * every standalone price on the page is *replaced* by its equivalent. Someone
 * who has just told the store where they live expects to read their own
 * figures, and a second line under each price is a poor answer to that.
 *
 * Inferred — nobody chose anything, but the browser reports a non-GBP region.
 * Then the pound figure stays the headline and a smaller ≈ line goes under it,
 * which is as much as an unasked-for guess about someone's money can fairly
 * claim to be.
 *
 * In both modes the store charges in pounds, and Shopify's own checkout says so
 * once the basket arrives there. Four rules keep that honest:
 *   - Converted figures round to whole units. An indicative number that quotes
 *     cents is pretending to a precision it does not have.
 *   - A replaced price names the real pound amount in its title, so the figure
 *     can be checked without clicking anything.
 *   - One line at the top of the page states the currency and the charge. A
 *     shopper who picked R should not have to hunt for why £ appears at
 *     checkout.
 *   - Anything missing — no region, no rate for it, a failed call — means no
 *     hint appears and no price changes. Silence is not a failure state here.
 */

// ISO region → the currency priced there. Only places this store ships to; a
// region that is not listed earns neither a hint nor a conversion.
const REGION_CURRENCY = {
  IE: 'EUR', DE: 'EUR', FR: 'EUR', NL: 'EUR', BE: 'EUR', AT: 'EUR', IT: 'EUR',
  ES: 'EUR', PT: 'EUR', FI: 'EUR', GR: 'EUR', LU: 'EUR', MT: 'EUR', CY: 'EUR',
  SE: 'SEK', NO: 'NOK', DK: 'DKK', IS: 'ISK', PL: 'PLN', CZ: 'CZK', RO: 'RON',
  HU: 'HUF', HR: 'HRK', BG: 'BGN', CH: 'CHF', GB: 'GBP',
  US: 'USD', CA: 'CAD', MX: 'MXN',
  AU: 'AUD', NZ: 'NZD', FJ: 'FJD',
  ZA: 'ZAR', NG: 'NGN', KE: 'KES', GH: 'GHS', TZ: 'TZS', UG: 'UGX', ZM: 'ZMW',
  ZW: 'USD', CM: 'XAF', CI: 'XOF', SN: 'XOF', ML: 'XOF', BF: 'XOF', MA: 'MAD',
  EG: 'EGP', ET: 'ETB', RW: 'RWF', MZ: 'MZN', NA: 'NAD', BW: 'BWP', TN: 'TND',
  AE: 'AED', SA: 'SAR', QA: 'QAR', KW: 'KWD', BH: 'BHD', OM: 'OMR', JO: 'JOD',
  TR: 'TRY', IL: 'ILS',
  IN: 'INR', PK: 'PKR', BD: 'BDT', LK: 'LKR', NP: 'NPR',
  CN: 'CNY', JP: 'JPY', KR: 'KRW', SG: 'SGD', MY: 'MYR', ID: 'IDR', TH: 'THB',
  PH: 'PHP', VN: 'VND', HK: 'HKD', TW: 'TWD',
  BR: 'BRL', AR: 'ARS', CL: 'CLP', CO: 'COP', PE: 'PEN', UY: 'UYU',
};

// Elements that hold nothing but a price. Anything with children is skipped, so
// listing a container here is harmless.
const PRICE_SELECTOR = [
  '.product-price',
  '.current-price',
  '.compare-at-price',
  '.cart-item-price',
  '.search-result-price',
  '.summary-price',
  '.rate-cost',
  '#cart-subtotal',
  '#cart-shipping',
  '#cart-total',
].join(', ');

const GBP_AMOUNT = /^£\s*([\d,]+(?:\.\d{1,2})?)$/;

/** The money shoppers in this country read, or null when it is sterling. */
function currencyForCountry(code) {
  const currency = REGION_CURRENCY[(code || '').toUpperCase()];
  return currency && currency !== 'GBP' ? currency : null;
}

/** What the header picker was told, as opposed to what the browser implies. */
function displayCurrency() {
  const market = window.emmMarket;
  return market ? currencyForCountry(market.getCountry()) : null;
}

const visitorCurrency = (function () {
  const tags = (navigator.languages && navigator.languages.length)
    ? navigator.languages
    : [navigator.language || ''];

  for (const tag of tags) {
    const code = currencyForCountry(tag.split('-')[1] || '');
    if (code) return code;
  }
  return null;
})();

let localRates = null;

function formatIn(amount, currency) {
  try {
    return new Intl.NumberFormat(navigator.language || 'en', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
    }).format(amount);
  } catch (error) {
    return null; // a currency this browser cannot name
  }
}

function converted(gbpAmount, currency) {
  const rate = localRates && localRates[currency];
  return rate ? formatIn(gbpAmount * rate, currency) : null;
}

function addNoteAfter(node) {
  if (document.querySelector('.price-approx-note')) return;

  const note = document.createElement('p');
  note.className = 'price-approx-note';
  note.textContent = 'You are charged in British pounds (GBP). The '
    + '\u2248' + ' figures are today\u2019s rate for guidance only, not a quote.';

  // Both rows are flex containers; inserting inside one would make the note a
  // third item on the line rather than a line of its own.
  const row = node.closest('.summary-row, .cart-total') || node;
  row.insertAdjacentElement('afterend', note);
}

/**
 * One line under the header rather than one per price: in chosen mode every
 * figure on the page carries the same caveat, and repeating it nine times in a
 * product grid reads as noise instead of as disclosure.
 */
function showCurrencyNotice(currency) {
  if (document.querySelector('.currency-notice')) return;

  const notice = document.createElement('p');
  notice.className = 'currency-notice';
  notice.textContent = 'Prices shown in ' + currency
    + ' at today\u2019s exchange rate. Your order is charged in British pounds (GBP).';

  const header = document.getElementById('main-header');
  if (header) {
    header.insertAdjacentElement('afterend', notice);
  } else {
    document.body.insertBefore(notice, document.body.firstChild);
  }
}

/**
 * Prices are rewritten where they are read, not where they are built: the same
 * three characters after a £ mean the same here whether a template, an API
 * render or the cart drawer put them on the page.
 *
 * The rewrite goes inside the price element in hint mode because a nested block
 * always lands under its own number, whereas a sibling would be dropped into
 * whatever flex row the price happens to sit in.
 */
function decoratePrices(root) {
  const chosen = displayCurrency();
  const target = chosen || visitorCurrency;
  if (!target || !localRates) return;

  const scope = root || document;
  const targets = scope.querySelectorAll ? scope.querySelectorAll(PRICE_SELECTOR) : [];
  let touched = 0;

  for (const el of targets) {
    // A price that already carries a hint has a child, so this one check both
    // finds leaf elements and keeps re-decoration idempotent. A converted price
    // needs no such guard: its text no longer starts with a £, so it never
    // matches twice.
    if (el.firstElementChild) continue;

    const match = GBP_AMOUNT.exec(el.textContent.trim());
    if (!match) continue;

    const amount = parseFloat(match[1].replace(/,/g, ''));
    // A zero total still has to convert, or a page reading one currency shows
    // two. A zero does not earn a ≈ line, which is only ever a rounding of more
    // than nothing.
    if (!amount && !chosen) continue;

    const figure = converted(amount, target);
    if (!figure) continue;

    if (chosen) {
      el.textContent = figure;
      el.title = 'Charged as ' + match[0] + ' in GBP at checkout.';
    } else {
      const hint = document.createElement('span');
      hint.className = 'price-approx';
      hint.textContent = '\u2248 ' + figure;
      hint.title = 'About ' + figure + ' at today\u2019s exchange rate. '
        + 'The price shown in \u00a3 is what you pay.';
      el.appendChild(hint);

      if (el.id === 'cart-total') addNoteAfter(el);
    }
    touched++;
  }

  if (chosen && touched) showCurrencyNotice(chosen);
}

function startLocalCurrencyPrices() {
  if (!displayCurrency() && !visitorCurrency) return;
  if (typeof window.ratesAPI === 'undefined') return;

  decoratePrices(document);

  window.ratesAPI.getRates()
    .then(response => {
      if (!response || !response.rates) return;
      localRates = response.rates;
      decoratePrices(document);

      // Prices are rendered after this point by the page scripts and by the
      // cart drawer, so watch for them instead of asking each renderer to
      // remember to call in. Appending a hint is itself a mutation, which is
      // why decoratePrices skips elements that already have one.
      let queued = false;
      new MutationObserver(() => {
        if (queued) return;
        queued = true;
        setTimeout(() => {
          queued = false;
          decoratePrices(document);
        }, 0);
      }).observe(document.body, { childList: true, subtree: true });
    })
    .catch(() => {});
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startLocalCurrencyPrices);
} else {
  startLocalCurrencyPrices();
}

window.escapeHtml = escapeHtml;
window.createProductCard = createProductCard;
window.handleFromLocation = handleFromLocation;
// market.js names the money on each picker option, and one copy of that map is
// the difference between the label and the price agreeing forever.
window.emmCurrency = { currencyForCountry };
