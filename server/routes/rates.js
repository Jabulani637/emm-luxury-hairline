const express = require('express');
const axios = require('axios');
const router = express.Router();

/**
 * GET /api/rates
 *
 * Today's exchange rates with GBP as the base, for the storefront's "≈ $x"
 * hints. The store charges in pounds and always will — this endpoint exists so
 * a shopper in Lagos or Toronto can see roughly what that means in the money
 * they think in, without doing sums.
 *
 * Rates come from open.er-api.com, which needs no key and refreshes once a day,
 * so the answer is cached in memory for a day and served with a matching
 * max-age. The browser and any CDN in front of it then rarely reach this file
 * at all.
 *
 * The upstream call is made from here rather than from the page so the browser
 * only ever contacts this API. The storefront now ships a live
 * Content-Security-Policy, and adding a currency vendor to its allow-list to
 * serve a decorative number would widen a policy that guards every page.
 */

const RATE_SOURCE = 'https://open.er-api.com/v6/latest/GBP';
const DAY = 24 * 60 * 60 * 1000;

// { at: epoch ms, body: the JSON the route serves }
let cache = null;

async function fetchRates() {
  const { data } = await axios.get(RATE_SOURCE, { timeout: 8000 });

  if (!data || data.result !== 'success' || !data.rates) {
    throw new Error(`unexpected response (${data && data.result ? data.result : 'no result field'})`);
  }

  const rates = {};
  for (const [code, rate] of Object.entries(data.rates)) {
    if (typeof rate === 'number' && isFinite(rate) && rate > 0) rates[code] = rate;
  }

  return {
    base: 'GBP',
    asOf: data.time_last_update_utc || null,
    rates,
  };
}

router.get('/', async (req, res) => {
  if (cache && Date.now() - cache.at < DAY) {
    res.set('Cache-Control', 'public, max-age=86400');
    return res.json(cache.body);
  }

  try {
    const body = await fetchRates();
    cache = { at: Date.now(), body };
    res.set('Cache-Control', 'public, max-age=86400');
    res.json(body);
  } catch (error) {
    console.error('[API] rates failed:', error.message);

    // A stale rate beats no rate for an indicative figure, and if there is
    // nothing to serve the storefront simply hides the hints. This is a
    // cosmetic number about money we are not charging, so it must never read
    // to the shopper as a broken store.
    res.set('Cache-Control', 'public, max-age=60');
    res.json(cache ? cache.body : { base: 'GBP', asOf: null, rates: {} });
  }
});

module.exports = router;
