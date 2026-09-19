// Mobile nav: below the 1024px desktop breakpoint the four header links live
// in the slide-in panel main.css positions. This script owns the open/close
// state — the .nav-open class on <body>, the button's aria-expanded, the
// scroll lock and keeping the keyboard inside the panel while it is open.

document.addEventListener('DOMContentLoaded', () => {
  const nav = document.getElementById('main-nav');
  const toggle = document.querySelector('.nav-toggle');
  if (!nav || !toggle) return;

  const closeBtn = nav.querySelector('.nav-close');
  const backdrop = document.querySelector('.nav-backdrop');
  const desktop = window.matchMedia('(min-width: 1024px)');

  const isOpen = () => document.body.classList.contains('nav-open');

  const setOpen = (open) => {
    if (open === isOpen()) return;
    document.body.classList.toggle('nav-open', open);
    toggle.setAttribute('aria-expanded', String(open));
  };

  const close = (returnFocus) => {
    if (!isOpen()) return;
    setOpen(false);
    if (returnFocus) toggle.focus();
  };

  toggle.addEventListener('click', () => setOpen(!isOpen()));
  if (closeBtn) closeBtn.addEventListener('click', () => close(true));
  if (backdrop) backdrop.addEventListener('click', () => close(true));

  nav.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => close(false));
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') close(true);
  });

  // Reaching the first/last focusable item from outside must not leave the
  // panel, since everything behind it is unscrollable and dimmed.
  nav.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Tab' || !isOpen()) return;
    const items = [...nav.querySelectorAll('a[href], button:not([disabled])')]
      .filter(el => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (ev.shiftKey && (active === first || !nav.contains(active))) {
      ev.preventDefault();
      last.focus();
    } else if (!ev.shiftKey && active === last) {
      ev.preventDefault();
      first.focus();
    }
  });

  // A phone that rotates or a window dragged past the breakpoint should not be
  // left holding a panel state the desktop layout has no room for.
  const onViewportChange = (ev) => { if (ev.matches) close(false); };
  if (typeof desktop.addEventListener === 'function') {
    desktop.addEventListener('change', onViewportChange);
  } else {
    desktop.addListener(onViewportChange);
  }
});
