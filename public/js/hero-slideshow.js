/**
 * Hero Slideshow
 * Cycles .hero-slide elements every 8 seconds with crossfade + Ken Burns.
 * Only the .active class is touched; which image loads is the browser's call.
 */
(function () {
  'use strict';

  const INTERVAL_MS   = 8000;  // time each slide is visible (ms)
  const TRANSITION_MS = 1400;  // must match CSS transition: opacity 1.4s

  function init() {
    const slides = Array.from(document.querySelectorAll('.hero-slide'));
    if (slides.length < 2) return; // nothing to animate with only 1 slide

    let current = 0;
    let timer   = null;

    // Ensure the first slide starts active (HTML already has it, but be safe)
    slides.forEach((s, i) => s.classList.toggle('active', i === 0));

    function goTo(next) {
      const prev = current;
      if (next === prev) return;
      current = next;

      // Fade out old
      slides[prev].classList.remove('active');

      // Small frame delay so the browser applies the reset transform before
      // re-adding active — this re-triggers the Ken Burns scale transition
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          slides[current].classList.add('active');
        });
      });
    }

    function advance() {
      goTo((current + 1) % slides.length);
    }

    function startTimer() {
      clearInterval(timer);
      timer = setInterval(advance, INTERVAL_MS);
    }

    startTimer();

    // Pause on hover, resume on leave
    const hero = document.querySelector('.hero');
    if (hero) {
      hero.addEventListener('mouseenter', () => clearInterval(timer));
      hero.addEventListener('mouseleave', startTimer);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
