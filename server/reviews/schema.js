/**
 * One definition of what a valid review is, shared by the public submit
 * endpoint and the moderation queue so the two can never drift apart.
 */

function clean(value, maxLen) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\x00-\x1F\x7F]/g, ' ').trim().slice(0, maxLen);
}

/** Shopify handles are lowercase words joined by single dashes. */
function cleanHandle(value) {
  const s = clean(value, 160).toLowerCase();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s) ? s : null;
}

/**
 * @returns {{ errors: string[], row: object }} row holds only the columns the
 * table has; anything unrecognised is dropped rather than passed to PostgREST.
 */
function validate(input, { requireComplete = true } = {}) {
  const body = input || {};
  const errors = [];

  const rating = Number.parseInt(body.rating, 10);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    if (requireComplete) errors.push('Please choose a star rating from 1 to 5.');
  }

  const author = clean(body.author, 80);
  if (author.length < 2) {
    if (requireComplete) errors.push('Please tell us your name.');
  }

  const text = clean(body.body, 2000);
  if (text.length < 10) {
    if (requireComplete) errors.push('Please write at least 10 characters about the product.');
  }

  const row = {};
  if (Number.isInteger(rating) && rating >= 1 && rating <= 5) row.rating = rating;
  if (author.length >= 2) row.author = author;
  if (text.length >= 10) row.body = text;

  const title = clean(body.title, 120);
  if (title) row.title = title;

  const country = clean(body.country, 60);
  if (country) row.country = country;

  const handle = cleanHandle(body.productHandle);
  if (handle) row.product_handle = handle;

  const productTitle = clean(body.productTitle, 200);
  if (productTitle) row.product_title = productTitle;

  const status = body.status;
  if (typeof status === 'string' && ['pending', 'approved', 'rejected'].includes(status)) {
    row.status = status;
  }

  return { errors, row };
}

module.exports = { clean, cleanHandle, validate };
