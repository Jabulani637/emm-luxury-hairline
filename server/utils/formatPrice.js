/**
 * Format price for display
 */
function formatPrice(amount, currencyCode = 'USD') {
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode,
  }).format(parseFloat(amount));

  return formatted;
}

module.exports = { formatPrice };
