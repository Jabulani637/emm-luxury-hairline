/**
 * Injects machine-readable page metadata into a static HTML file.
 *
 * The storefront is a hand-written HTML frontend whose product and collection
 * content is drawn by JavaScript after load, so a crawler sees a generic title
 * and no product data. Rather than duplicate meta tags across 9 files, every
 * page is served through here: the existing <title> and description are reused
 * as defaults, and anything the caller passes overrides them.
 */

const SITE_NAME = 'Emm Luxury Hair';

function escapeAttr(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// </script> inside a JSON-LD string would terminate the block early, so angle
// brackets are escaped as unicode sequences, which JSON parsers accept.
function jsonLdScript(data) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return `<script type="application/ld+json">${json}</script>`;
}

function readExisting(html, pattern) {
  const hit = html.match(pattern);
  return hit ? hit[1].trim() : '';
}

function stripExisting(html) {
  return html
    .replace(/\s*<title>[\s\S]*?<\/title>/i, '')
    .replace(/\s*<meta[^>]+\bname=["']description["'][^>]*>/i, '')
    .replace(/\s*<meta[^>]+\bproperty=["']og:[^"']+["'][^>]*>/i, '')
    .replace(/\s*<meta[^>]+\bproperty=["']twitter:[^"']+["'][^>]*>/i, '')
    .replace(/\s*<meta[^>]+\bname=["']twitter:[^"']+["'][^>]*>/i, '')
    .replace(/\s*<link[^>]+\brel=["']canonical["'][^>]*>/i, '')
    .replace(/\s*<meta[^>]+\bname=["']robots["'][^>]*>/i, '');
}

/**
 * @param html       full HTML document
 * @param seo.title        page title; falls back to the title already in the file
 * @param seo.description  meta description; falls back to the one already in the file
 * @param seo.canonical    absolute URL for this page
 * @param seo.ogImage      absolute URL; falls back to siteImage
 * @param seo.ogType       'website' | 'product'
 * @param seo.noindex      true to keep the page out of search results
 * @param seo.jsonLd       array of schema.org objects
 */
function injectHead(html, seo) {
  if (typeof html !== 'string' || html.indexOf('</head>') === -1) return html;

  const existingTitle = readExisting(html, /<title>([\s\S]*?)<\/title>/i);
  const existingDescription = readExisting(html, /<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i);

  const title = seo.title || existingTitle || SITE_NAME;
  const description = seo.description || existingDescription || '';
  const ogImage = seo.ogImage || seo.siteImage || '';
  const robots = seo.noindex ? 'noindex, follow' : 'index, follow';

  const tags = [
    `<title>${escapeAttr(title)}</title>`,
    description ? `<meta name="description" content="${escapeAttr(description)}">` : '',
    `<meta name="robots" content="${robots}">`,
    seo.canonical ? `<link rel="canonical" href="${escapeAttr(seo.canonical)}">` : '',
    `<meta property="og:site_name" content="${SITE_NAME}">`,
    `<meta property="og:title" content="${escapeAttr(title)}">`,
    description ? `<meta property="og:description" content="${escapeAttr(description)}">` : '',
    ogImage ? `<meta property="og:image" content="${escapeAttr(ogImage)}">` : '',
    `<meta property="og:type" content="${escapeAttr(seo.ogType || 'website')}">`,
    seo.canonical ? `<meta property="og:url" content="${escapeAttr(seo.canonical)}">` : '',
    `<meta name="twitter:card" content="${ogImage ? 'summary_large_image' : 'summary'}">`,
    `<meta name="twitter:title" content="${escapeAttr(title)}">`,
    description ? `<meta name="twitter:description" content="${escapeAttr(description)}">` : '',
    ogImage ? `<meta name="twitter:image" content="${escapeAttr(ogImage)}">` : '',
    ...(seo.jsonLd || []).map(jsonLdScript),
  ].filter(Boolean).join('\n    ');

  return stripExisting(html).replace(/<\/head>/i, `    ${tags}\n  </head>`);
}

module.exports = { injectHead, escapeAttr, jsonLdScript, SITE_NAME };
