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
 * quoted for real, because then its number is the one being charged. And a third:
 * it speaks only for the countries it can show inside a zone. A price invented for
 * an address the admin has not put in any zone is the difference between a cart
 * page that says £23.99 and a checkout that says the item cannot be delivered
 * there, which is how South Africa read.
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
    // Shopify's International zone holds 13 countries and the merchant named
    // three of them. The row therefore prices these and no others: an unnamed code
    // may or may not sit in the zone's other ten, and guessing it does is what put
    // "£23.99 International" on the cart page for South Africa while Shopify's own
    // checkout told that buyer the product cannot be delivered to them.
    countries: ['AE', 'AU', 'CA'],
    options: [
      { title: 'Standard international', price: '23.99', eta: '3–5 business days' },
    ],
  },
];

function zoneFor(code) {
  return ZONES.find(z => z.countries.includes(code));
}

/**
 * What delivery to one country costs, as published.
 *
 * A malformed code and Shopify's "no country yet" placeholder get null, because
 * there is no destination to answer for. A real code inside a zone gets that zone's
 * rates. A real code outside every named zone gets `priced: false` with no options:
 * this table mirrors zones, so it cannot claim a price for an address it cannot show
 * in a zone, and it must not claim the address is refused either — the ten unnamed
 * International countries are exactly that unknown, and Shopify's quote at checkout
 * is the only party that knows.
 */
function quoteFor(rawCode) {
  if (typeof rawCode !== 'string') return null;
  const code = rawCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code) || code === 'ZZ') return null;

  const zone = zoneFor(code);
  if (!zone) {
    return { country: code, zone: null, priced: false, options: [] };
  }

  return {
    country: code,
    zone: zone.label,
    priced: true,
    options: zone.options.map(option => ({
      title: option.title,
      eta: option.eta,
      cost: { amount: option.price, currencyCode: CURRENCY },
      free: parseFloat(option.price) === 0,
    })),
  };
}

module.exports = { quoteFor, ZONES };
