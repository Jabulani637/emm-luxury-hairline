/**
 * /robots.txt and /sitemap.xml.
 *
 * Both are generated rather than committed as static files: the product and
 * collection lists live in Shopify, so a checked-in sitemap would go stale the
 * moment a product was added or deleted. Results ride on the same 'catalog'
 * cache bucket the product reads use, so a webhook invalidates them together.
 */
const express = require('express');
const router = express.Router();
const cache = require('../cache');
const { listSitemapUrls, SITE_URL } = require('./pages');

function escapeXml(value) {
  return String(value).replace(/[<>&'"]/g, c => (
    { '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]
  ));
}

router.get('/robots.txt', (req, res) => {
  res.type('text/plain').send([
    'User-agent: *',
    'Allow: /',
    'Disallow: /cart',
    'Disallow: /admin',
    'Disallow: /api/',
    'Disallow: /webhooks/',
    '',
    `Sitemap: ${SITE_URL}/sitemap.xml`,
    '',
  ].join('\n'));
});

router.get('/sitemap.xml', async (req, res) => {
  try {
    const xml = await cache.wrap('catalog:sitemap', async () => {
      const urls = await listSitemapUrls();
      const body = urls.map(u => [
        '  <url>',
        `    <loc>${escapeXml(u.loc)}</loc>`,
        u.lastmod ? `    <lastmod>${escapeXml(u.lastmod)}</lastmod>` : '',
        `    <changefreq>${u.loc.includes('/products/') ? 'weekly' : 'daily'}</changefreq>`,
        `    <priority>${u.priority}</priority>`,
        '  </url>',
      ].filter(Boolean).join('\n')).join('\n');

      return `<?xml version="1.0" encoding="UTF-8"?>\n`
        + `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
    }, 3600);

    res.type('application/xml').send(xml);
  } catch (err) {
    console.error('[sitemap] build failed:', err.message);
    res.status(500).type('text/plain').send('Sitemap unavailable');
  }
});

module.exports = router;
