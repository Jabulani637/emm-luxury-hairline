/**
 * The delivery prices this store publishes, copied from Shopify admin.
 *
 * Shopify is what charges a customer — this file exists because the cart page's
 * shipping calculator reads live delivery-group quotes, and on this shop those
 * come back empty for every address (the Markets and zone repair in task #64 is
 * still with the merchant). A shopper who is quoted nothing tends to leave, so
 * when Shopify has no answer the cart page falls back to the prices the
 * merchant actually set in Settings → Shipping and delivery, labelled an
 * estimate and never written into the cart total.
 *
 * Two things follow from that. The lists must be kept in step with the admin by
 * hand — nothing syncs — and this table must never be used when Shopify has
 * quoted for real, because then its number is the one being charged.
 */

const CURRENCY = 'GBP';

// Shopify's EU zone holds all 27 member states, and the UK is deliberately not
// one of them: it is the store's home market and priced on its own row below.
const EUROPEAN_UNION = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
  'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
  'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
];

const ZONES = [
  {
    id: 'domestic',
    label: 'United Kingdom',
    // From this store's own published policy (Shipping & Returns page), which is
    // the UK zone in Shopify admin.
    countries: ['GB'],
    options: [
      { title: 'Standard delivery', price: '0.00', eta: '2–5 working days' },
      { title: 'DHL Express', price: '28.00', eta: '1–2 working days' },
    ],
  },
  {
    id: 'eu',
    label: 'EU (European Union)',
    countries: EUROPEAN_UNION,
    options: [
      { title: 'Standard international', price: '14.99', eta: '3–5 business days' },
    ],
  },
  {
    id: 'international',
    label: 'International',
    // Shopify's International zone covers 13 named countries and only three were
    // supplied, so this zone stands for everything outside the UK and the EU.
    // Replace `null` with the full list once every one of them is known.
    countries: null,
    options: [
      { title: 'Standard international', price: '23.99', eta: '3–5 business days' },
    ],
  },
];

function zoneFor(code) {
  return ZONES.find(z => z.countries && z.countries.includes(code))
    || ZONES.find(z => z.countries === null);
}

/**
 * What delivery to one country costs, as published. A malformed code gets null
 * because there is nothing to answer; so does ZZ, Shopify's placeholder for "no
 * country yet", which is not a destination anyone is shipping to. A well-formed
 * code beyond those always lands in a zone, the last being the catch-all.
 */
function quoteFor(rawCode) {
  if (typeof rawCode !== 'string') return null;
  const code = rawCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code) || code === 'ZZ') return null;

  const zone = zoneFor(code);
  return {
    country: code,
    zone: zone.label,
    options: zone.options.map(option => ({
      title: option.title,
      eta: option.eta,
      cost: { amount: option.price, currencyCode: CURRENCY },
      free: parseFloat(option.price) === 0,
    })),
  };
}

module.exports = { quoteFor, ZONES };
