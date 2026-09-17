/**
 * Hero Slideshow
 * Cycles through .hero-slide elements every 8 seconds.
 * Crossfade transition + Ken Burns zoom handled entirely in CSS.
 * The active class drives both opacity and scale transitions.
 */
(function () {
  'use strict';

  const INTERVAL_MS = 8000; // 8 seconds per slide
  let timer = null;

  function init() {
    const slides = document.querySelectorAll('.hero-slide');
    if (!slides.length) return;

    let current = 0;

    // Make sure first slide starts in the zoomed-out (active) state
    slides[0].classList.add('active');

    function advance() {
      const prev = current;
      current = (current + 1) % slides.length;

      // Crossfade: remove active from old, add to new
      slides[prev].classList.remove('active');
      slides[current].classList.add('active');
    }

    timer = setInterval(advance, INTERVAL_MS);

    // Pause on hover over the hero section
    const hero = document.querySelector('.hero');
    if (hero) {
      hero.addEventListener('mouseenter', () => clearInterval(timer));
      hero.addEventListener('mouseleave', () => {
        timer = setInterval(advance, INTERVAL_MS);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
