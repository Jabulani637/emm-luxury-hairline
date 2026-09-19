/**
 * What each page says about itself: title, description, canonical URL, Open
 * Graph tags, structured data, and the resulting set of indexable URLs.
 *
 * This is deliberately a separate module rather than part of the router. The
 * pages are served twice — live from Express, and as files built into public/
 * for the static frontend host — and two hosts describing the same page
 * differently is precisely what a canonical link exists to prevent. Both sides
 * read these functions, so they cannot drift.
 */
const { SITE_NAME } = require('./htmlSeo');
const { getProducts } = require('./shopify/queries/getProducts');
const { getCollections } = require('./shopify/queries/getCollections');
const { getCollection } = require('./shopify/queries/getCollection');

const SITE_URL = (process.env.FRONTEND_URL || 'https://www.emmluxuryhair.com').replace(/\/$/, '');
const FALLBACK_IMAGE = `${SITE_URL}/assets/ad-images/beautiful_hair_1.jpg`;

// Static pages: URL path → file, with the copy search engines are shown.
const PAGES = {
  '/': {
    file: 'index.html',
    description: 'Hand-picked raw and virgin human hair wigs, bundles and ready-to-ship styles. Shop Emm Luxury Hair, or request a custom wig built to your specification.',
    ogType: 'website',
  },
  '/cart': {
    file: 'cart.html',
    description: 'Review the items in your bag before checking out at Emm Luxury Hair.',
    ogType: 'website',
    noindex: true,
  },
  '/pages/about': {
    file: 'pages/about.html',
    title: 'About Us — Who We Are and What We Stock | Emm Luxury Hair',
    description: 'Emm Luxury Hair is a UK-based human hair business selling raw and virgin hair wigs and bundles worldwide. What we stock, the standards we hold it to, and how an order works.',
    ogType: 'website',
  },
  '/pages/reviews': {
    file: 'pages/reviews.html',
    title: 'Customer Reviews | Emm Luxury Hair',
    description: 'Genuine customer reviews of Emm Luxury Hair wigs and bundles, each one checked before it is published. Read them, or write your own.',
    ogType: 'website',
  },
  '/pages/custom-order': {
    file: 'pages/custom-order.html',
    title: 'Request a Custom Wig — Built to Your Specification | Emm Luxury Hair',
    description: 'Send Emm Luxury Hair the style, length, colour and budget you want and we will source or build it, then email you a payment link.',
    ogType: 'website',
  },
  '/pages/contact': {
    file: 'pages/contact.html',
    description: 'Contact Emm Luxury Hair about an order, a wig specification, shipping or returns. WhatsApp, email or send a message from the form.',
    ogType: 'website',
  },
  '/pages/shipping-returns': {
    file: 'pages/shipping-returns.html',
    title: 'Shipping & Returns Policy | Emm Luxury Hair',
    description: 'How long Emm Luxury Hair orders take to arrive, what shipping costs, and how to return or exchange a wig.',
    ogType: 'website',
  },
  '/pages/faqs': {
    file: 'pages/faqs.html',
    title: 'Frequently Asked Questions | Emm Luxury Hair',
    description: 'Answers about wig quality, lace, lengths, colour matching, ordering and delivery at Emm Luxury Hair.',
    ogType: 'website',
  },
  '/pages/wig-care': {
    file: 'pages/wig-care.html',
    title: 'Wig Care Guide — How to Make Human Hair Last | Emm Luxury Hair',
    description: 'How to wash, detangle, store and restyle a human hair wig so it keeps its quality for as long as possible.',
    ogType: 'website',
  },
};

// Legacy addresses, mapped to the clean URL that replaced them. Both hosts have
// to agree on this table: the file host serves the .html files too, so anything
// missing here would be a second indexable copy of a page.
const LEGACY_PAGES = {
  '/index.html': '/',
  '/cart.html': '/cart',
  '/pages/about.html': '/pages/about',
  '/pages/reviews.html': '/pages/reviews',
  '/admin/reviews.html': '/admin/reviews',
  '/pages/custom-order.html': '/pages/custom-order',
  '/pages/contact.html': '/pages/contact',
  '/pages/shipping-returns.html': '/pages/shipping-returns',
  '/pages/faqs.html': '/pages/faqs',
  '/pages/wig-care.html': '/pages/wig-care',
  '/404.html': '/404',
};

function slugifyHandle(value) {
  if (typeof value !== 'string') return null;
  const s = value.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]{0,159}$/.test(s) ? s : null;
}

/** The canonical URL for a product or collection, given its handle. */
function pageUrl(kind, handle) {
  const clean = slugifyHandle(handle);
  if (!clean) return null;
  return `${SITE_URL}/${kind}/${clean}`;
}

/** The repo-relative file a product or collection handle is written to. */
function pageFile(kind, handle) {
  const clean = slugifyHandle(handle);
  return clean ? `${kind}/${clean}.html` : null;
}

/**
 * Search snippets and link previews show this verbatim, so it must not end
 * mid-word the way a plain slice would.
 */
function summarise(text, limit = 300) {
  const flat = String(text || '').replace(/\s+/g, ' ').trim();
  if (flat.length <= limit) return flat;
  const cut = flat.slice(0, limit);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > 120 ? lastSpace : limit).trim()}…`;
}

function siteSchema() {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: SITE_NAME,
      url: `${SITE_URL}/`,
      publisher: { '@id': `${SITE_URL}/#organization` },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: `${SITE_URL}/`,
      logo: `${SITE_URL}/assets/apple-touch-icon.png`,
      image: FALLBACK_IMAGE,
      description: 'Human hair wigs, bundles and extensions — raw and virgin hair, ready to ship.',
    },
  ];
}

/** Head metadata for one of the fixed pages in PAGES. */
function staticMeta(route) {
  const page = PAGES[route];
  if (!page) return null;
  return {
    title: page.title,
    description: page.description,
    ogType: page.ogType,
    noindex: page.noindex,
    canonical: SITE_URL + route,
    ogImage: FALLBACK_IMAGE,
    siteImage: FALLBACK_IMAGE,
    jsonLd: route === '/' ? siteSchema() : undefined,
  };
}

/**
 * Head metadata for a product. `rating` is the approved-review stats for this
 * handle, or null — an aggregateRating built on reviews nobody submitted is a
 * manual penalty, so it is only included when there is a real count.
 */
function productMeta(product, rating) {
  const canonical = pageUrl('products', product.handle);
  const images = (product.images || []).map(i => i.url).filter(Boolean);
  const price = product.priceRange?.minVariantPrice;
  const summary = summarise(product.description);

  return {
    title: `${product.title} | ${SITE_NAME}`,
    description: summary || `${product.title} — ${SITE_NAME}.`,
    canonical,
    ogType: 'product',
    ogImage: images[0] || FALLBACK_IMAGE,
    siteImage: FALLBACK_IMAGE,
    jsonLd: [{
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: product.title,
      description: summary || `${product.title} by ${SITE_NAME}.`,
      sku: product.handle,
      brand: { '@type': 'Brand', name: SITE_NAME },
      url: canonical,
      image: images,
      ...(rating ? {
        aggregateRating: {
          '@type': 'AggregateRating',
          ratingValue: rating.average,
          reviewCount: rating.count,
          bestRating: 5,
          worstRating: 1,
        },
      } : {}),
      offers: {
        '@type': 'Offer',
        url: canonical,
        priceCurrency: price?.currencyCode || 'GBP',
        price: price ? price.amount : undefined,
        availability: product.availableForSale
          ? 'https://schema.org/InStock'
          : 'https://schema.org/OutOfStock',
        itemCondition: 'https://schema.org/NewCondition',
      },
    }],
  };
}

/** Head metadata for a collection, including the virtual "all" catalogue. */
function collectionMeta({ handle, title, description, products }) {
  const canonical = pageUrl('collections', handle);
  const summary = summarise(description)
    || (handle === 'all'
      ? `Every wig, bundle and extension currently on sale at ${SITE_NAME}, including ready-to-ship styles.`
      : `The ${title} range at ${SITE_NAME} — human hair wigs and extensions.`);

  return {
    title: `${title} | ${SITE_NAME}`,
    description: summary,
    canonical,
    ogType: 'website',
    ogImage: products[0]?.images?.[0]?.url || FALLBACK_IMAGE,
    siteImage: FALLBACK_IMAGE,
    jsonLd: [{
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: title,
      description: summary,
      url: canonical,
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: products.length,
        itemListElement: products.slice(0, 12).map((p, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: p.title,
          url: pageUrl('products', p.handle) || undefined,
        })),
      },
    }],
  };
}

/**
 * Resolves a handle against Shopify and returns its head metadata, so the
 * request handler and the static build describe a collection identically.
 * Returns { unavailable: true } when Shopify could not be reached — a retryable
 * failure, which is a different answer from a handle that does not exist.
 */
async function collectionMetaFor(handle) {
  const prettified = handle.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  let title;
  let description = '';
  let products = [];

  try {
    if (handle === 'all') {
      // Shopify's virtual catalogue collection.
      title = 'All Products';
      products = await getProducts({ first: 24, sortKey: 'BEST_SELLING' });
    } else {
      const collection = await getCollection(handle, 24);
      if (collection) {
        title = collection.title;
        description = collection.description || '';
        products = collection.products;
      } else {
        // Unknown handle: the client-side page falls back to showing the whole
        // catalogue, so do the same here rather than describing a different page.
        title = prettified;
        products = await getProducts({ first: 24, sortKey: 'BEST_SELLING' });
      }
    }
  } catch (err) {
    console.error('[pageMeta] collection fetch failed', handle, err.message);
    return { unavailable: true };
  }

  return collectionMeta({ handle, title, description, products });
}

/** Every indexable page, so the sitemap and the pages agree on the URL set. */
async function listSitemapUrls() {
  const urls = Object.keys(PAGES).filter(p => !PAGES[p].noindex).map(p => ({
    loc: SITE_URL + p,
    priority: p === '/' ? '1.0' : '0.7',
  }));

  const [products, collections] = await Promise.all([
    getProducts({ first: 250, sortKey: 'UPDATED_AT', reverse: true }),
    getCollections(100),
  ]);

  for (const p of products) {
    const loc = pageUrl('products', p.handle);
    if (loc) urls.push({ loc, lastmod: p.updatedAt, priority: '0.8' });
  }
  // Shopify's virtual "all" collection is never returned by the query, but the
  // page exists and the navigation links to it.
  for (const handle of new Set(['all', ...collections.map(c => c.handle)])) {
    const loc = pageUrl('collections', handle);
    if (loc) urls.push({ loc, priority: '0.6' });
  }

  return urls;
}

function escapeXml(value) {
  return String(value).replace(/[<>&'"]/g, c => (
    { '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]
  ));
}

function robotsTxt() {
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /cart',
    'Disallow: /admin',
    'Disallow: /api/',
    'Disallow: /webhooks/',
    '',
    `Sitemap: ${SITE_URL}/sitemap.xml`,
    '',
  ].join('\n');
}

function sitemapXml(urls) {
  const body = urls.map(u => [
    '  <url>',
    `    <loc>${escapeXml(u.loc)}</loc>`,
    u.lastmod ? `    <lastmod>${escapeXml(u.lastmod)}</lastmod>` : '',
    `    <changefreq>${u.loc.includes('/products/') ? 'weekly' : 'daily'}</changefreq>`,
    `    <priority>${u.priority}</priority>`,
    '  </url>',
  ].filter(Boolean).join('\n')).join('\n');

  return '<?xml version="1.0" encoding="UTF-8"?>\n'
    + `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

module.exports = {
  SITE_URL,
  FALLBACK_IMAGE,
  PAGES,
  LEGACY_PAGES,
  slugifyHandle,
  pageUrl,
  pageFile,
  summarise,
  siteSchema,
  staticMeta,
  productMeta,
  collectionMeta,
  collectionMetaFor,
  listSitemapUrls,
  robotsTxt,
  sitemapXml,
};
