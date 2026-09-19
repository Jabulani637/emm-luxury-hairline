/**
 * Minimal Supabase PostgREST client.
 *
 * The browser never talks to Supabase — every call comes from this server using
 * the project's secret key, which bypasses row-level security. That key must
 * never appear in a response body, a log line, or client-side JS, so this
 * module deliberately throws sanitised Errors instead of the original axios
 * error (which carries the request headers).
 */
const axios = require('axios');

const URL = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
const KEY = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const TIMEOUT_MS = parseInt(process.env.SUPABASE_TIMEOUT_MS || '8000', 10);

function isConfigured() {
  return Boolean(KEY && /^https:\/\/[a-z0-9.-]+\.supabase\.co$/i.test(URL));
}

function configError() {
  if (!URL) return 'SUPABASE_URL is not set';
  if (!/^https:\/\/[a-z0-9.-]+\.supabase\.co$/i.test(URL)) return 'SUPABASE_URL is not an https://<ref>.supabase.co project URL';
  if (!KEY) return 'SUPABASE_SECRET_KEY is not set';
  return null;
}

function describeError(err) {
  const resp = err && err.response;
  if (!resp) {
    if (err && (err.code === 'ECONNABORTED' || /timeout/i.test(err.message || ''))) return 'Supabase request timed out';
    return (err && err.message) || 'Supabase request failed';
  }
  let detail = resp.data;
  if (detail && typeof detail === 'object') detail = detail.message || detail.error || JSON.stringify(detail);
  return `Supabase ${resp.status}: ${String(detail || '').slice(0, 300)}`;
}

async function request(path, { method = 'GET', params, data, prefer } = {}) {
  if (!isConfigured()) throw new Error(configError() || 'Supabase is not configured');

  const headers = {
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (prefer) headers.Prefer = prefer;

  try {
    const res = await axios({
      method,
      url: `${URL}/rest/v1/${path}`,
      params,
      data,
      headers,
      timeout: TIMEOUT_MS,
      validateStatus: () => true,
    });
    if (res.status >= 400) {
      const body = res.data;
      const detail = body && typeof body === 'object'
        ? (body.message || body.error || JSON.stringify(body))
        : String(body || '');
      throw Object.assign(new Error(`Supabase ${res.status}: ${String(detail).slice(0, 300)}`), { status: res.status });
    }
    // 204 No Content (DELETE without Prefer) and empty INSERT results.
    return { rows: Array.isArray(res.data) ? res.data : (res.data === '' ? [] : [res.data]), res };
  } catch (err) {
    if (err && err.status) throw err;
    throw new Error(describeError(err));
  }
}

module.exports = {
  isConfigured,
  configError,
  describeError,

  /** SELECT with PostgREST filters. `total` is the full row count when asked for. */
  async select(table, params, { count = false } = {}) {
    const prefer = count ? 'count=exact' : undefined;
    const { rows, res } = await request(table, { params, prefer });
    let total = null;
    if (count) {
      const match = /\/(\d+)\s*$/.exec(String(res.headers['content-range'] || ''));
      if (match) total = parseInt(match[1], 10);
    }
    return { rows, total };
  },

  async insert(table, rows, { representation = true } = {}) {
    const prefer = representation ? 'return=representation' : 'return=minimal';
    const { rows: out } = await request(table, { method: 'POST', data: rows, prefer });
    return out;
  },

  async update(table, filter, patch) {
    const { rows } = await request(table, { method: 'PATCH', params: filter, data: patch, prefer: 'return=representation' });
    return rows;
  },

  async remove(table, filter) {
    const { rows } = await request(table, { method: 'DELETE', params: filter, prefer: 'return=representation' });
    return rows;
  },
};
