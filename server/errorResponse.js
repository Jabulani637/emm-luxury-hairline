/**
 * Sends one generic 500 to the browser while logging the real cause server-side.
 * Raw Shopify/network error text can contain store domains, query fragments and
 * rate-limit detail — none of it belongs in a public JSON response.
 */
function serverError(res, label, error, message = 'Something went wrong on our end. Please try again.') {
  console.error(`[API] ${label} failed:`, error);
  if (!res.headersSent) res.status(500).json({ error: message });
}

module.exports = { serverError };
