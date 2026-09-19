/**
 * The homepage newsletter box.
 *
 * Before this the form had no name on its input, no handler and no action, so
 * pressing Subscribe reloaded the page and wrote the address into the URL
 * before discarding it. Everything the visitor needs to know now comes back in
 * the note under the form, and the address goes to POST /api/subscribers.
 */
(function () {
  'use strict';

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(() => {
    const form = document.querySelector('.newsletter-form');
    if (!form) return;

    const note = form.parentElement.querySelector('.newsletter-note');
    const button = form.querySelector('button[type="submit"]');
    const input = form.querySelector('input[name="email"]');
    const honeypot = form.querySelector('input[name="website"]');

    function say(message, kind) {
      if (!note) return;
      note.textContent = message;
      note.classList.toggle('is-error', kind === 'error');
      note.classList.toggle('is-success', kind === 'success');
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!window.subscribersAPI) {
        say('Something is missing from this page. Please reload and try again.', 'error');
        return;
      }

      const email = (input && input.value || '').trim();
      if (!email) {
        say('Enter your email address first.', 'error');
        if (input) input.focus();
        return;
      }

      const previous = button.textContent;
      button.disabled = true;
      button.textContent = 'Sending…';
      say('', null);

      try {
        const res = await window.subscribersAPI.subscribe(email, honeypot ? honeypot.value : '');
        say(res.message || 'You are on the list.', 'success');
        form.reset();
      } catch (err) {
        say(err.message || 'We could not sign you up just now. Please try again.', 'error');
      } finally {
        button.disabled = false;
        button.textContent = previous;
      }
    });
  });
})();
