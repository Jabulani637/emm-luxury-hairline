/**
 * Public review endpoints.
 *
 * Nothing a visitor writes ever reaches the site: submissions are stored as
 * `pending` and only the moderation queue can flip them to `approved`. Reads
 * therefore serve approved rows only, cached under the `reviews` bucket, which
 * is invalidated by moderation actions and NOT by submissions — otherwise
 * posting reviews would be a cheap way to defeat the cache.
 */
const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();

const cache = require('../cache');
const store = require('../reviews/store');
const { validate, clean, cleanHandle } = require('../reviews/schema');
const { serverError } = require('../errorResponse');

const MAX_VISIBLE = 100;

// Applied to the write route alone: mounting it on the whole router would also
// charge every page view's read against the same budget.
const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'You have sent several reviews recently. Please try again later.' },
});

router.get('/', async (req, res) => {
  try {
    const handle = cleanHandle(req.query.handle);
    const askedForProduct = typeof req.query.handle === 'string' && req.query.handle.length > 0;
    const requested = parseInt(req.query.first, 10);
    const limit = Number.isInteger(requested) && requested > 0 ? Math.min(requested, MAX_VISIBLE) : MAX_VISIBLE;

    if (askedForProduct && !handle) {
      return res.json({ stats: { count: 0, average: 0, breakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } }, reviews: [] });
    }

    const key = `reviews:public:${handle || 'all'}:${limit}`;

    const { rows, stats } = await cache.wrap(key, () => store.approvedWithStats(handle), 120);

    res.json({
      stats,
      reviews: rows.slice(0, limit).map(r => ({
        id: r.id,
        createdAt: r.created_at,
        productHandle: r.product_handle || null,
        productTitle: r.product_title || null,
        author: r.author,
        country: r.country || null,
        rating: Number(r.rating),
        title: r.title || null,
        body: r.body,
      })),
    });
  } catch (error) {
    serverError(res, 'reviews.list', error, 'Reviews are unavailable right now. Please try again shortly.');
  }
});

router.post('/', submitLimiter, async (req, res) => {
  const body = req.body || {};

  try {
    if (clean(body.website, 10)) {
      // Hidden field a real person never fills in. Pretend it worked.
      return res.status(201).json({ ok: true, message: 'Thank you! Your review is awaiting approval.' });
    }

    const { errors, row } = validate(body);
    if (errors.length) {
      return res.status(400).json({ ok: false, error: errors.join(' ') });
    }

    await store.insert({ ...row, status: 'pending' });

    res.status(201).json({
      ok: true,
      message: 'Thank you! Your review has been received and will appear once our team has checked it.',
    });
  } catch (error) {
    serverError(res, 'reviews.create', error, 'We could not save your review just now. Please try again.');
  }
});

module.exports = router;
