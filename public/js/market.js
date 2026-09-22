/**
 * Country picker in the site header.
 *
 * Shopify decides which countries this store may sell to, so the option list is
 * whatever /api/countries reports as `countries` — the same list Shopify itself
 * would show a buyer at checkout. Choosing one puts that country on the cart,
 * which is what lets the shopper fill in their own address instead of the store's
 * home country.
 *
 * The label carries a currency only for the countries listed under `markets`,
 * which are the ones Shopify quotes in their own money *and* has published a
 * catalogue to. That list is empty today, so the control reads as a plain country
 * list rather than promising prices it cannot convert yet.
 *
 * A choice is saved to localStorage and read from there by api.js, which sends it
 * as X-EMM-Country on every request. The page reloads after picking because prices
 * are drawn from three places — the API-rendered grids, the cart, and the figures
 * baked into the static HTML for search engines — and a fresh document is the one
 * path that refreshes all three the same way.
 */
(function () {
  const STORE_ENTRY = '';

  function labelFor(country, market, shopCurrency) {
    if (!market || market.currency === shopCurrency) return country.name;
    return country.name + ' (' + market.currency + (market.symbol && market.symbol !== market.currency
      ? ' ' + market.symbol
      : '') + ')';
  }

  function buildOptions(select, data) {
    const countries = (data.countries || []).slice().sort((a, b) => a.name.localeCompare(b.name));
    if (countries.length === 0) return false;

    const shopCurrency = data.shopCurrency || 'GBP';
    const markets = new Map((data.markets || []).map(m => [m.code, m]));

    select.textContent = '';

    const store = document.createElement('option');
    store.value = STORE_ENTRY;
    store.textContent = 'Shop currency (' + shopCurrency + ')';
    select.appendChild(store);

    for (const country of countries) {
      const option = document.createElement('option');
      option.value = country.code;
      option.textContent = labelFor(country, markets.get(country.code), shopCurrency);
      select.appendChild(option);
    }

    return true;
  }

  function start() {
    const picker = document.getElementById('country-picker');
    const select = document.getElementById('country-select');
    if (!picker || !select || typeof window.countriesAPI === 'undefined') return;

    window.countriesAPI.getCountries()
      .then((data) => {
        if (!buildOptions(select, data)) return;

        const saved = window.emmMarket.getCountry();
        // A country Shopify has since closed should not stay selected, because
        // the cart would keep asking for a market nobody can buy in.
        if (saved && !select.querySelector('option[value="' + saved + '"]')) {
          window.emmMarket.setCountry(null);
        } else if (saved) {
          select.value = saved;
        }

        picker.hidden = false;

        select.addEventListener('change', () => {
          window.emmMarket.setCountry(select.value || null);
          window.location.reload();
        });
      })
      .catch((error) => {
        // No list, no control — but say so, because a picker that quietly fails
        // to appear looks identical to a store that has no markets to offer.
        console.warn('[market] Country list unavailable:', error && error.message);
      });
  }

  // Loaded with defer from the header, so this runs before the deferred api.js
  // lower down the page exists — and readyState is already 'interactive' by now,
  // which is why waiting on 'loading' would have started too early. Every
  // deferred script has run by DOMContentLoaded, so the API is there for certain.
  if (document.readyState === 'complete') {
    start();
  } else {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  }
})();
