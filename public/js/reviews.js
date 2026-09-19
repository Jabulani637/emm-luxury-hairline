/**
 * Real customer reviews — the replacement for the hard-coded testimonial block.
 *
 * Four mounts, one file:
 *   #hero-reviews     → the star average and review count in the hero strip
 *   #home-reviews     → a short run of recent approved reviews
 *   #product-reviews  → that product's summary, list and submission form
 *   #reviews-page     → the whole catalogue, filterable by product
 *
 * Everything rendered here comes from /api/reviews, which only ever returns
 * rows an operator has approved. Text is escaped before it touches the DOM.
 */

(function () {
  const esc = () => window.escapeHtml || function (v) { return String(v == null ? '' : v); };

  function stars(n) {
    const filled = Math.max(0, Math.min(5, Math.round(Number(n) || 0)));
    return '★'.repeat(filled) + '☆'.repeat(5 - filled);
  }

  function monthYear(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  }

  async function getReviews({ handle, first } = {}) {
    const params = new URLSearchParams();
    if (handle) params.set('handle', handle);
    if (first) params.set('first', first);
    const base = await (window.__resolveApiBase ? window.__resolveApiBase() : '/api');
    const res = await fetch(`${base}/reviews?${params.toString()}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      let message = 'Reviews are unavailable right now.';
      try { message = (await res.json()).error || message; } catch (_) {}
      throw new Error(message);
    }
    return res.json();
  }

  function reviewCard(review, { showProduct } = {}) {
    const e = esc();
    const meta = [
      review.country ? e(review.country) : null,
      monthYear(review.createdAt) ? e(monthYear(review.createdAt)) : null,
    ].filter(Boolean).join(' &middot; ');

    const productLine = (showProduct && review.productTitle)
      ? `<a class="review-card__product" href="/products/${e(review.productHandle)}">${e(review.productTitle)}</a>`
      : '';

    return `<article class="review-card">
      <p class="review-card__stars" role="img" aria-label="Rated ${review.rating} out of 5">${stars(review.rating)}</p>
      ${review.title ? `<h3 class="review-card__title">${e(review.title)}</h3>` : ''}
      <p class="review-card__body">${e(review.body)}</p>
      ${productLine}
      <p class="review-card__meta"><strong>${e(review.author)}</strong>${meta ? ` <span>${meta}</span>` : ''}</p>
    </article>`;
  }

  function summaryBlock(stats) {
    const count = Number(stats.count) || 0;
    if (!count) return '';
    const breakdown = stats.breakdown || {};
    let bars = '';
    for (let star = 5; star >= 1; star--) {
      const n = Number(breakdown[star]) || 0;
      const pct = Math.round((n / count) * 100);
      bars += `<div class="review-summary__row">
        <span class="review-summary__label">${star}★</span>
        <span class="review-summary__track"><span class="review-summary__fill" style="width:${pct}%"></span></span>
        <span class="review-summary__count">${n}</span>
      </div>`;
    }
    return `<div class="review-summary">
      <div class="review-summary__score">
        <span class="review-summary__avg">${(Number(stats.average) || 0).toFixed(1)}</span>
        <span class="review-summary__stars" aria-hidden="true">${stars(stats.average)}</span>
        <span class="review-summary__from">Based on ${count} review${count === 1 ? '' : 's'}</span>
      </div>
      <div class="review-summary__bars">${bars}</div>
    </div>`;
  }

  /* ── Submission form ──────────────────────────────────────────────────
     Rendered rather than hand-written so all three mounts stay identical and
     the honeypot field can never be accidentally left visible.            */

  function formHtml({ handle, products }) {
    const e = esc();
    // One glyph per option, listed 5→1 so the row-reverse CSS can light up
    // every star at or below the current value with a single class.
    const ratingOptions = [5, 4, 3, 2, 1].map(n => `
      <label class="star-option" data-value="${n}">
        <input type="radio" name="rating" value="${n}" required>
        <span aria-hidden="true">★</span>
        <span class="sr-only">${n} out of 5 stars</span>
      </label>`).join('');

    let productField;
    if (handle) {
      productField = `<input type="hidden" name="productHandle" value="${e(handle)}">`;
    } else {
      const options = (products || []).map(p =>
        `<option value="${e(p.handle)}">${e(p.title)}</option>`).join('');
      productField = `<div class="form-group">
        <label for="rv-product">Which product? <span class="req">*</span></label>
        <select id="rv-product" name="productHandle" class="form-select" required>
          <option value="">Please choose…</option>
          ${options}
        </select>
      </div>`;
    }

    return `<form class="review-form" novalidate>
      <h3>Write a review</h3>
      <p class="review-form__note">Reviews are checked before they appear. Please write about the hair itself — how it looks, feels, arrives and lasts.</p>
      <div class="form-group">
        <label>Your rating <span class="req">*</span></label>
        <div class="star-picker" role="radiogroup" aria-label="Your rating">${ratingOptions}</div>
        <p class="star-picker__hint" data-rating-hint>Select a star rating</p>
      </div>
      <div class="form-row form-row--two">
        <div class="form-group">
          <label for="rv-author">Your name <span class="req">*</span></label>
          <input id="rv-author" name="author" class="form-input" type="text" maxlength="80" autocomplete="name" required placeholder="e.g. Chidi A.">
        </div>
        <div class="form-group">
          <label for="rv-country">Country</label>
          <input id="rv-country" name="country" class="form-input" type="text" maxlength="60" autocomplete="country-name" placeholder="Optional">
        </div>
      </div>
      ${productField}
      <div class="form-group">
        <label for="rv-title">Review title</label>
        <input id="rv-title" name="title" class="form-input" type="text" maxlength="120" placeholder="Optional — a short headline">
      </div>
      <div class="form-group">
        <label for="rv-body">Your review <span class="req">*</span></label>
        <textarea id="rv-body" name="body" class="form-input" rows="5" minlength="10" maxlength="2000" required placeholder="What was the quality like? Did it match the photos? How was delivery?"></textarea>
      </div>
      <div class="form-group review-form__hp" aria-hidden="true"
           style="position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden">
        <label for="rv-website">Leave this field empty</label>
        <input id="rv-website" name="website" class="form-input" type="text" tabindex="-1" autocomplete="off">
      </div>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary btn-lg">Submit review</button>
      </div>
      <p class="form-status" data-review-status role="status" aria-live="polite" hidden></p>
    </form>`;
  }

  function wireForm(form, { handle } = {}) {
    const status = form.querySelector('[data-review-status]');
    const button = form.querySelector('button[type="submit"]');
    const hint = form.querySelector('[data-rating-hint]');

    const picker = form.querySelector('.star-picker');
    const options = Array.from(form.querySelectorAll('.star-option'));

    function paint(predicate) {
      options.forEach(label => label.classList.toggle('is-on', predicate(Number(label.dataset.value))));
    }

    function selected() {
      const input = form.querySelector('.star-picker input:checked');
      return input ? Number(input.value) : 0;
    }

    options.forEach(label => {
      const value = Number(label.dataset.value);
      const preview = () => paint(n => n <= value);
      label.addEventListener('mouseenter', preview);
      label.querySelector('input').addEventListener('focus', preview);
      label.addEventListener('click', preview);
    });

    picker.addEventListener('mouseleave', () => {
      const current = selected();
      paint(n => n <= current);
    });

    form.querySelectorAll('.star-picker input').forEach(input => {
      input.addEventListener('change', () => {
        const value = selected();
        paint(n => n <= value);
        hint.textContent = value ? `${value} out of 5 stars selected` : 'Select a star rating';
      });
    });

    function show(kind, message) {
      status.hidden = false;
      status.className = `form-status ${kind === 'ok' ? 'is-success' : 'is-error'}`;
      status.textContent = message;
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const payload = {
        author: (data.get('author') || '').toString().trim(),
        country: (data.get('country') || '').toString().trim(),
        rating: Number(data.get('rating')) || 0,
        title: (data.get('title') || '').toString().trim(),
        body: (data.get('body') || '').toString().trim(),
        productHandle: (data.get('productHandle') || handle || '').toString().trim(),
        website: (data.get('website') || '').toString(),
      };

      if (!payload.rating) return show('err', 'Please choose a star rating.');
      if (payload.author.length < 2) return show('err', 'Please add the name you would like shown with your review.');
      if (payload.body.length < 10) return show('err', 'Please write at least a sentence about the product.');
      if (!payload.productHandle) return show('err', 'Please tell us which product this review is for.');

      try {
        button.disabled = true;
        button.textContent = 'Sending…';
        const base = await (window.__resolveApiBase ? window.__resolveApiBase() : '/api');
        const res = await fetch(`${base}/reviews`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || 'We could not send your review. Please try again.');
        form.reset();
        form.querySelectorAll('.star-option').forEach(l => l.classList.remove('is-on'));
        hint.textContent = 'Select a star rating';
        show('ok', json.message || 'Thank you! Your review will appear once it has been checked.');
      } catch (err) {
        show('err', err.message);
      } finally {
        button.disabled = false;
        button.textContent = 'Submit review';
      }
    });
  }

  /* ── Mounts ──────────────────────────────────────────────────────────── */

  /** An empty mount must not leave a gap where the block used to be. */
  function detach(el) {
    const section = el.closest('section');
    (section || el).remove();
  }

  async function mountHero(el, preloaded) {
    try {
      const { stats } = preloaded || await getReviews({ first: 1 });
      const count = Number(stats.count) || 0;
      if (!count) { el.remove(); return; }
      el.hidden = false;
      el.textContent = `${stars(stats.average)} ${(Number(stats.average) || 0).toFixed(1)} · ${count} review${count === 1 ? '' : 's'}`;
      el.title = 'Average of approved customer reviews';
    } catch (err) {
      el.remove();
    }
  }

  async function mountHome(el, preloaded) {
    try {
      const { stats, reviews } = preloaded || await getReviews({ first: 6 });
      const count = Number(stats.count) || 0;
      if (!reviews.length) { detach(el); return; }
      el.innerHTML = `
        <h2>${count === 1 ? 'What our first customers say' : `What customers say (${count})`}</h2>
        <div class="testimonial-grid testimonial-grid--reviews">
          ${reviews.slice(0, 3).map(r => reviewCard(r, { showProduct: false })).join('')}
        </div>
        <p class="reviews-more"><a class="btn btn-secondary" href="/pages/reviews">Read all reviews &amp; write your own</a></p>`;
    } catch (err) {
      detach(el);
    }
  }

  async function mountProduct(el) {
    const handle = window.handleFromLocation ? window.handleFromLocation('products') : '';
    if (!handle) { detach(el); return; }
    el.dataset.handle = handle;
    el.classList.add('reviews-section');
    const listEl = document.createElement('div');
    listEl.className = 'reviews-list';
    el.innerHTML = '<h2>Customer reviews</h2>';
    el.appendChild(listEl);
    el.insertAdjacentHTML('beforeend', formHostHtml());
    const formHost = el.querySelector('[data-form-host]');

    try {
      const { stats, reviews } = await getReviews({ handle });
      listEl.innerHTML = reviews.length
        ? `${summaryBlock(stats)}<div class="review-grid">${reviews.map(r => reviewCard(r, { showProduct: false })).join('')}</div>`
        : `<p class="reviews-empty">No reviews for this product yet. Bought it? <a href="#write-review">Be the first to review it</a>.</p>`;
    } catch (err) {
      listEl.innerHTML = `<p class="reviews-empty">${esc(err.message)}</p>`;
    }

    renderFormInto(formHost, { handle });
  }

  async function mountPage(el) {
    const e = esc();
    el.innerHTML = `
      <div class="reviews-shell">
        <div data-summary></div>
        <div class="reviews-filter">
          <label for="rv-filter">Show reviews for</label>
          <select id="rv-filter" class="form-select" data-filter>
            <option value="">All products</option>
          </select>
        </div>
        <div class="reviews-list" data-list><p class="reviews-empty">Loading reviews…</p></div>
        <div data-form-host id="write-review"></div>
      </div>`;

    const listEl = el.querySelector('[data-list]');
    const summaryEl = el.querySelector('[data-summary]');
    const filterEl = el.querySelector('[data-filter]');
    const formHost = el.querySelector('[data-form-host]');

    let products = [];
    try {
      const res = await window.productsAPI.getProducts({ first: 100 });
      products = res.products || [];
      filterEl.insertAdjacentHTML('beforeend',
        products.map(p => `<option value="${e(p.handle)}">${e(p.title)}</option>`).join(''));
    } catch (err) {
      // The filter is a convenience; the review list still works without it.
    }

    async function load(handle) {
      listEl.innerHTML = '<p class="reviews-empty">Loading reviews…</p>';
      try {
        const { stats, reviews } = await getReviews({ handle, first: 100 });
        summaryEl.innerHTML = summaryBlock(stats);
        listEl.innerHTML = reviews.length
          ? `<div class="review-grid">${reviews.map(r => reviewCard(r, { showProduct: !handle })).join('')}</div>`
          : `<p class="reviews-empty">No reviews here yet — you could be the first. Use the form below once you have your hair.</p>`;
      } catch (err) {
        listEl.innerHTML = `<p class="reviews-empty">${e(err.message)}</p>`;
      }
    }

    filterEl.addEventListener('change', () => load(filterEl.value || null));
    renderFormInto(formHost, { products });
    await load(null);
  }

  function formHostHtml() {
    return '<div class="review-form-host" data-form-host id="write-review"></div>';
  }

  function renderFormInto(host, opts) {
    if (!host) return;
    host.innerHTML = formHtml(opts);
    wireForm(host.querySelector('form'), opts);
  }

  document.addEventListener('DOMContentLoaded', () => {
    const hero = document.getElementById('hero-reviews');
    const home = document.getElementById('home-reviews');
    if (hero || home) {
      // One request feeds both homepage mounts.
      getReviews({ first: 6 })
        .then((payload) => {
          if (hero) mountHero(hero, payload);
          if (home) mountHome(home, payload);
        })
        .catch(() => {
          if (hero) hero.remove();
          if (home) detach(home);
        });
    }
    const product = document.getElementById('product-reviews');
    if (product) mountProduct(product);
    const page = document.getElementById('reviews-page');
    if (page) mountPage(page);
  });
})();
