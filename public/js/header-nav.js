// header-nav.js
// Small unobtrusive script to enable tap-to-open on mobile and keyboard interaction
// for the data-driven dropdown header.

document.addEventListener('DOMContentLoaded', () => {
  const nav = document.querySelector('.main-nav');
  if (!nav) return;

	// For each dropdown-enabled nav item, wire up toggles and accessible attributes
  nav.querySelectorAll('.nav-item.has-dropdown').forEach(item => {
	const link = item.querySelector('.nav-link');
	const dropdown = item.querySelector('.dropdown');
	if (!link || !dropdown) return;

	const dropdownId = dropdown.id || null;

	const setOpen = (open) => {
	  if (open) {
		item.classList.add('open');
		link.setAttribute('aria-expanded', 'true');
		if (dropdownId) dropdown.setAttribute('aria-hidden', 'false');
	  } else {
		item.classList.remove('open');
		link.setAttribute('aria-expanded', 'false');
		if (dropdownId) dropdown.setAttribute('aria-hidden', 'true');
	  }
	};

	// Click/tap behavior: on mobile toggle, on desktop let hover handle it
	link.addEventListener('click', (ev) => {
	  const isMobile = window.matchMedia('(max-width: 768px)').matches;
	  if (!isMobile) return; // let hover/keyboard handle desktop

	  ev.preventDefault();
	  const open = item.classList.contains('open');
	  // close others
	  nav.querySelectorAll('.nav-item.open').forEach(el => {
		if (el !== item) {
		  el.classList.remove('open');
		  const otherLink = el.querySelector('.nav-link');
		  const otherDropdown = el.querySelector('.dropdown');
		  if (otherLink) otherLink.setAttribute('aria-expanded', 'false');
		  if (otherDropdown) otherDropdown.setAttribute('aria-hidden', 'true');
		}
	  });
	  setOpen(!open);
	});

	// Keyboard: Enter or Space should toggle
	link.addEventListener('keydown', (ev) => {
	  if (ev.key === 'Enter' || ev.key === ' ') {
		ev.preventDefault();
		link.click();
	  }
	});

	// Mouse: reflect hover state into ARIA for assistive tech
	item.addEventListener('mouseenter', () => {
	  const isMobile = window.matchMedia('(max-width: 768px)').matches;
	  if (isMobile) return;
	  setOpen(true);
	});
	item.addEventListener('mouseleave', () => {
	  const isMobile = window.matchMedia('(max-width: 768px)').matches;
	  if (isMobile) return;
	  setOpen(false);
	});

	// Focus within: when child receives focus, keep it open
	item.addEventListener('focusin', () => setOpen(true));
	item.addEventListener('focusout', () => {
	  // small timeout to allow focus to move within the item
	  setTimeout(() => {
		if (!item.contains(document.activeElement)) setOpen(false);
	  }, 10);
	});
  });

  // Close dropdowns when clicking outside
  document.addEventListener('click', (ev) => {
	const isClickInside = nav.contains(ev.target);
	if (!isClickInside) {
	  nav.querySelectorAll('.nav-item.open').forEach(el => el.classList.remove('open'));
	}
  });

  // Respect keyboard focus: when moving focus away, close open menus
  nav.addEventListener('focusout', (ev) => {
	// tiny timeout to allow focus to move within the nav
	setTimeout(() => {
	  if (!nav.contains(document.activeElement)) {
		nav.querySelectorAll('.nav-item.open').forEach(el => el.classList.remove('open'));
	  }
	}, 10);
  });
});
