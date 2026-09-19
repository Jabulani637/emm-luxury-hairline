/**
 * The homepage newsletter box.
 *
 * Before this the form had no name on its input, no handler and no action, so
 * pressing Subscribe reloaded the page and wrote the address into the URL
 * before discarding it. Now the address goes to POST /api/subscribers and a
 * confirmed signup is answered with the dialog at the end of the section.
 *
 * The dialog shows the server's own sentence rather than one written here, so
 * the two can never disagree about what happens next.
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
    const modal = document.querySelector('.signup-modal');

    function say(text, kind) {
      if (!note) return;
      note.textContent = text;
      note.classList.toggle('is-error', kind === 'error');
      note.classList.toggle('is-success', kind === 'success');
    }

    if (modal) {
      modal.addEventListener('click', event => {
        // A click on the dimmed page behind it lands on the dialog itself.
        if (event.target === modal) modal.close();
      });

      modal.querySelector('.signup-modal-close').addEventListener('click', () => modal.close());
      modal.querySelector('.signup-modal-done').addEventListener('click', () => modal.close());
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
        form.reset();
        if (modal) {
          const line = modal.querySelector('.signup-modal-message');
          if (line && res.message) line.textContent = res.message;
          modal.showModal();
          modal.querySelector('.signup-modal-done').focus();
        }
      } catch (err) {
        say(err.message || 'We could not sign you up just now. Please try again.', 'error');
        if (input) input.focus();
      } finally {
        button.disabled = false;
        button.textContent = previous;
      }
    });
  });
})();
