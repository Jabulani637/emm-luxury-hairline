/**
 * Newsletter signups.
 *
 * Same two-driver shape as the review store — Supabase as soon as it is
 * configured, a local file while it is not — with one deliberate difference.
 * There is no read endpoint here and no admin page: a subscriber list is
 * customer PII, so the only way to see it is the Supabase table editor. The
 * file driver exists for local development and mirrors what the reviews file
 * already does; on Render it is wiped on deploy, which is why the health
 * endpoint reports which of the two is live.
 */
const fs = require('fs');
const path = require('path');

const supabase = require('../db/supabase');
const { DATA_DIR } = require('../localRecords');

const TABLE = process.env.SUPABASE_SUBSCRIBERS_TABLE || 'email_subscribers';
const FILE = path.join(DATA_DIR, 'subscribers', 'subscribers.json');

const MAX_EMAIL_LENGTH = 254;
const EMAIL_SHAPE = /^[^\s@,;]+@[^\s@,;.]+(?:\.[^\s@,;.]+)+$/;

function backend() {
  return supabase.isConfigured() ? 'supabase' : 'file';
}

/**
 * Lowercased and trimmed before anything else, so `A@B.com` and `a@b.com `
 * cannot become two rows. Returns null for anything that is not an address,
 * rather than trying to repair what the visitor typed.
 */
function cleanEmail(value) {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase().slice(0, MAX_EMAIL_LENGTH);
  return email.length >= 6 && EMAIL_SHAPE.test(email) ? email : null;
}

/* ------------------------------ file driver ------------------------------ */

function loadFile() {
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

const fileDriver = {
  async add(email) {
    const rows = loadFile();
    if (!rows.some(r => r.email === email)) {
      rows.push({ email, created_at: new Date().toISOString() });
      fs.mkdirSync(path.dirname(FILE), { recursive: true });
      const tmp = `${FILE}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(rows, null, 2), 'utf8');
      fs.renameSync(tmp, FILE);
    }
    return { email };
  },
};

/* ---------------------------- supabase driver ---------------------------- */

const supabaseDriver = {
  /**
   * merge-duplicates makes a repeat signup a no-op instead of a unique-key
   * error, so the endpoint can answer the same way either way — which is what
   * a visitor who has been on the list since last month should hear.
   */
  async add(email) {
    const [created] = await supabase.insert(TABLE, { email }, { upsert: true });
    return created || { email };
  },
};

function driver() {
  return backend() === 'supabase' ? supabaseDriver : fileDriver;
}

module.exports = {
  backend,
  cleanEmail,
  add: email => driver().add(email),
};
