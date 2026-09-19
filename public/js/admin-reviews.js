/**
 * Review moderation queue.
 *
 * Everything is fetched from /api/admin/reviews, which is cookie-gated
 * server-side; this page carries no data of its own, so serving it to a
 * stranger reveals nothing. Requests use relative '/api/...' paths on purpose:
 * this page is always served by the same process that owns the session cookie,
 * and a cross-origin call would not send it.
 */
(function () {
  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const el = (id) => document.getElementById(id);
  const noticeEl = el('notice');
  const loginEl = el('login');
  const queueEl = el('queue');
  const listEl = el('list');

  let rows = [];
  let filter = 'pending';

  /* ── plumbing ───────────────────────────────────────────────────────── */

  async function api(path, options = {}) {
    const res = await fetch(`/api/admin/reviews${path}`, {
      method: options.method || 'GET',
      headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined,
      credentials: 'same-origin',
    });
    let data = null;
    try { data = await res.json(); } catch (_) {}
    if (!res.ok) {
      const err = new Error((data && data.error) || 'Something went wrong. Please try again.');
      err.status = res.status;
      throw err;
    }
    return data || {};
  }

  function notice(message, kind) {
    if (!message) {
      noticeEl.className = 'msg msg--err hidden';
      noticeEl.textContent = '';
      return;
    }
    noticeEl.className = `msg ${kind === 'ok' ? 'msg--ok' : 'msg--err'}`;
    noticeEl.textContent = message;
  }

  function stars(n) {
    const filled = Math.max(0, Math.min(5, Math.round(Number(n) || 0)));
    return '★'.repeat(filled) + '☆'.repeat(5 - filled);
  }

  function shortDate(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  /* ── view ───────────────────────────────────────────────────────────── */

  function reviewBlock(review) {
    const actions = [];
    if (review.status !== 'approved') actions.push(`<button type="button" data-act="approve" data-id="${esc(review.id)}" class="primary">Approve</button>`);
    if (review.status === 'approved') actions.push(`<button type="button" data-act="undo" data-id="${esc(review.id)}">Unpublish</button>`);
    if (review.status !== 'rejected') actions.push(`<button type="button" data-act="reject" data-id="${esc(review.id)}">Reject</button>`);
    actions.push(`<button type="button" data-act="edit" data-id="${esc(review.id)}">Edit</button>`);
    actions.push(`<button type="button" data-act="delete" data-id="${esc(review.id)}">Delete</button>`);

    const product = review.productTitle
      ? `<a href="/products/${esc(review.productHandle || '')}" target="_blank" rel="noopener">${esc(review.productTitle)}</a>`
      : '<span>no product linked</span>';

    return `<article class="review" data-id="${esc(review.id)}">
      <div class="review__top">
        <span class="review__stars" aria-label="${review.rating} out of 5">${stars(review.rating)}</span>
        <span class="review__author">${esc(review.author)}</span>
        ${review.country ? `<span>${esc(review.country)}</span>` : ''}
        <span>${product}</span>
        <span class="grow">${shortDate(review.createdAt)}</span>
        <span class="status status--${esc(review.status)}">${esc(review.status)}</span>
      </div>
      ${review.title ? `<h3 class="review__title">${esc(review.title)}</h3>` : ''}
      <p class="review__body">${esc(review.body)}</p>
      <div class="review__actions">${actions.join('')}</div>
      <div class="editor-host"></div>
    </article>`;
  }

  function render() {
    const counts = { pending: 0, approved: 0, rejected: 0 };
    rows.forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });
    el('counts').textContent = `${counts.pending} pending · ${counts.approved} approved · ${counts.rejected} rejected`;

    const shown = filter ? rows.filter(r => r.status === filter) : rows;
    listEl.innerHTML = shown.length
      ? shown.map(reviewBlock).join('')
      : `<p class="empty">Nothing in ${filter ? `${filter} ` : ''}right now.</p>`;
  }

  function editorForm(review) {
    return `<div class="editor">
      <div class="grid2">
        <div>
          <label>Customer name</label>
          <input type="text" data-f="author" maxlength="80" value="${esc(review.author)}">
        </div>
        <div>
          <label>Country</label>
          <input type="text" data-f="country" maxlength="60" value="${esc(review.country || '')}">
        </div>
        <div>
          <label>Star rating</label>
          <select data-f="rating">
            ${[5, 4, 3, 2, 1].map(n => `<option value="${n}" ${Number(review.rating) === n ? 'selected' : ''}>${n} stars</option>`).join('')}
          </select>
        </div>
        <div>
          <label>Headline</label>
          <input type="text" data-f="title" maxlength="120" value="${esc(review.title || '')}">
        </div>
      </div>
      <div style="margin-top:12px">
        <label>Review text</label>
        <textarea data-f="body" rows="4" maxlength="2000">${esc(review.body)}</textarea>
      </div>
      <div class="review__actions" style="margin-top:12px">
        <button type="button" class="primary" data-act="save" data-id="${esc(review.id)}">Save changes</button>
        <button type="button" data-act="cancel">Cancel</button>
      </div>
      <p class="note" data-editor-error></p>
    </div>`;
  }

  /* ── actions ────────────────────────────────────────────────────────── */

  async function load() {
    try {
      const data = await api('');
      rows = data.reviews || [];
      el('backend').textContent = `storage: ${data.backend}`;
      el('backend').className = `badge${data.backend === 'supabase' ? '' : ' badge--warn'}`;
      el('backend').title = data.backend === 'supabase'
        ? 'Reviews are stored in Supabase and survive every deploy.'
        : 'Reviews are in a local file, which Render wipes on each deploy. Connect Supabase before launch.';
      render();
      notice('');
    } catch (err) {
      if (err.status === 401) { showLogin('Your session expired. Please sign in again.'); return; }
      notice(err.message);
    }
  }

  async function act(id, action, fields) {
    try {
      await api(`/${encodeURIComponent(id)}`, { method: 'POST', body: { action, ...fields } });
      await load();
      return true;
    } catch (err) {
      notice(err.message);
      return false;
    }
  }

  listEl.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-act]');
    if (!button) return;
    const action = button.dataset.act;
    const block = button.closest('.review');
    const host = block.querySelector('.editor-host');

    if (action === 'edit') {
      const review = rows.find(r => String(r.id) === block.dataset.id);
      host.innerHTML = review ? editorForm(review) : '';
      return;
    }
    if (action === 'cancel') { host.innerHTML = ''; return; }
    if (action === 'save') {
      const values = {};
      host.querySelectorAll('[data-f]').forEach(input => { values[input.dataset.f] = input.value; });
      const errorEl = host.querySelector('[data-editor-error]');
      if (String(values.body || '').trim().length < 10) {
        errorEl.textContent = 'Review text needs at least 10 characters.';
        return;
      }
      if (String(values.author || '').trim().length < 2) {
        errorEl.textContent = 'A customer name is required.';
        return;
      }
      errorEl.textContent = '';
      button.disabled = true;
      const ok = await act(block.dataset.id, 'save', values);
      button.disabled = false;
      if (ok) notice('Saved.', 'ok');
      return;
    }
    if (action === 'delete') {
      if (!window.confirm('Delete this review permanently? Approving or rejecting keeps a record instead.')) return;
      await act(block.dataset.id, 'delete');
      return;
    }
    await act(block.dataset.id, action);
  });

  function setFilter(status) {
    filter = status;
    document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.status === status)));
    render();
  }

  document.querySelector('.tabs').addEventListener('click', (event) => {
    const tab = event.target.closest('button[data-status]');
    if (tab) setFilter(tab.dataset.status);
  });

  el('reload').addEventListener('click', load);

  /* ── paste a review ─────────────────────────────────────────────────── */

  async function loadProducts() {
    const select = el('p-product');
    try {
      const res = await fetch('/api/products?first=100', { headers: { Accept: 'application/json' } });
      const data = await res.json();
      const products = data.products || [];
      select.innerHTML = products.length
        ? products.map(p => `<option value="${esc(p.handle)}" data-title="${esc(p.title)}">${esc(p.title)}</option>`).join('')
        : '<option value="">No products found</option>';
    } catch (err) {
      select.innerHTML = '<option value="">Could not load products</option>';
    }
  }

  el('paste-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    const select = el('p-product');
    const button = el('paste-submit');
    const payload = {
      author: form.author.value,
      country: form.country.value,
      rating: Number(form.rating.value),
      title: form.title.value,
      body: form.body.value,
      productHandle: select.value,
      productTitle: select.options[select.selectedIndex]?.dataset?.title || '',
      status: form.status.value,
    };

    try {
      button.disabled = true;
      button.textContent = 'Adding…';
      await api('', { method: 'POST', body: payload });
      form.reset();
      await load();
      setFilter(payload.status === 'pending' ? 'pending' : 'approved');
      notice('Review added.', 'ok');
    } catch (err) {
      notice(err.message);
    } finally {
      button.disabled = false;
      button.textContent = 'Add review';
    }
  });

  /* ── session ────────────────────────────────────────────────────────── */

  function showLogin(message) {
    queueEl.classList.add('hidden');
    loginEl.classList.remove('hidden');
    if (message) notice(message);
  }

  function showQueue() {
    loginEl.classList.add('hidden');
    queueEl.classList.remove('hidden');
    loadProducts();
    load();
  }

  el('login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = event.target.querySelector('button');
    const password = el('password').value;
    try {
      button.disabled = true;
      button.textContent = 'Checking…';
      await api('/login', { method: 'POST', body: { password } });
      el('password').value = '';
      showQueue();
    } catch (err) {
      notice(err.message);
    } finally {
      button.disabled = false;
      button.textContent = 'Sign in';
    }
  });

  el('logout').addEventListener('click', async () => {
    try { await api('/logout', { method: 'POST' }); } catch (_) {}
    showLogin('Signed out.');
  });

  api('/session').then((data) => {
    if (!data.enabled) {
      loginEl.classList.add('hidden');
      notice('Moderation is switched off: set ADMIN_PASSWORD on the server to enable it.', 'err');
      return;
    }
    if (data.signedIn) showQueue();
    else showLogin('');
  }).catch(() => {
    showLogin('Could not reach the server. Please refresh.');
  });
})();
