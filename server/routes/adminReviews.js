/**
 * Review moderation queue — the only place a review becomes public.
 *
 * Also doubles as the "paste it in yourself" workflow the client asked for:
 * `save` accepts edited text, so a review copied from WhatsApp or an email can
 * be typed straight in and approved in one action.
 */
const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();

const admin = require('../adminAuth');
const cache = require('../cache');
const store = require('../reviews/store');
const { validate } = require('../reviews/schema');
const { serverError } = require('../errorResponse');

const STATUSES = new Set(['pending', 'approved', 'rejected']);

// One password, no accounts: the gate is only as strong as its resistance to
// guessing.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many attempts. Please wait fifteen minutes.' },
});

function present(row) {
  return {
    id: row.id,
    createdAt: row.created_at,
    status: row.status,
    productHandle: row.product_handle || null,
    productTitle: row.product_title || null,
    author: row.author,
    country: row.country || null,
    rating: Number(row.rating),
    title: row.title || null,
    body: row.body,
  };
}

router.post('/login', loginLimiter, (req, res) => {
  if (!admin.enabled()) {
    return res.status(503).json({ ok: false, error: admin.reason() });
  }
  if (!admin.checkPassword((req.body || {}).password)) {
    return res.status(401).json({ ok: false, error: 'That password is not right.' });
  }
  res.setHeader('Set-Cookie', admin.sessionCookie(req, admin.issueToken(), admin.SESSION_HOURS * 3600));
  res.json({ ok: true, signedIn: true });
});

router.post('/logout', (req, res) => {
  res.setHeader('Set-Cookie', admin.clearCookie());
  res.json({ ok: true, signedIn: false });
});

/** Lets the page decide between the login box and the queue without exposing anything. */
router.get('/session', (req, res) => {
  res.json({ ok: true, enabled: admin.enabled(), signedIn: admin.readSession(req) });
});

router.get('/', admin.requireAdmin, async (req, res) => {
  try {
    const status = String(req.query.status || '');
    const filter = STATUSES.has(status) ? status : null;
    const page = Math.max(0, parseInt(req.query.page, 10) || 0);
    const { rows, total } = await store.adminList({ status: filter, limit: 200, offset: page * 200 });
    res.json({ ok: true, backend: store.backend(), status: filter, total, reviews: rows.map(present) });
  } catch (error) {
    serverError(res, 'admin.reviews.list', error, 'The moderation queue could not be loaded.');
  }
});

/**
 * Paste a review the customer sent by email, WhatsApp or Instagram. An
 * operator writing it in *is* the approval, so this defaults to published.
 */
router.post('/', admin.requireAdmin, async (req, res) => {
  try {
    const { errors, row } = validate(req.body);
    if (errors.length) return res.status(400).json({ ok: false, error: errors.join(' ') });

    const created = await store.insert({ ...row, status: row.status || 'approved' });
    cache.invalidate('reviews');

    res.status(201).json({ ok: true, review: present(created) });
  } catch (error) {
    serverError(res, 'admin.reviews.create', error, 'The review could not be saved. Please try again.');
  }
});

router.post('/:id', admin.requireAdmin, async (req, res) => {
  const { id } = req.params;
  const action = String((req.body || {}).action || '');

  try {
    const existing = await store.getById(id);
    if (!existing) return res.status(404).json({ ok: false, error: 'That review no longer exists.' });

    let updated = null;
    let removed = false;

    if (action === 'approve') {
      updated = await store.setStatus(id, 'approved');
    } else if (action === 'reject') {
      updated = await store.setStatus(id, 'rejected');
    } else if (action === 'undo') {
      updated = await store.setStatus(id, 'pending');
    } else if (action === 'save') {
      const { errors, row } = validate(req.body, { requireComplete: true });
      if (errors.length) return res.status(400).json({ ok: false, error: errors.join(' ') });
      const status = String(req.body.status || existing.status);
      updated = await store.patch(id, { ...row, status: STATUSES.has(status) ? status : existing.status });
    } else if (action === 'delete') {
      removed = await store.remove(id);
    } else {
      return res.status(400).json({ ok: false, error: 'Unknown action.' });
    }

    // The public listing changed, so every cached copy of it is now stale.
    cache.invalidate('reviews');

    res.json({ ok: true, removed, review: updated ? present(updated) : null });
  } catch (error) {
    if (error && error.badRequest) {
      return res.status(400).json({ ok: false, error: 'That review id is not valid.' });
    }
    serverError(res, 'admin.reviews.action', error, 'That action could not be saved. Please try again.');
  }
});

/** Backup/export so approved reviews can be snapshotted outside the database. */
router.get('/export', admin.requireAdmin, async (req, res) => {
  try {
    const rows = await store.listApproved({ limit: 1000 });
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="emm-luxury-hair-reviews.json"');
    res.send(JSON.stringify({ exportedAt: new Date().toISOString(), reviews: rows.map(present) }, null, 2));
  } catch (error) {
    serverError(res, 'admin.reviews.export', error, 'The export could not be built.');
  }
});

module.exports = router;
