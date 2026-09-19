/**
 * /robots.txt and /sitemap.xml.
 *
 * Rendered live here so the lists reflect Shopify within the cache window, and
 * written to public/ by `npm run pages` so the static frontend host has the same
 * two files. Both go through server/pageMeta.js, which is the only reason the
 * committed copies can be trusted to match.
 */
const express = require('express');
const router = express.Router();
const cache = require('../cache');
const { robotsTxt, sitemapXml, listSitemapUrls } = require('../pageMeta');

router.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(robotsTxt());
});

router.get('/sitemap.xml', async (req, res) => {
  try {
    const xml = await cache.wrap('catalog:sitemap', async () => sitemapXml(await listSitemapUrls()), 3600);
    res.type('application/xml').send(xml);
  } catch (err) {
    console.error('[sitemap] build failed:', err.message);
    res.status(500).type('text/plain').send('Sitemap unavailable');
  }
});

module.exports = router;
