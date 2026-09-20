/**
 * Injects machine-readable page metadata into a static HTML file.
 *
 * The storefront is a hand-written HTML frontend whose product and collection
 * content is drawn by JavaScript after load, so a crawler sees a generic title
 * and no product data. Rather than duplicate meta tags across 9 files, every
 * page is served through here: the existing <title> and description are reused
 * as defaults, and anything the caller passes overrides them.
 *
 * Head tags alone were not enough — with the body still empty, a product page
 * had no <h1> and no searchable text in the delivered HTML, so a page that
 * wants body content marks where it goes with `<!--seo-body-->` and the caller
 * supplies it. See pageMeta's productMeta/collectionMeta.
 */

const SITE_NAME = 'Emm Luxury Hair';

// Google Search Console's property token, as issued by its HTML-tag method.
// Public by design — Google reads it out of the page source. The file method
// cannot work here: vercel.json sets cleanUrls, so Vercel answers 404 for the
// literal .html URL Google requests. The two methods issue separate tokens, so
// the name of that downloaded file is not a valid value for this tag.
const GOOGLE_SITE_VERIFICATION = 'gV0ahnV-wy_ScbxL5p_Mz7QH6aXDP72ZntarOJoVsAg';

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
    .replace(/\s*<meta[^>]+\bname=["']robots["'][^>]*>/i, '')
    .replace(/\s*<meta[^>]+\bname=["']google-site-verification["'][^>]*>/i, '');
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
 * @param seo.bodyHtml     HTML to place at the page's `<!--seo-body-->` marker,
 *                         for content the browser would otherwise only build
 *                         from JavaScript after load
 */
function injectSeo(html, seo) {
  if (typeof html !== 'string') return html;

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
    `<meta name="google-site-verification" content="${escapeAttr(GOOGLE_SITE_VERIFICATION)}">`,
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

  // A function replacement, because Shopify copy containing `$&` would otherwise
  // be read as a replacement pattern and inject the matched marker back into it.
  return stripExisting(html)
    .replace(/<\/head>/i, `    ${tags}\n  </head>`)
    .replace(/<!--seo-body-->/g, () => seo.bodyHtml || '');
}

module.exports = { injectSeo, escapeAttr, jsonLdScript, SITE_NAME };
