/**
 * The newsletter signup endpoint. POST only.
 *
 * There is no GET and no admin page on purpose: subscriber addresses are
 * customer PII, and the review queue exists because reviews have to be seen
 * before they are published. Nothing here is ever published, so the list stays
 * where the secret key puts it — in Supabase, read from its table editor.
 */
const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();

const store = require('../subscribers/store');
const { clean } = require('../reviews/schema');
const { serverError } = require('../errorResponse');

// Applied to the write route alone. The storefront's page views must not be
// charged against a visitor's signup budget.
const subscribeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many signups from you today. Please try again later.' },
});

const ACCEPTED = { ok: true, message: 'You are on the list. We will write to you when new pieces arrive.' };

router.post('/', subscribeLimiter, async (req, res) => {
  const body = req.body || {};

  try {
    if (clean(body.website, 10)) {
      // Hidden field a real person never fills in. Pretend it worked.
      return res.status(201).json(ACCEPTED);
    }

    const email = store.cleanEmail(body.email);
    if (!email) {
      return res.status(400).json({ ok: false, error: 'That email address does not look right. Please check it and try again.' });
    }

    await store.add(email);
    res.status(201).json(ACCEPTED);
  } catch (error) {
    serverError(res, 'subscribers.create', error, 'We could not sign you up just now. Please try again.');
  }
});

module.exports = router;
