/**
 * Custom Order / Contact Page JavaScript
 * Handles:
 *  1. Reading product info from query params (passed by Sold Out buttons)
 *  2. Populating the country selector (via countries API)
 *  3. Submitting the form to /api/custom-orders
 */

document.addEventListener('DOMContentLoaded', async () => {
  const summaryBox = document.getElementById('summary-product');
  const form = document.getElementById('custom-order-form');
  const submitBtn = document.getElementById('submit-order-btn');
  const statusEl = document.getElementById('form-status');
  const countrySelect = document.getElementById('f-country');

  // 1. Parse product info from URL query params
  const params = new URLSearchParams(window.location.search);
  const prefill = {
    productHandle: params.get('productHandle') || '',
    productTitle: params.get('productTitle') || '',
    variantId: params.get('variantId') || '',
    variantTitle: params.get('variantTitle') || '',
    price: params.get('price') || '',
    currency: params.get('currency') || '',
  };

  // 2. Pre-fill hidden inputs
  const byId = (id) => document.getElementById(id);
  if (prefill.productHandle) byId('f-product-handle').value = prefill.productHandle;
  if (prefill.productTitle) byId('f-product-title').value = prefill.productTitle;
  if (prefill.variantId) byId('f-variant-id').value = prefill.variantId;
  if (prefill.variantTitle) byId('f-variant-title').value = prefill.variantTitle;
  if (prefill.price) byId('f-price').value = prefill.price;
  if (prefill.currency) byId('f-currency').value = prefill.currency;

  // 3. Render requested product summary panel
  if (summaryBox) {
    if (prefill.productTitle) {
      const currency = prefill.currency || 'GBP';
      const amount = prefill.price ? parseFloat(prefill.price) : null;
      let priceHtml = '';
      if (amount !== null && !isNaN(amount) && typeof window.formatPrice === 'function') {
        priceHtml = `<p class="summary-price">${window.formatPrice(amount, currency)}</p>`;
      }
      summaryBox.innerHTML = `
        <div class="requested-product">
          <h3 class="requested-title">${escapeHtml(prefill.productTitle)}</h3>
          ${prefill.variantTitle ? `<p class="requested-variant">${escapeHtml(prefill.variantTitle)}</p>` : ''}
          ${priceHtml}
          <p class="requested-status"><span class="product-badge product-badge--soldout">SOLD OUT</span></p>
          <p class="requested-note">This specific variant is currently out of stock. Complete the form so we can source or custom-make it for you.</p>
          ${prefill.productHandle ? `<a class="requested-link" href="/products/${encodeURIComponent(prefill.productHandle)}">View product page →</a>` : ''}
        </div>
      `;
      if (byId('f-desired-style')) byId('f-desired-style').placeholder = prefill.productTitle;
    } else {
      summaryBox.innerHTML = `
        <div class="requested-product">
          <h3 class="requested-title">General Enquiry</h3>
          <p class="requested-note">Tell us what you're looking for — a specific style, length, color, or budget. We'll get back to you with options within 24 hours.</p>
        </div>
      `;
    }
  }

  // 4. Populate country dropdown via API
  if (countrySelect) {
    try {
      const data = await window.countriesAPI.getCountries();
      const countries = (data && data.countries) || [];
      countries
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach(c => {
          const opt = document.createElement('option');
          opt.value = c.code;
          opt.textContent = c.name;
          countrySelect.appendChild(opt);
        });
    } catch (err) {
      console.warn('[CustomOrder] Failed to load countries list:', err);
    }
  }

  // 5. Handle form submit
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearStatus();

      const payload = {
        name: sanitize(byId('f-name').value, 120),
        email: sanitize(byId('f-email').value, 160),
        phone: sanitize(byId('f-phone').value, 60),
        country: countrySelect ? countrySelect.value : '',
        productHandle: sanitize(byId('f-product-handle').value, 160),
        productTitle: sanitize(byId('f-product-title').value, 200),
        variantId: sanitize(byId('f-variant-id').value, 200),
        variantTitle: sanitize(byId('f-variant-title').value, 200),
        price: sanitize(byId('f-price').value, 40),
        currency: sanitize(byId('f-currency').value, 8),
        quantity: Math.max(1, parseInt(byId('f-quantity').value || '1', 10) || 1),
        desiredStyle: byId('f-desired-style') ? sanitize(byId('f-desired-style').value, 200) : '',
        length: byId('f-length') ? sanitize(byId('f-length').value, 120) : '',
        color: byId('f-color') ? sanitize(byId('f-color').value, 120) : '',
      };

      payload.message = byId('f-message') ? sanitize(byId('f-message').value, 3500) : '';

      // Basic validation
      if (!payload.name || !payload.email) {
        setStatus('Please provide your full name and a valid email address.', 'error');
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
        setStatus('Please enter a valid email address.', 'error');
        return;
      }

      try {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting...';
        const resp = await submitCustomOrder(payload);
        if (resp && resp.ok) {
          setStatusDetailed(resp);
          form.reset();
          if (prefill.productHandle) byId('f-product-handle').value = prefill.productHandle;
          if (prefill.productTitle) byId('f-product-title').value = prefill.productTitle;
          if (prefill.variantId) byId('f-variant-id').value = prefill.variantId;
          if (prefill.variantTitle) byId('f-variant-title').value = prefill.variantTitle;
          if (prefill.price) byId('f-price').value = prefill.price;
          if (prefill.currency) byId('f-currency').value = prefill.currency;
          if (byId('f-quantity')) byId('f-quantity').value = '1';
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
          setStatus((resp && resp.error) || 'Something went wrong. Please try again.', 'error');
        }
      } catch (err) {
        console.error('[CustomOrder] Submit failed:', err);
        setStatus('Failed to submit your request. Please check your connection and try again.', 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Custom Order Request';
      }
    });
  }
});

async function submitCustomOrder(payload) {
  const base = window.__resolveApiBase ? await window.__resolveApiBase() : '/api';
  const endpoint = `${base.replace(/\/$/, '')}/custom-orders`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let err = { error: 'Request failed' };
    try { err = await res.json(); } catch (_) {}
    return { ok: false, error: err.error || `Server error (${res.status})` };
  }
  return res.json();
}

function setStatus(msg, type) {
  const el = document.getElementById('form-status');
  if (!el) return;
  el.className = 'form-status ' + (type === 'success' ? 'is-success' : type === 'error' ? 'is-error' : '');
  el.innerHTML = msg;
  el.style.display = 'block';
}

function setStatusDetailed(resp) {
  const el = document.getElementById('form-status');
  if (!el) return;
  el.className = 'form-status is-success';
  el.style.display = 'block';

  const message = resp.message || 'Thank you! Your request was submitted successfully.';
  const orderId = resp.orderId ? `<p class="status-ref">Order reference: <strong>${resp.orderId}</strong></p>` : '';
  const draftName = resp.draftOrderName ? `<p class="status-ref">Shopify Draft Order: <strong>${resp.draftOrderName}</strong></p>` : '';
  const invoiceLink = resp.invoiceUrl
    ? `<p class="status-action">💳 <a href="${escapeAttr(resp.invoiceUrl)}" target="_blank" rel="noopener noreferrer" class="invoice-link">Open Payment Invoice →</a></p>`
    : `<p class="status-note">We will email you a secure payment link shortly.</p>`;

  el.innerHTML = `<p class="status-main">${escapeHtml(message)}</p>${orderId}${draftName}${invoiceLink}`;
}

function clearStatus() {
  const el = document.getElementById('form-status');
  if (!el) return;
  el.innerHTML = '';
  el.style.display = 'none';
  el.className = 'form-status';
}

function escapeAttr(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function sanitize(s, max) {
  if (typeof s !== 'string') return '';
  return s.trim().slice(0, max || 500).replace(/[\x00-\x1F\x7F]/g, '');
}

