/**
 * Contact form — submits to POST /api/contact, which files the enquiry in
 * Shopify as a draft order tagged `contact-inquiry`.
 *
 * This replaced a mailto: handler that only opened the visitor's email client
 * and left no record, so messages from phones with no mail app configured were
 * lost silently.
 */
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('contact-form');
  if (!form) return;

  const btn = document.getElementById('contact-submit-btn');
  const status = document.getElementById('contact-status');
  const field = (id) => document.getElementById(id);
  const SUPPORT_EMAIL = 'support@emmluxuryhair.com';

  function show(kind, html) {
    status.className = 'form-status is-' + kind;
    status.style.display = 'block';
    status.innerHTML = html;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = field('c-name').value.trim();
    const email = field('c-email').value.trim();
    const phone = field('c-phone').value.trim();
    const subjectSelect = field('c-subject');
    const subject = subjectSelect.options[subjectSelect.selectedIndex]
      ? subjectSelect.options[subjectSelect.selectedIndex].text
      : '';
    const message = field('c-message').value.trim();

    if (!name || !email || !subject || !message) {
      show('error', 'Please fill in all required fields.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      show('error', 'Please enter a valid email address.');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Sending…';

    try {
      const result = await window.contactAPI.submit({ name, email, phone, subject, message });

      show('success', `
        <p class="status-main">Thank you, ${escapeHtml(name.split(' ')[0])}! ${escapeHtml(result.message || 'Your message has been received.')}</p>
        <p class="status-note">Prefer to write directly? <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></p>
      `);
      form.reset();
    } catch (err) {
      console.error('[contact] Submit failed:', err);
      show('error', `
        <p class="status-main">${escapeHtml(err.message || 'We could not send your message.')} Please try again, or email us directly at <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>.</p>
      `);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Send Message';
    }
  });
});
