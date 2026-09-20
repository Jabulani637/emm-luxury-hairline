/**
 * Register (or update) Shopify webhook subscriptions for this storefront.
 *
 *   npm run register:webhooks -- --url=https://api.emmluxuryhair.com
 *   node server/scripts/register-webhooks.js --topics=ORDERS_CREATE,PRODUCTS_UPDATE
 *
 * With no --topics it subscribes every event the handler in
 * server/routes/webhooks.js actually deals with. A subscription that already
 * exists for a topic is updated in place, so re-running is safe and creates no
 * duplicates.
 *
 * Needs an Admin API token whose scopes include read_orders and write_webhooks
 * — Shopify admin → Settings → Apps and sales channels → Develop apps → your
 * app → Configuration. The Client Secret on the Credentials page is the
 * WEBHOOK_SECRET the endpoint verifies deliveries against.
 *
 * --url is required locally: BACKEND_URL in .env is http://localhost:3000 so
 * the browser talks to a dev server, and Shopify cannot post to your laptop.
 * On Render, BACKEND_URL is already the public API origin.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const { shopifyAdminFetch } = require('../shopify/admin/client');

const DEFAULT_TOPICS = [
  'ORDERS_CREATE',
  'ORDERS_PAID',
  'ORDERS_UPDATED',
  'ORDERS_FULFILLED',
  'ORDERS_PARTIALLY_FULFILLED',
  'ORDERS_CANCELLED',
  'ORDERS_DELETED',
  'PRODUCTS_CREATE',
  'PRODUCTS_UPDATE',
  'PRODUCTS_DELETE',
];

// The order payload is trimmed to what the storefront keeps; product payloads
// are small and the handler reads fields (variants, inventory) that a field
// filter would have to enumerate anyway.
const ORDER_FIELDS = [
  'id', 'name', 'email', 'phone', 'currency', 'total_price', 'total_line_items_price',
  'financial_status', 'fulfillment_status', 'line_items', 'tags', 'note',
  'created_at', 'paid_at', 'processed_at', 'source_name', 'test',
];

const CREATE_MUTATION = `mutation ($topic: WebhookSubscriptionTopic!, $subscription: WebhookSubscriptionInput!) {
  webhookSubscriptionCreate(topic: $topic, webhookSubscription: $subscription) {
    webhookSubscription { id topic }
    userErrors { field message }
  }
}`;

const UPDATE_MUTATION = `mutation ($id: ID!, $subscription: WebhookSubscriptionInput!) {
  webhookSubscriptionUpdate(id: $id, webhookSubscription: $subscription) {
    webhookSubscription { id topic }
    userErrors { field message }
  }
}`;

function readArgs() {
  const args = process.argv.slice(2);
  const flag = (name) => {
    const hit = args.find(a => a.startsWith(`--${name}=`));
    return hit ? hit.split('=').slice(1).join('=') : null;
  };
  const topics = (flag('topics') || '')
    .split(',')
    .map(t => t.trim().toUpperCase())
    .filter(Boolean);

  return {
    baseUrl: flag('url') || process.env.BACKEND_URL || process.env.PUBLIC_API_URL,
    topics: topics.length ? topics : DEFAULT_TOPICS,
  };
}

async function existingSubscriptions() {
  const data = await shopifyAdminFetch({
    query: 'query { webhookSubscriptions(first: 50) { edges { node { id topic } } } }',
  });
  const byTopic = new Map();
  for (const edge of (data && data.webhookSubscriptions && data.webhookSubscriptions.edges) || []) {
    byTopic.set(edge.node.topic, edge.node.id);
  }
  return byTopic;
}

function assertNoUserErrors(result, topic) {
  const errors = result && result.userErrors;
  if (Array.isArray(errors) && errors.length) {
    throw new Error(errors.map(e => `${(e.field || []).join('.')}: ${e.message}`).join('; '));
  }
  return result && result.webhookSubscription;
}

async function main() {
  const { baseUrl, topics } = readArgs();

  if (!baseUrl) {
    console.error('No backend URL found. Pass --url=https://your-api-domain.com or set BACKEND_URL in .env');
    process.exit(1);
  }

  // BACKEND_URL is the address the browser is told to call, so locally it is
  // legitimately http://localhost:3000 — but Shopify cannot POST to your
  // laptop, and a subscription to it fails silently from your side of the
  // connection. Registration is a production action, so require the host.
  const hostOf = new URL(baseUrl).hostname;
  if (hostOf === 'localhost' || hostOf === '127.0.0.1' || hostOf === '0.0.0.0' || hostOf.endsWith('.local')) {
    console.error(`Refusing to register ${baseUrl} — Shopify cannot reach a machine on your own network.`);
    console.error('Run it against the deployed API instead:');
    console.error('  npm run register:webhooks -- --url=https://api.emmluxuryhair.com');
    process.exit(1);
  }

  const uri = new URL('/webhooks/shopify', baseUrl.replace(/\/$/, '')).href;
  console.log(`Webhook endpoint: ${uri}`);
  console.log(`Topics: ${topics.join(', ')}\n`);

  const existing = await existingSubscriptions();
  let failures = 0;

  for (const topic of topics) {
    const subscription = { uri, format: 'JSON' };
    if (topic.startsWith('ORDERS_')) subscription.includeFields = ORDER_FIELDS;

    try {
      let result;
      let verb;
      if (existing.has(topic)) {
        const data = await shopifyAdminFetch({
          query: UPDATE_MUTATION,
          variables: { id: existing.get(topic), subscription },
        });
        result = assertNoUserErrors(data.webhookSubscriptionUpdate, topic);
        verb = 'updated';
      } else {
        const data = await shopifyAdminFetch({
          query: CREATE_MUTATION,
          variables: { topic, subscription },
        });
        result = assertNoUserErrors(data.webhookSubscriptionCreate, topic);
        verb = 'created';
      }
      console.log(`  ${verb.padEnd(8)} ${topic}  (${result && result.id})`);
    } catch (err) {
      failures++;
      console.error(`  FAILED   ${topic}: ${err.message}`);
    }
  }

  if (failures) {
    console.error('\nSome subscriptions failed. The usual cause is the custom app missing the');
    console.error('read_orders or write_webhooks Admin API scope. Grant them in');
    console.error('Shopify admin → Settings → Apps and sales channels → Develop apps → your app');
    console.error('→ Configuration → Admin API integration, then re-run this script.');
    process.exit(2);
  }

  console.log('\nDone. Shopify now POSTs order events to your API.');
  console.log('WEBHOOK_SECRET in .env must be your custom app\'s Client Secret, which is the');
  console.log('key Shopify uses to sign webhook payloads for custom apps.');
}

main().catch(err => {
  console.error('Aborted:', err.message);
  process.exit(1);
});
