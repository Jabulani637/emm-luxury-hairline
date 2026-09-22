/**
 * Reports what Shopify will actually localise for this store, right now.
 *
 *     npm run verify:markets
 *
 * The storefront has two separate switches, and this report says which of them
 * Shopify has thrown: the header's country list, which appears as soon as Shopify
 * offers a buyer anywhere to check out from, and per-currency prices, which need
 * much more besides. Nothing here turns either on — it only reads the live
 * Storefront API and changes nothing, so a missing picker or an unconverted price
 * can be told apart from a bug in our code.
 *
 * Three things have to be true before a shopper is shown their own currency, and
 * the report names whichever one is missing:
 *   1. the country is in Shopify's markets (Settings → Markets),
 *   2. that market displays a currency other than the store's own,
 *   3. the market has products published to it — without them the country is
 *      priced in the store's currency and its catalogue is empty.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const { getMarkets, getPurchasableMarkets } = require('../shopify/localization');
const { getProducts } = require('../shopify/queries/getProducts');

function list(items, max = 8) {
  return items.slice(0, max).join(', ') + (items.length > max ? `, +${items.length - max} more` : '');
}

async function main() {
  const { baseCurrency, countries } = await getMarkets();
  console.log(`\nStore currency: ${baseCurrency}`);
  console.log(`Countries Shopify offers to a buyer: ${countries.length}`);

  const otherCurrency = countries.filter(c => c.currency !== baseCurrency);
  console.log(`…of which shown a different currency: ${otherCurrency.length}`
    + (otherCurrency.length ? ` (${list(otherCurrency.map(c => `${c.code}=${c.currency}`))})` : ''));

  const purchasable = await getPurchasableMarkets();
  console.log(`…and that also have a catalogue to buy from: ${purchasable.length}`
    + (purchasable.length ? ` (${list(purchasable.map(m => m.code))})` : ''));

  if (purchasable.length) {
    const sample = purchasable[0];
    const products = await getProducts({ first: 3, country: sample.code });
    console.log(`\nPrices as a buyer in ${sample.code} sees them:`);
    for (const product of products) {
      const price = product.priceRange?.minVariantPrice;
      console.log(`  ${product.title} — ${price?.amount} ${price?.currencyCode}`);
    }
    console.log('\nREADY: a shopper in one of these markets is shown prices in their own currency.');
    return;
  }

  console.log(`\nCountry picker: ${countries.length ? 'ON' : 'off'} — Shopify lists `
    + `${countries.length} countries, so the header offers them and a cart can carry one.`);
  console.log(`Currency conversion: off — no market is priced in anything but ${baseCurrency}, `
    + 'so every shopper is shown the store\'s own currency and no catalogue is hidden from them.');
  console.log(otherCurrency.length
    ? 'Shopify lists currencies to sell in, but publishes no products to those markets. '
      + 'In Settings → Markets, open each market and add the products to its catalogue.'
    : `Every country Shopify offers is still priced in ${baseCurrency}. In Settings → Markets, `
      + 'edit each market and change its currency from the store currency to the local one.');
}

main().catch(error => {
  console.error(`\nmarkets:check could not reach Shopify: ${error.message}\n`);
  process.exit(1);
});
