/**
 * Single-operator admin gate for the review moderation queue.
 *
 * There is no user table on purpose — one password from the environment, a
 * stateless HMAC-signed expiry token in an HttpOnly cookie. It fails CLOSED:
 * with ADMIN_PASSWORD unset every /api/admin route answers 503, so a forgotten
 * env var can never leave the moderation endpoints wide open.
 */
const crypto = require('crypto');
const { isConfigured } = require('./envFlags');

const COOKIE_NAME = 'emm_admin';
const SESSION_HOURS = 12;

function enabled() {
  return isConfigured(process.env.ADMIN_PASSWORD);
}

function reason() {
  return enabled() ? null : 'ADMIN_PASSWORD is not set, so the moderation queue is switched off. Add it to .env (and to Render) to use it.';
}

function signingKey() {
  return crypto.createHash('sha256').update(String(process.env.ADMIN_PASSWORD || ''), 'utf8').digest();
}

function hmac(value) {
  return crypto.createHmac('sha256', signingKey()).update(value).digest('base64url');
}

/** Constant-time compare that does not leak the password's length. */
function matches(secret, candidate) {
  const a = crypto.createHash('sha256').update(String(secret)).digest();
  const b = crypto.createHash('sha256').update(String(candidate == null ? '' : candidate)).digest();
  return crypto.timingSafeEqual(a, b);
}

function checkPassword(candidate) {
  if (!enabled()) return false;
  if (typeof candidate !== 'string' || !candidate) return false;
  return matches(process.env.ADMIN_PASSWORD, candidate);
}

function issueToken() {
  const expires = Date.now() + SESSION_HOURS * 60 * 60 * 1000;
  return `${expires}.${hmac(String(expires))}`;
}

function verifyToken(token) {
  if (!enabled() || typeof token !== 'string') return false;
  const [expires, signature] = token.split('.');
  if (!expires || !signature) return false;
  if (!/^\d+$/.test(expires) || Number(expires) < Date.now()) return false;
  const expected = Buffer.from(hmac(expires));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

function readSession(req) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== COOKIE_NAME) continue;
    return verifyToken(decodeURIComponent(part.slice(eq + 1).trim()));
  }
  return false;
}

function sessionCookie(req, token, maxAgeSeconds) {
  const secure = req.secured === true || req.protocol === 'https' || process.env.NODE_ENV === 'production';
  const bits = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (secure) bits.push('Secure');
  return bits.join('; ');
}

function clearCookie() {
  return `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

function requireAdmin(req, res, next) {
  if (!enabled()) return res.status(503).json({ ok: false, error: reason() });
  if (!readSession(req)) return res.status(401).json({ ok: false, error: 'Please sign in again.' });
  return next();
}

module.exports = {
  enabled,
  reason,
  checkPassword,
  issueToken,
  verifyToken,
  readSession,
  sessionCookie,
  clearCookie,
  requireAdmin,
  COOKIE_NAME,
  SESSION_HOURS,
};
