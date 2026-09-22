/**
 * Cart Page JavaScript
 * Handles cart page rendering and operations including shipping estimate
 */

let COUNTRIES_DATA = null;

document.addEventListener('DOMContentLoaded', () => {
  const cartItemsSection = document.getElementById('cart-items-section');
  
  if (!cartItemsSection) return;

  initShippingEstimate();
  initCartPageQuantityHandlers(); // attach once — delegated, survives re-renders
  renderCartPage();

  window.cartManager.subscribe(renderCartPage);
});

async function initShippingEstimate() {
  const countrySelect = document.getElementById('shipping-country');
  const provinceSelect = document.getElementById('shipping-province');
  const calculateBtn = document.getElementById('calculate-shipping');

  if (!countrySelect) return;

  try {
    COUNTRIES_DATA = await window.countriesAPI.getCountries();
    populateCountries(countrySelect);
  } catch (error) {
    console.error('[Cart] Failed to load countries:', error);
  }

  countrySelect.addEventListener('change', () => {
    const countryCode = countrySelect.value;
    updateProvinces(countrySelect, provinceSelect);
  });

  if (calculateBtn) {
    calculateBtn.addEventListener('click', onCalculateShipping);
  }
}

// Shopify's buyer-country list currently omits the store's own country, so a UK
// shopper could not price delivery to the UK. Naming the home market here is
// harmless once Shopify lists it again — the map below keys on the code, so the
// real entry simply wins.
const HOME_MARKET = { code: 'GB', name: 'United Kingdom' };

function populateCountries(countrySelect) {
  if (!COUNTRIES_DATA || !COUNTRIES_DATA.countries) return;

  const byCode = new Map([[HOME_MARKET.code, HOME_MARKET]]);
  for (const c of COUNTRIES_DATA.countries) {
    if (c && c.code) byCode.set(c.code, c);
  }

  const countries = [...byCode.values()].sort((a, b) => a.name.localeCompare(b.name));

  const currentValue = countrySelect.value;
  countrySelect.innerHTML = '<option value="">Select country</option>';

  for (const c of countries) {
    const opt = document.createElement('option');
    opt.value = c.code;
    opt.textContent = c.name;
    countrySelect.appendChild(opt);
  }

  if (currentValue) countrySelect.value = currentValue;
}

function updateProvinces(countrySelect, provinceSelect) {
  const countryCode = countrySelect.value;

  if (!COUNTRIES_DATA || !COUNTRIES_DATA.countries || !provinceSelect) return;

  const country = COUNTRIES_DATA.countries.find(c => c.code === countryCode);
  provinceSelect.innerHTML = '<option value="">Select province</option>';

  if (country && country.provinces && country.provinces.length > 0) {
    const provinces = country.provinces.slice().sort((a, b) => a.name.localeCompare(b.name));
    for (const p of provinces) {
      const opt = document.createElement('option');
      opt.value = p.code;
      opt.textContent = p.name;
      provinceSelect.appendChild(opt);
    }
    provinceSelect.disabled = false;
  } else {
    provinceSelect.disabled = true;
  }
}

async function onCalculateShipping(e) {
  if (e) e.preventDefault();

  const countrySelect = document.getElementById('shipping-country');
  const provinceSelect = document.getElementById('shipping-province');
  const zipInput = document.getElementById('shipping-zip');
  const ratesBox = document.getElementById('shipping-rates');
  const ratesList = document.getElementById('shipping-rates-list');
  const errorBox = document.getElementById('shipping-error');
  const calculateBtn = document.getElementById('calculate-shipping');

  const countryCode = countrySelect.value;
  const provinceCode = provinceSelect.value;
  const zip = (zipInput?.value || '').trim();

  errorBox.style.display = 'none';
  ratesBox.style.display = 'none';
  ratesList.innerHTML = '';
  hideShippingEstimate();

  if (!countryCode) {
    showShippingError('Please select a country.');
    return;
  }

  const cart = window.cartManager.getCart();
  if (!cart) {
    showShippingError('Your cart is empty. Add items first.');
    return;
  }

  calculateBtn.disabled = true;
  const originalText = calculateBtn.textContent;
  calculateBtn.textContent = 'Calculating...';

  try {
    const address = {
      country: countryCode,
      zip: zip,
    };
    if (provinceCode) {
      address.province = provinceCode;
    }

    const rates = await window.cartManager.estimateShipping(address);
    // Shopify's own quote always wins where it exists: that is the money the
    // shopper will actually be charged. The published table is what they see
    // when the shop has no delivery option for the address at all.
    if (rates.length > 0) {
      renderShippingRates(rates);
    } else {
      await showPublishedEstimate(countryCode);
    }
  } catch (error) {
    console.error('[Cart] Shipping estimate error:', error);
    showShippingError(error.message || 'Failed to calculate shipping rates. Please try again.');
  } finally {
    calculateBtn.disabled = false;
    calculateBtn.textContent = originalText;
  }
}

function hideShippingEstimate() {
  const box = document.getElementById('shipping-estimate');
  if (box) box.style.display = 'none';
}

async function showPublishedEstimate(countryCode) {
  try {
    const quote = await window.shippingAPI.getQuote(countryCode);
    renderShippingEstimate(quote, countryNameFor(countryCode));
  } catch (error) {
    // Nothing published to show either, so say the true thing rather than
    // leaving the shopper staring at a button that did nothing.
    console.error('[Cart] Published shipping rate unavailable:', error);
    renderShippingRates([]);
  }
}

function countryNameFor(code) {
  const countries = (COUNTRIES_DATA && COUNTRIES_DATA.countries) || [];
  const found = countries.find(c => c.code === code);
  if (found) return found.name;
  return code === HOME_MARKET.code ? HOME_MARKET.name : code;
}

function renderShippingEstimate(quote, countryName) {
  const box = document.getElementById('shipping-estimate');
  const list = document.getElementById('shipping-estimate-list');
  const title = document.getElementById('shipping-estimate-title');
  const note = document.getElementById('shipping-estimate-note');
  if (!box || !list) return;

  list.innerHTML = '';

  for (const option of quote.options || []) {
    const li = document.createElement('li');
    li.className = 'shipping-estimate-item';

    const info = document.createElement('span');
    info.className = 'rate-info';
    const name = document.createElement('strong');
    name.textContent = option.title;
    info.appendChild(name);
    if (option.eta) {
      const eta = document.createElement('p');
      eta.className = 'rate-desc';
      eta.textContent = option.eta;
      info.appendChild(eta);
    }

    const cost = document.createElement('span');
    cost.className = 'rate-cost';
    cost.textContent = option.free
      ? 'Free'
      : window.formatPrice(parseFloat(option.cost.amount), option.cost.currencyCode);

    li.appendChild(info);
    li.appendChild(cost);
    list.appendChild(li);
  }

  title.textContent = quote.zone === countryName
    ? `Delivery to ${countryName}`
    : `Delivery to ${countryName} — ${quote.zone}`;
  note.textContent = 'Our published price for this destination. The exact amount '
    + 'is confirmed at checkout.';
  box.style.display = 'block';
}

function renderShippingRates(rates) {
  const ratesBox = document.getElementById('shipping-rates');
  const ratesList = document.getElementById('shipping-rates-list');
  const ratesTitle = document.getElementById('shipping-rates-title');

  ratesList.innerHTML = '';

  if (!rates || rates.length === 0) {
    ratesTitle.textContent = 'No shipping rates available for this address.';
    ratesBox.style.display = 'block';
    refreshTotalsDisplay();
    return;
  }

  if (rates.length === 1) {
    ratesTitle.textContent = 'There is one shipping rate for your address:';
  } else {
    ratesTitle.textContent = `There are ${rates.length} shipping rates for your address — select one:`;
  }

  for (const rate of rates) {
    const currencyCode = (rate.cost && rate.cost.currencyCode) || 'GBP';
    const amount = rate.cost ? parseFloat(rate.cost.amount) : 0;

    const li = document.createElement('li');
    li.className = 'shipping-rate-item' + (rate.selected ? ' selected' : '');

    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'shipping-rate';
    input.className = 'shipping-rate-radio';
    input.value = rate.handle;
    input.id = 'rate-' + rate.handle;
    input.setAttribute('data-group-id', rate.deliveryGroupId || '');
    input.setAttribute('aria-label', rate.title + ' ' + window.formatPrice(amount, currencyCode));
    if (rate.selected) input.checked = true;

    const label = document.createElement('label');
    label.htmlFor = input.id;
    label.className = 'shipping-rate-label';

    const titleBlock = document.createElement('span');
    titleBlock.className = 'rate-info';
    const titleEl = document.createElement('strong');
    titleEl.textContent = rate.title;
    titleBlock.appendChild(titleEl);
    if (rate.description) {
      const descEl = document.createElement('p');
      descEl.className = 'rate-desc';
      descEl.textContent = rate.description;
      titleBlock.appendChild(descEl);
    }

    const costEl = document.createElement('span');
    costEl.className = 'rate-cost';
    costEl.textContent = window.formatPrice(amount, currencyCode);

    label.appendChild(input);
    label.appendChild(titleBlock);
    label.appendChild(costEl);
    li.appendChild(label);

    input.addEventListener('change', () => onShippingRateSelected(rate.handle, rate.deliveryGroupId));
    ratesList.appendChild(li);
  }

  ratesBox.style.display = 'block';
  refreshTotalsDisplay();
}

async function onShippingRateSelected(handle, deliveryGroupId) {
  const errorBox = document.getElementById('shipping-error');
  if (errorBox) errorBox.style.display = 'none';

  try {
    await window.cartManager.selectShippingRate(handle, deliveryGroupId);
    const rates = window.cartManager.getShippingRates();
    renderShippingRates(rates);
  } catch (error) {
    console.error('[Cart] Failed to select shipping rate:', error);
    showShippingError(error.message || 'Failed to select this shipping rate. Please try again.');
  }
}

function showShippingError(message) {
  const errorBox = document.getElementById('shipping-error');
  if (!errorBox) return;
  errorBox.textContent = message;
  errorBox.style.display = 'block';
}


function renderCartPage() {
  const cartItemsSection = document.getElementById('cart-items-section');
  
  const cart = window.cartManager.getCart();

  if (!cart || !cart.lines || cart.lines.edges.length === 0) {
    cartItemsSection.innerHTML = `
      <div class="empty-cart">
        <p>Your bag is empty</p>
        <a href="/" class="btn btn-primary">Continue Shopping</a>
      </div>
    `;
    refreshTotalsDisplay();
    return;
  }

  const itemsHtml = cart.lines.edges.map(line => {
    const lineItem = line.node;
    const merchandise = lineItem.merchandise;
    const product = merchandise?.product;
    // Image nested in GraphQL edges: product.images.edges[0].node
    const image = merchandise?.image
      || product?.images?.edges?.[0]?.node
      || product?.images?.[0]
      || null;
    const safeId = encodeURIComponent(lineItem.id);

    return `
      <div class="cart-item">
        <div class="cart-item-image">
          ${image ? `<img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.altText || merchandise.title || '')}">` : '<div class="no-image">No image</div>'}
        </div>
        <div class="cart-item-details">
          <p class="cart-item-title">${escapeHtml(product?.title || 'Product')}</p>
          <p class="cart-item-variant">${escapeHtml(merchandise?.title || '')}</p>
          <p class="cart-item-price">${formatPrice(merchandise?.price?.amount || 0, merchandise?.price?.currencyCode || 'GBP')}</p>
          <div class="cart-item-quantity">
            <button class="quantity-decrease" data-line-id="${safeId}" data-qty="${lineItem.quantity}">−</button>
            <span>${lineItem.quantity}</span>
            <button class="quantity-increase" data-line-id="${safeId}" data-qty="${lineItem.quantity}">+</button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  cartItemsSection.innerHTML = itemsHtml;

  refreshTotalsDisplay();
  setupCheckoutButton();

  const currentRates = window.cartManager.getShippingRates();
  if (currentRates && currentRates.length > 0) {
    renderShippingRates(currentRates);
  }
}

// ONE delegated listener on the cart items section — survives re-renders,
// never stacks up, only handles the item that was clicked.
let cartPageQtyHandlerAttached = false;
function initCartPageQuantityHandlers() {
  const section = document.getElementById('cart-items-section');
  if (!section || cartPageQtyHandlerAttached) return;
  cartPageQtyHandlerAttached = true;

  section.addEventListener('click', async (e) => {
    const btn = e.target.closest('.quantity-decrease, .quantity-increase');
    if (!btn) return;

    const lineId = decodeURIComponent(btn.dataset.lineId || '');
    if (!lineId) return;

    const currentQty = parseInt(btn.dataset.qty, 10) || 1;
    const isDecrease = btn.classList.contains('quantity-decrease');
    // Reaching 0 is deliberate: Shopify removes the line, and at a quantity of
    // one "−" is the only way to take the item out of the bag.
    const newQty = isDecrease ? currentQty - 1 : currentQty + 1;

    // Disable both steppers for this item while updating
    const wrapper = btn.closest('.cart-item-quantity');
    if (wrapper) wrapper.querySelectorAll('button').forEach(b => { b.disabled = true; });

    try {
      await window.cartManager.updateQuantity(lineId, newQty);
      // cartManager.subscribe → renderCartPage will re-render automatically
    } catch (err) {
      console.error('[CartPage] Failed to update quantity:', err);
      alert('Failed to update quantity. Please try again.');
      if (wrapper) wrapper.querySelectorAll('button').forEach(b => { b.disabled = false; });
    }
  });
}

function refreshTotalsDisplay() {
  const cartSubtotalEl = document.getElementById('cart-subtotal');
  const cartShippingEl = document.getElementById('cart-shipping');
  const cartTotalEl = document.getElementById('cart-total');

  const cart = window.cartManager.getCart();
  if (!cart) {
    if (cartSubtotalEl) cartSubtotalEl.textContent = window.formatPrice(0, 'GBP');
    if (cartShippingEl) cartShippingEl.textContent = 'Calculated at checkout';
    if (cartTotalEl) cartTotalEl.textContent = window.formatPrice(0, 'GBP');
    return;
  }

  const subtotal = window.cartManager.getSubtotal();
  if (cartSubtotalEl) {
    cartSubtotalEl.textContent = window.formatPrice(parseFloat(subtotal.amount || 0), subtotal.currencyCode);
  }

  const shipping = window.cartManager.getShippingAmount();
  if (cartShippingEl) {
    if (!shipping) {
      cartShippingEl.textContent = 'Calculated at checkout';
    } else if (parseFloat(shipping.amount) === 0) {
      cartShippingEl.textContent = 'Free';
    } else {
      cartShippingEl.textContent = window.formatPrice(parseFloat(shipping.amount), shipping.currencyCode);
    }
  }

  const grand = window.cartManager.getGrandTotal();
  if (cartTotalEl) {
    cartTotalEl.textContent = window.formatPrice(parseFloat(grand.amount || 0), grand.currencyCode);
  }
}


let checkoutButtonAttached = false;
function setupCheckoutButton() {
  if (checkoutButtonAttached) return;
  const checkoutBtn = document.querySelector('.checkout-btn');
  if (!checkoutBtn) return;
  checkoutButtonAttached = true;

  checkoutBtn.addEventListener('click', async () => {
    const originalText = checkoutBtn.textContent;
    checkoutBtn.disabled = true;
    checkoutBtn.textContent = 'Redirecting…';

    let checkout = null;
    try {
      checkout = await window.cartManager.beginCheckout();
    } catch (err) {
      console.warn('[Cart] Could not open checkout:', err.message);
    }

    if (!checkout || !checkout.ok) {
      const cleared = {
        empty: 'Your bag is empty — that item is no longer available to order.',
        unavailable: 'That item is no longer available to order.',
      };
      const message = cleared[checkout && checkout.reason] ||
        'We could not open your checkout. Please try again.';
      if (cleared[checkout && checkout.reason]) window.cartManager.clearCart();
      checkoutBtn.disabled = false;
      checkoutBtn.textContent = originalText;
      alert(message);
      return;
    }

    // This is Shopify's own permalink, minted a moment ago by the same call
    // that lifted the country lock. Anything older sends the shopper to the
    // store home instead of the payment page.
    window.location.href = checkout.checkoutUrl;
  });
}


