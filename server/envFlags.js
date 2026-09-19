/**
 * Many of this project's .env values ship as literal placeholders
 * (e.g. WEBHOOK_SECRET=your_webhook_secret_here). Treating those as
 * "configured" produces failures that look like a broken integration rather
 * than a missing value, so check the shape as well as the presence.
 *
 * The patterns are deliberately unanchored: real secrets are random hex or
 * base64 and never begin with a doc-style word. A genuine value that happens
 * to start with one is rejected too, which is the safe direction — it warns
 * instead of silently accepting an unsigned-looking config.
 */
const PLACEHOLDER_PREFIX = /^(your|yours?|changeme|change[_-]?me|change[_-]?to|replace|placeholder|sample|dummy|example|test|todo|fake|xxx+|<)/i;
const PLACEHOLDER_SUFFIX = /[_-]here\b|[_-]goes[_-]?here|please[_-]/i;

function isConfigured(value) {
  if (typeof value !== 'string') return false;
  const s = value.trim();
  if (!s) return false;
  if (PLACEHOLDER_PREFIX.test(s) || PLACEHOLDER_SUFFIX.test(s)) return false;
  return s.length >= 8;
}

module.exports = { isConfigured };
