/**
 * Review storage with two interchangeable drivers behind one interface.
 *
 *  - `supabase` — the real store. Used as soon as SUPABASE_URL and
 *    SUPABASE_SECRET_KEY exist. Survives every deploy.
 *  - `file`     — `data/reviews/reviews.json`. Exists so the feature is
 *    testable before an account exists and so a misconfigured production build
 *    still accepts submissions instead of 500ing. Render's free plan wipes this
 *    file on every deploy, so it is never the intended long-term home.
 *
 * Row shape is identical in both: id, created_at, product_handle, product_title,
 * author, country, rating, title, body, status.
 */
const fs = require('fs');
const path = require('path');

const supabase = require('../db/supabase');
const { DATA_DIR } = require('../localRecords');

const TABLE = process.env.SUPABASE_REVIEWS_TABLE || 'product_reviews';
const STATUSES = new Set(['pending', 'approved', 'rejected']);
const FILE = path.join(DATA_DIR, 'reviews', 'reviews.json');

function backend() {
  return supabase.isConfigured() ? 'supabase' : 'file';
}

/* ------------------------------ file driver ------------------------------ */

let fileCache = null;

function loadFile() {
  if (fileCache) return fileCache;
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    fileCache = Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    fileCache = [];
  }
  return fileCache;
}

function saveFile(rows) {
  fileCache = rows;
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = `${FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(rows, null, 2), 'utf8');
  fs.renameSync(tmp, FILE);
}

const fileDriver = {
  async listApproved({ handle = null, limit = 200 } = {}) {
    return loadFile()
      .filter(r => r.status === 'approved' && (!handle || r.product_handle === handle))
      .sort(byNewest)
      .slice(0, limit);
  },
  async insert(row) {
    const rows = loadFile();
    const stored = {
      ...row,
      id: Date.now(),
      created_at: row.created_at || new Date().toISOString(),
    };
    rows.push(stored);
    saveFile(rows);
    return stored;
  },
  async adminList({ status = null, limit = 200, offset = 0 } = {}) {
    const all = loadFile().filter(r => !status || r.status === status).sort(byNewest);
    return { rows: all.slice(offset, offset + limit), total: all.length };
  },
  async getById(id) {
    return loadFile().find(r => String(r.id) === String(id)) || null;
  },
  async patch(id, fields) {
    const rows = loadFile();
    const row = rows.find(r => String(r.id) === String(id));
    if (!row) return null;
    Object.assign(row, fields);
    saveFile(rows);
    return row;
  },
  async remove(id) {
    const rows = loadFile();
    const next = rows.filter(r => String(r.id) !== String(id));
    if (next.length === rows.length) return false;
    saveFile(next);
    return true;
  },
};

function byNewest(a, b) {
  return String(b.created_at).localeCompare(String(a.created_at));
}

/* ---------------------------- supabase driver ---------------------------- */

const COLUMNS = 'id,created_at,product_handle,product_title,author,country,rating,title,body,status';

function numericId(id) {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) {
    throw Object.assign(new Error('Review id must be a positive integer'), { badRequest: true });
  }
  return n;
}

const supabaseDriver = {
  async listApproved({ handle = null, limit = 200 } = {}) {
    const params = {
      select: COLUMNS,
      status: 'eq.approved',
      order: 'created_at.desc',
      limit,
    };
    if (handle) params.product_handle = `eq.${handle}`;
    const { rows } = await supabase.select(TABLE, params);
    return rows;
  },
  async insert(row) {
    const [created] = await supabase.insert(TABLE, row);
    return created || row;
  },
  async adminList({ status = null, limit = 200, offset = 0 } = {}) {
    const params = { select: COLUMNS, order: 'created_at.desc', limit, offset };
    if (status) params.status = `eq.${status}`;
    const { rows, total } = await supabase.select(TABLE, params, { count: true });
    return { rows, total: total === null ? rows.length : total };
  },
  async getById(id) {
    const { rows } = await supabase.select(TABLE, { select: COLUMNS, id: `eq.${numericId(id)}`, limit: 1 });
    return rows[0] || null;
  },
  async patch(id, fields) {
    const rows = await supabase.update(TABLE, { id: `eq.${numericId(id)}` }, fields);
    return rows[0] || null;
  },
  async remove(id) {
    const rows = await supabase.remove(TABLE, { id: `eq.${numericId(id)}` });
    return rows.length > 0;
  },
};

function driver() {
  return backend() === 'supabase' ? supabaseDriver : fileDriver;
}

/* ------------------------------- shared API ------------------------------ */

/** Aggregate over the same rows the shopper is about to be shown. */
function summarise(rows) {
  const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let sum = 0;
  for (const row of rows) {
    const star = Math.min(5, Math.max(1, Number(row.rating) || 0));
    breakdown[star] += 1;
    sum += star;
  }
  return {
    count: rows.length,
    average: rows.length ? Math.round((sum / rows.length) * 10) / 10 : 0,
    breakdown,
  };
}

async function approvedWithStats(handle = null) {
  const rows = await driver().listApproved({ handle });
  return { rows, stats: summarise(rows) };
}

module.exports = {
  backend,
  STATUSES,
  summarise,
  approvedWithStats,
  listApproved: options => driver().listApproved(options || {}),
  adminList: options => driver().adminList(options || {}),
  getById: id => driver().getById(id),
  insert: row => driver().insert(row),
  patch: (id, fields) => driver().patch(id, fields),
  setStatus: (id, status) => driver().patch(id, { status }),
  remove: id => driver().remove(id),
};
