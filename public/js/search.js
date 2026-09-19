/**
 * Search — injects a full-screen modal, runs live debounced product search
 * against GET /api/products?query=&first=12, renders results as cards.
 *
 * Requires: api.js (window.productsAPI), cart.js (window.formatPrice)
 * Loaded on every page before nav.js.
 */

(function () {
  'use strict';

  /* ── Constants ──────────────────────────────────────────────────────────── */
  const DEBOUNCE_MS   = 280;
  const MAX_RESULTS   = 12;
  const MIN_CHARS     = 2;

  /* ── State ──────────────────────────────────────────────────────────────── */
  let debounceTimer  = null;
  let currentQuery   = '';
  let isOpen         = false;
  let activeIndex    = -1;   // keyboard-nav index over result cards
  let lastResults    = [];

  /* ── Inject modal HTML once ─────────────────────────────────────────────── */
  function injectModal() {
    if (document.getElementById('search-modal')) return;

    const modal = document.createElement('div');
    modal.id        = 'search-modal';
    modal.className = 'search-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Product search');
    modal.innerHTML = `
      <div class="search-backdrop"></div>
      <div class="search-panel">
        <div class="search-input-row">
          <svg class="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
               aria-hidden="true">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            id="search-input"
            class="search-input"
            type="search"
            placeholder="Search products…"
            autocomplete="off"
            autocorrect="off"
            spellcheck="false"
            aria-label="Search products"
            aria-autocomplete="list"
            aria-controls="search-results"
          >
          <button class="search-close-btn" aria-label="Close search">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div id="search-status" class="search-status" role="status" aria-live="polite"></div>
        <div id="search-results" class="search-results" role="listbox" aria-label="Search results"></div>
      </div>
    `;

    document.body.appendChild(modal);

    /* Wire events */
    modal.querySelector('.search-backdrop').addEventListener('click', closeSearch);
    modal.querySelector('.search-close-btn').addEventListener('click', closeSearch);

    const input = modal.querySelector('#search-input');
    input.addEventListener('input', onInput);
    input.addEventListener('keydown', onKeydown);
  }

  /* ── Open / Close ───────────────────────────────────────────────────────── */
  function openSearch() {
    if (isOpen) return;
    isOpen = true;
    const modal = document.getElementById('search-modal');
    modal.classList.add('is-open');
    document.body.style.overflow = 'hidden';

    const input = modal.querySelector('#search-input');
    // Small delay so CSS transition doesn't fight focus
    requestAnimationFrame(() => {
      requestAnimationFrame(() => input.focus());
    });
  }

  function closeSearch() {
    if (!isOpen) return;
    isOpen = false;
    const modal = document.getElementById('search-modal');
    modal.classList.remove('is-open');
    document.body.style.overflow = '';
    clearTimeout(debounceTimer);
    activeIndex = -1;
  }

  /* ── Input handler ──────────────────────────────────────────────────────── */
  function onInput(e) {
    const q = e.target.value.trim();
    if (q === currentQuery) return;
    currentQuery = q;
    activeIndex  = -1;

    clearTimeout(debounceTimer);

    if (q.length < MIN_CHARS) {
      setStatus('');
      setResults([]);
      return;
    }

    setStatus('Searching…');
    debounceTimer = setTimeout(() => runSearch(q), DEBOUNCE_MS);
  }

  /* ── Keyboard navigation ────────────────────────────────────────────────── */
  function onKeydown(e) {
    if (e.key === 'Escape') {
      closeSearch();
      return;
    }

    const cards = document.querySelectorAll('.search-result-card');
    if (!cards.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, cards.length - 1);
      updateActiveCard(cards);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, -1);
      if (activeIndex === -1) {
        document.getElementById('search-input')?.focus();
      } else {
        updateActiveCard(cards);
      }
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      cards[activeIndex]?.click();
    }
  }

  function updateActiveCard(cards) {
    cards.forEach((c, i) => {
      const active = i === activeIndex;
      c.classList.toggle('is-active', active);
      c.setAttribute('aria-selected', active ? 'true' : 'false');
      if (active) c.focus();
    });
  }

  /* ── Search API call ────────────────────────────────────────────────────── */
  async function runSearch(query) {
    try {
      const data = await window.productsAPI.getProducts({
        query,
        first: MAX_RESULTS,
        sortKey: 'RELEVANCE',
      });

      lastResults = data.products || [];

      if (lastResults.length === 0) {
        setStatus(`No results for "${escHtml(query)}"`);
        setResults([]);
      } else {
        setStatus(`${lastResults.length} result${lastResults.length !== 1 ? 's' : ''} for "${escHtml(query)}"`);
        setResults(lastResults);
      }
    } catch (err) {
      console.error('[Search] Error:', err);
      setStatus('Something went wrong. Please try again.');
      setResults([]);
    }
  }

  /* ── Render helpers ─────────────────────────────────────────────────────── */
  function setStatus(html) {
    const el = document.getElementById('search-status');
    if (el) el.innerHTML = html;
  }

  function setResults(products) {
    const container = document.getElementById('search-results');
    if (!container) return;

    if (!products.length) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = products.map((p, i) => {
      const image   = p.images && p.images[0];
      const price   = p.priceRange?.minVariantPrice;
      const inStock = p.availableForSale;

      const imgHtml = image
        ? `<img src="${escAttr(image.url)}" alt="${escAttr(image.altText || p.title)}" loading="lazy">`
        : `<div class="search-result-no-img">No image</div>`;

      const priceHtml = price
        ? `<span class="search-result-price">${fmtPrice(price.amount, price.currencyCode)}</span>`
        : '';

      const badge = inStock
        ? ''
        : `<span class="search-result-badge">Sold out</span>`;

      return `
        <a
          class="search-result-card"
          href="/products/${encodeURIComponent(p.handle)}"
          role="option"
          aria-selected="false"
          tabindex="-1"
          data-index="${i}"
        >
          <div class="search-result-img">${imgHtml}</div>
          <div class="search-result-info">
            <p class="search-result-title">${escHtml(p.title)}</p>
            <div class="search-result-meta">
              ${priceHtml}
              ${badge}
            </div>
          </div>
        </a>
      `;
    }).join('');

    /* Close on card click (navigation handles it, but in case of direct click) */
    container.querySelectorAll('.search-result-card').forEach(card => {
      card.addEventListener('click', () => {
        closeSearch();
      });
    });
  }

  /* ── Utility ────────────────────────────────────────────────────────────── */
  function fmtPrice(amount, currency) {
    if (typeof window.formatPrice === 'function') {
      return window.formatPrice(parseFloat(amount), currency);
    }
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(parseFloat(amount));
  }

  function escHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escAttr(str) {
    return escHtml(str);
  }

  /* ── Global keyboard shortcut: "/" or Cmd/Ctrl+K ─────────────────────────── */
  document.addEventListener('keydown', (e) => {
    // Don't hijack when typing in inputs
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    if (e.key === '/' || ((e.metaKey || e.ctrlKey) && e.key === 'k')) {
      e.preventDefault();
      if (isOpen) closeSearch(); else openSearch();
    }
    if (e.key === 'Escape' && isOpen) closeSearch();
  });

  /* ── Init on DOM ready ──────────────────────────────────────────────────── */
  function init() {
    injectModal();

    // Wire every .search-btn on the page
    document.querySelectorAll('.search-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        openSearch();
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose for programmatic use
  window.searchModal = { open: openSearch, close: closeSearch };
})();
