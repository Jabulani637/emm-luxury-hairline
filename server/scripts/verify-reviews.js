/**
 * Confirms the review store actually works end to end.
 *   npm run verify:reviews
 * Writes one probe row and deletes it again, so it proves read, insert and
 * delete rights rather than just network reachability.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const store = require('../reviews/store');
const supabase = require('../db/supabase');

const PROBE = 'rev:verify-probe';

async function main() {
  const backend = store.backend();
  console.log(`Review store backend: ${backend}`);

  if (backend !== 'supabase') {
    console.warn(`   ${supabase.configError() || 'Supabase env vars missing'}`);
    console.warn('   Falling back to data/reviews/reviews.json, which Render wipes on every deploy.');
  } else {
    console.log(`   Project URL: ${(process.env.SUPABASE_URL || '').replace(/^https:\/\//, '')}`);
    console.log(`   Table: ${process.env.SUPABASE_REVIEWS_TABLE || 'product_reviews'}`);
    console.log('   Secret key: present (not printed)');
  }

  console.log('\n1. read approved reviews…');
  const { rows, stats } = await store.approvedWithStats(null);
  console.log(`   OK — ${rows.length} visible row(s), average ${stats.average || 0} of 5.`);

  console.log('2. insert a probe review…');
  const created = await store.insert({
    product_handle: null,
    product_title: null,
    author: PROBE,
    country: null,
    rating: 5,
    title: 'Verification probe',
    body: 'Written by npm run verify:reviews and deleted again immediately.',
    status: 'pending',
  });
  if (!created || !created.id) throw new Error('insert returned no row — check table grants and RLS');
  console.log(`   OK — id ${created.id}.`);

  console.log('3. read it back and delete it…');
  const found = await store.getById(created.id);
  console.log(`   ${found ? 'found' : 'MISSING'} in moderation queue.`);
  const removed = await store.remove(created.id);
  console.log(`   ${removed ? 'deleted' : 'DELETE FAILED — check that the key is the secret/service-role key'}.`);

  const after = await store.getById(created.id);
  if (after) throw new Error('probe row survived deletion');

  if (backend !== 'supabase') {
    console.log('\n❌ Read, insert and delete all worked — against data/reviews/reviews.json.');
    console.log('   That proves nothing about durability: Render deletes this file on every deploy.');
    console.log('   Set SUPABASE_URL and SUPABASE_SECRET_KEY in .env, then run this again.');
    process.exit(1);
  }
  console.log('\n✅ Review store is working against Supabase.');
}

main().catch(err => {
  console.error('\n❌ Review store check failed:', err.message);
  if (backendHint(err)) console.error(backendHint(err));
  process.exit(1);
});

function backendHint(err) {
  if (/Could not find the table/i.test(err.message)) {
    return 'The table is not exposed to the Data API. Run supabase/schema.sql, then check Settings -> API -> Exposed schemas.';
  }
  if (/JWT|apikey|Invalid API key|401|403/i.test(err.message)) {
    return 'The key was rejected. SUPABASE_SECRET_KEY must be the project SECRET key (sb_secret_…), or the legacy service_role key — never the publishable/anon key.';
  }
  if (/relation .* does not exist/i.test(err.message)) {
    return 'Run supabase/schema.sql in the Supabase SQL editor first.';
  }
  return null;
}
