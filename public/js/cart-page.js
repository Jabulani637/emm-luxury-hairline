/**
 * Cart Page JavaScript
 * Handles cart page rendering and operations including shipping estimate
 */

let COUNTRIES_DATA = null;

document.addEventListener('DOMContentLoaded', () => {
  const cartItemsSection = document.getElementById('cart-items-section');
  
  if (!cartItemsSection) return;

  initShippingEstimate();
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

function populateCountries(countrySelect) {
  if (!COUNTRIES_DATA || !COUNTRIES_DATA.countries) return;

  const countries = COUNTRIES_DATA.countries
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));

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
      opt.setAttribute('data-name', p.name);
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
  const provinceName = provinceCode
    ? (provinceSelect.options[provinceSelect.selectedIndex]?.getAttribute('data-name') || provinceCode)
    : '';
  const zip = (zipInput?.value || '').trim();

  errorBox.style.display = 'none';
  ratesBox.style.display = 'none';
  ratesList.innerHTML = '';

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
      address.province = provinceName || provinceCode;
    }

    const rates = await window.cartManager.estimateShipping(address);
    renderShippingRates(rates);
  } catch (error) {
    console.error('[Cart] Shipping estimate error:', error);
    showShippingError(error.message || 'Failed to calculate shipping rates. Please try again.');
  } finally {
    calculateBtn.disabled = false;
    calculateBtn.textContent = originalText;
  }
}

function renderShippingRates(rates) {
  const ratesBox = document.getElementById('shipping-rates');
  const ratesList = document.getElementById('shipping-rates-list');
  const ratesTitle = document.getElementById('shipping-rates-title');
  const cartShippingEl = document.getElementById('cart-shipping');

  ratesList.innerHTML = '';

  if (!rates || rates.length === 0) {
    ratesTitle.textContent = 'No shipping rates available for this address.';
    ratesBox.style.display = 'block';
    if (cartShippingEl) cartShippingEl.textContent = '—';
    return;
  }

  if (rates.length === 1) {
    ratesTitle.textContent = 'There is one shipping rate for your address:';
  } else {
    ratesTitle.textContent = `There are ${rates.length} shipping rates for your address — select one:`;
  }

  for (const rate of rates) {
    const currencyCode = (rate.cost && rate.cost.currencyCode) || 'USD';
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

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
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
    const image = merchandise?.image || product?.images?.[0];

    return `
      <div class="cart-item">
        <div class="cart-item-image">
          ${image ? `<img src="${image.url}" alt="${image.altText || merchandise.title}">` : '<div class="no-image">No image</div>'}
        </div>
        <div class="cart-item-details">
          <p class="cart-item-title">${product?.title || 'Product'}</p>
          <p class="cart-item-variant">${merchandise?.title || ''}</p>
          <p class="cart-item-price">${formatPrice(merchandise?.price?.amount || 0, merchandise?.price?.currencyCode || 'USD')}</p>
          <div class="cart-item-quantity">
            <button class="quantity-decrease" data-line-id="${lineItem.id}">−</button>
            <span>${lineItem.quantity}</span>
            <button class="quantity-increase" data-line-id="${lineItem.id}">+</button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  cartItemsSection.innerHTML = itemsHtml;

  refreshTotalsDisplay();
  setupQuantityHandlers();
  setupCheckoutButton();

  const currentRates = window.cartManager.getShippingRates();
  if (currentRates && currentRates.length > 0) {
    renderShippingRates(currentRates);
  }
}

function refreshTotalsDisplay() {
  const cartSubtotalEl = document.getElementById('cart-subtotal');
  const cartShippingEl = document.getElementById('cart-shipping');
  const cartTotalEl = document.getElementById('cart-total');

  const cart = window.cartManager.getCart();
  if (!cart) {
    if (cartSubtotalEl) cartSubtotalEl.textContent = window.formatPrice(0, 'USD');
    if (cartShippingEl) cartShippingEl.textContent = 'Calculated at checkout';
    if (cartTotalEl) cartTotalEl.textContent = window.formatPrice(0, 'USD');
    return;
  }

  const subtotalAmount = (cart.cost && cart.cost.subtotalAmount) ? cart.cost.subtotalAmount : null;
  const subtotal = subtotalAmount ? { amount: subtotalAmount.amount, currencyCode: subtotalAmount.currencyCode } : { amount: window.cartManager.getTotal(), currencyCode: window.cartManager.getCurrency() };

  if (cartSubtotalEl) {
    cartSubtotalEl.textContent = window.formatPrice(parseFloat(subtotal.amount || 0), subtotal.currencyCode);
  }

  const shipping = window.cartManager.getShippingAmount();
  if (cartShippingEl) {
    if (parseFloat(shipping.amount) > 0) {
      cartShippingEl.textContent = window.formatPrice(parseFloat(shipping.amount), shipping.currencyCode);
    } else {
      cartShippingEl.textContent = 'Calculated at checkout';
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

  checkoutBtn.addEventListener('click', () => {
    const checkoutUrl = window.cartManager.getCheckoutUrl();
    if (checkoutUrl) {
      window.location.href = checkoutUrl;
    } else {
      alert('Your cart is empty');
    }
  });
}

function setupQuantityHandlers() {
  const decreaseButtons = document.querySelectorAll('.quantity-decrease');
  const increaseButtons = document.querySelectorAll('.quantity-increase');

  decreaseButtons.forEach(button => {
    button.addEventListener('click', async () => {
      const lineId = button.dataset.lineId;
      const currentQuantity = parseInt(button.nextElementSibling.textContent);
      
      if (currentQuantity > 1) {
        try {
          await window.cartManager.updateQuantity(lineId, currentQuantity - 1);
        } catch (error) {
          console.error('[Cart] Failed to update quantity:', error);
          alert('Failed to update quantity');
        }
      }
    });
  });

  increaseButtons.forEach(button => {
    button.addEventListener('click', async () => {
      const lineId = button.dataset.lineId;
      const currentQuantity = parseInt(button.previousElementSibling.textContent);
      
      try {
        await window.cartManager.updateQuantity(lineId, currentQuantity + 1);
      } catch (error) {
        console.error('[Cart] Failed to update quantity:', error);
        alert('Failed to update quantity');
      }
    });
  });
}
