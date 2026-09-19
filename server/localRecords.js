/**
 * Best-effort local mirror of records that Shopify owns.
 *
 * Shopify is the source of truth. These files exist so the data is convenient
 * to inspect locally, and so a custom-order or enquiry survives even if the
 * Admin API write later needs re-checking. On Render's free plan the
 * filesystem is wiped on every deploy, so NOTHING here may be treated as
 * durable storage.
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.LOCAL_DATA_DIR || path.join(__dirname, '..', 'data');

function dirFor(kind) {
  const safe = String(kind).replace(/[^a-z0-9_-]/gi, '');
  return path.join(DATA_DIR, safe);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Write (or overwrite) one record as `<id>.json`. Returns the path, or null on failure. */
function saveRecord(kind, id, record) {
  try {
    const safeId = String(id).replace(/[^a-z0-9._-]/gi, '').slice(0, 120);
    if (!safeId) return null;
    const file = path.join(ensureDir(dirFor(kind)), `${safeId}.json`);
    fs.writeFileSync(file, JSON.stringify(record, null, 2), 'utf8');
    return file;
  } catch (err) {
    console.error(`[localRecords] Could not save ${kind}/${id}:`, err.message);
    return null;
  }
}

/** Append one line to a monthly JSONL log. Returns true on success. */
function appendEvent(kind, event) {
  try {
    const stamp = new Date().toISOString().slice(0, 7);
    const file = path.join(ensureDir(dirFor(kind)), `events-${stamp}.jsonl`);
    fs.appendFileSync(file, JSON.stringify(event) + '\n', 'utf8');
    return true;
  } catch (err) {
    console.error(`[localRecords] Could not append ${kind} event:`, err.message);
    return false;
  }
}

module.exports = { saveRecord, appendEvent, DATA_DIR };
