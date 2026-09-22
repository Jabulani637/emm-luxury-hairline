require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { getProducts } = require('../shopify/queries/getProducts');
const { getProduct } = require('../shopify/queries/getProduct');
const { shopDomain } = require('../shopify/env');
const { shopifyFetch } = require('../shopify/client');
const { isAdminConfigured, shopifyAdminFetch } = require('../shopify/admin/client');
const { CART_FIELDS } = require('../shopify/cartFields');
const { cartCreate } = require('../shopify/mutations/cartCreate');
const { cartLinesUpdate } = require('../shopify/mutations/cartLinesUpdate');
const { cartDeliveryAddressUpdate } = require('../shopify/mutations/cartDeliveryAddressUpdate');
const { cartDeliveryOptionsUpdate } = require('../shopify/mutations/cartDeliveryOptionsUpdate');
const { cartBuyerIdentityUpdate } = require('../shopify/mutations/cartBuyerIdentityUpdate');

let failures = 0;

function check(name, pass, detail) {
  if (!pass) failures++;
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

const money = field => (field ? parseFloat(field.amount) : null);

/** What Shopify kept on a cart, using exactly the fields the browser gets. */
async function readCart(cartId) {
  const data = await shopifyFetch({
    query: `query cart($id: ID!) { cart(id: $id) { ${CART_FIELDS} } }`,
    variables: { id: cartId },
  });
  return data.cart;
}

/** Every figure the bag summary shows, in one line of output. */
function summary(cart) {
  const shipping = (cart.deliveryGroups?.edges || [])
    .map(e => e.node.selectedDeliveryOption)
    .filter(Boolean)
    .reduce((sum, option) => sum + (money(option.estimatedCost) || 0), 0);
  return `subtotal ${money(cart.cost.subtotalAmount)} + shipping ${shipping} = total ${money(cart.cost.totalAmount)}`;
}

/**
 * The whole shipping chain, against the live store: quote a destination, pick
 * the paid rate, then change the quantity. The rate has to survive the quantity
 * change and the total has to move by exactly its cost, which is the behaviour
 * this site got wrong once the Storefront API renamed these fields.
 */
async function checkCartAndShipping(variantId) {
  console.log('\n-- cart and shipping round-trip');

  const created = await cartCreate(variantId, 1);
  const createdLines = created.lines?.edges || [];
  check('the cart keeps the line we added', createdLines.length > 0,
    `${createdLines.length} line(s) — ${summary(created)}`);
  if (createdLines.length === 0) return;
  const lineId = createdLines[0].node.id;
  // Shopify accepts a sold-out variant into a cart and prices it at 0, so a
  // non-null total proves nothing. The whole shipping chain below only means
  // something if the bag actually costs money.
  check('a new cart comes back priced', money(created.cost.totalAmount) > 0, summary(created));

  const quoted = await cartDeliveryAddressUpdate(created.id, { country: 'GB' });
  const groups = quoted.deliveryGroups?.edges || [];
  check('a delivery address produces shipping options', groups.length > 0,
    groups.map(g => `${g.node.deliveryAddress?.countryCode}: ` +
      g.node.deliveryOptions.map(o => `${o.title} ${money(o.estimatedCost)}`).join(', ')).join(' | ') || 'no groups');
  if (groups.length === 0) return;

  const options = groups[0].node.deliveryOptions;
  const paid = options.find(o => money(o.estimatedCost) > 0) || options[0];
  const rateCost = money(paid.estimatedCost);

  const chosen = await cartDeliveryOptionsUpdate(quoted.id, [
    { deliveryGroupId: groups[0].node.id, deliveryOptionHandle: paid.handle },
  ]);
  const goods = money(chosen.cost.subtotalAmount);
  const total = money(chosen.cost.totalAmount);
  check(`the chosen rate ("${paid.title}") is inside the total`,
    Math.abs(total - (goods + rateCost)) < 0.01,
    summary(chosen));

  const bumped = await cartLinesUpdate(chosen.id, [{ id: lineId, quantity: 2 }]);
  check('changing the quantity keeps the delivery groups',
    (bumped.deliveryGroups?.edges || []).length > 0, summary(bumped));
  const kept = (bumped.deliveryGroups?.edges || [])[0]?.node?.selectedDeliveryOption;
  check('changing the quantity keeps the chosen rate',
    !!kept && kept.handle === paid.handle, kept ? `${kept.title} ${money(kept.estimatedCost)}` : 'nothing selected');
  const bumpedTotal = money(bumped.cost.totalAmount);
  const bumpedGoods = money(bumped.cost.subtotalAmount);
  check('the total still adds up after the quantity change',
    Math.abs(bumpedTotal - (bumpedGoods + rateCost)) < 0.01, summary(bumped));

  // The last thing the bag does before handing off to Shopify is clear the
  // buyer's country so checkout offers every country. That must not cost the
  // shopper the rate they just chose.
  await cartBuyerIdentityUpdate(bumped.id, {});
  const atCheckout = await readCart(bumped.id);
  const stillSelected = (atCheckout.deliveryGroups?.edges || [])[0]?.node?.selectedDeliveryOption;
  check('unlocking the checkout country keeps the chosen rate',
    !!stillSelected && stillSelected.handle === paid.handle,
    stillSelected ? `${stillSelected.title} ${money(stillSelected.estimatedCost)}` : 'nothing selected');
  check('checkout opens on the all-inclusive total',
    Math.abs(money(atCheckout.cost.totalAmount) - bumpedTotal) < 0.01,
    `bag ${bumpedTotal} vs checkout ${money(atCheckout.cost.totalAmount)}`);
}

/**
 * Whether the Admin token can actually do the things this site asks it to.
 *
 * `/api/health` only reports that a token is present, and a token can be real,
 * authenticate cleanly and still be forbidden from everything: Shopify answers a
 * missing scope with "Access denied for X field" rather than a login failure.
 * Since a write scope always carries its read scope, reading one field per
 * resource proves the grant without creating anything.
 *
 * Listing `webhookSubscriptions` is deliberately not used as the webhook test:
 * it needs no data scope, so it answers even for an app granted nothing, while
 * creating an `orders/*` subscription is refused without read_orders and a
 * `products/*` one without read_products. The two reads below are the gate that
 * `npm run register:webhooks` will actually meet.
 */
async function checkAdminAccess() {
  if (!isAdminConfigured()) {
    check('Admin API: no usable token', false, 'custom orders fall back to local JSON and webhooks cannot be registered');
    return;
  }
  for (const [capability, query] of [
    ['write_draft_orders — custom orders', '{ draftOrders(first: 1) { edges { node { name } } } }'],
    ['read_orders — order webhooks', '{ orders(first: 1) { edges { node { name } } } }'],
    ['read_products — product webhooks', '{ products(first: 1) { edges { node { title } } } }'],
  ]) {
    try {
      await shopifyAdminFetch({ query });
      check(`Admin API scope: ${capability}`, true);
    } catch (err) {
      check(`Admin API scope: ${capability}`, false, err.message);
    }
  }
}

async function run() {
  try {
    console.log('Using SHOP:', shopDomain() || '(not configured)');
    console.log('Testing products query (first: 12)...');
    const products = await getProducts({ first: 12 });
    console.log('Products fetched:', Array.isArray(products) ? products.map(p => ({ handle: p.handle, title: p.title })) : products);

    if (products && products.length > 0) {
      const sellable = products.find(p => (p.variants || []).some(v => v.availableForSale === true));
      check('the store has something to buy', Boolean(sellable),
        sellable ? `${sellable.title} (${sellable.handle})` :
          `${products.length} published product(s) and not one in stock — checkout cannot be verified`);

      const handle = (sellable || products[0]).handle;
      console.log(`Testing product by handle: ${handle}`);
      const product = await getProduct(handle);
      if (product) {
        console.log('Product fetched:', { handle: product.handle, title: product.title, variants: (product.variants || []).length });
      } else {
        console.log('Product fetch returned null');
      }
      const variant = (product?.variants || []).find(v => v.availableForSale === true);
      if (variant) {
        console.log(`Cart test uses in-stock variant: ${variant.title} ${variant.price?.amount} ${variant.price?.currencyCode}`);
        await checkCartAndShipping(variant.id);
      } else {
        check('cart round-trip needs a purchasable variant', false,
          `no in-stock variant on ${handle}`);
      }
    } else {
      console.log('No products returned from shopify query. Ensure the store has published products and SHOPIFY_PUBLIC_ACCESS_TOKEN is a valid Storefront API token.');
    }

    await checkAdminAccess();

    if (failures) {
      console.error(`\n${failures} check(s) failed.`);
      process.exit(2);
    }
    console.log('\nAll Shopify checks passed.');
    process.exit(0);
  } catch (err) {
    console.error('Verification failed:', err && err.message ? err.message : err);
    process.exit(2);
  }
}

run();
