/**
 * The one product shape every page is built from.
 *
 * Shared by the single-product query (a shopper opening a wig) and the catalogue
 * query (collection grids, search, the static build of up to 250 pages), so
 * every field added here is paid for on every one of those reads — which is why
 * the media list is capped and the metafield identifiers are a fixed set rather
 * than "whatever exists".
 *
 * `images` is derived from `media` rather than queried separately. Storefront
 * exposes both, and two sources for the same pictures is how a page ends up
 * showing one image in the grid and a different one in the preview.
 */

/** Metafields the product page renders, in display order. `custom` is the namespace Shopify's admin offers by default. */
const SPEC_FIELDS = [
  { key: 'wig_type', label: 'Wig Type' },
  { key: 'colour', label: 'Colour' },
  { key: 'length', label: 'Length' },
  { key: 'curl_pattern', label: 'Curl Pattern' },
  { key: 'closure', label: 'Closure' },
  { key: 'density', label: 'Density' },
  { key: 'hair_type', label: 'Hair Type' },
];

/** Longer prose fields, each with its own block on the page rather than a spec row. */
const NOTE_FIELDS = [
  { key: 'processing_time', label: 'Processing Time' },
  { key: 'sizing_guide', label: 'Sizing Guide' },
];

const METAFIELD_IDENTIFIERS = [
  ...SPEC_FIELDS,
  ...NOTE_FIELDS,
].map(f => `{ namespace: "custom", key: "${f.key}" }`).join(', ');

const PRODUCT_FRAGMENT = `
  fragment ProductFields on Product {
    id
    handle
    title
    description
    descriptionHtml
    availableForSale
    updatedAt
    tags
    vendor
    productType
    priceRange {
      minVariantPrice {
        amount
        currencyCode
      }
      maxVariantPrice {
        amount
        currencyCode
      }
    }
    options {
      id
      name
      values
    }
    collections(first: 4) {
      edges {
        node {
          handle
          title
        }
      }
    }
    metafields(identifiers: [${METAFIELD_IDENTIFIERS}]) {
      key
      value
    }
    media(first: 10) {
      nodes {
        __typename
        id
        ... on MediaImage {
          alt
          image {
            url
            width
            height
          }
        }
        ... on Video {
          alt
          previewImage {
            url
          }
          sources {
            url
          }
        }
      }
    }
    variants(first: 100) {
      edges {
        node {
          id
          title
          availableForSale
          price {
            amount
            currencyCode
          }
          compareAtPrice {
            amount
            currencyCode
          }
          selectedOptions {
            name
            value
          }
          image {
            url
            altText
            width
            height
          }
        }
      }
    }
  }
`;

const ALLOWED_TAGS = new Set(['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li', 'h2', 'h3', 'h4', 'span', 'div']);

/**
 * Shopify hands store descriptions back as HTML written by whoever has admin
 * access, and this page is served to shoppers and baked into the static build —
 * so it is treated as untrusted input. Tags outside a small formatting set are
 * dropped, and every attribute goes with them: nothing is allowed to carry an
 * `onclick`, a `src` or a stylesheet.
 *
 * Runs to a fixed point because removing a tag can splice a new one together
 * out of what surrounded it (`<scr<div>ipt>`).
 */
function sanitizeHtml(html) {
  let out = String(html || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|iframe|object|embed|svg)\b[\s\S]*?<\/\1\s*>/gi, '');

  for (let pass = 0; pass < 3; pass += 1) {
    const next = out.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (tag, name) => {
      const lower = name.toLowerCase();
      return ALLOWED_TAGS.has(lower) ? `${tag.startsWith('</') ? '</' : '<'}${lower}>` : '';
    });
    if (next === out) break;
    out = next;
  }

  return out.trim();
}

/**
 * A metafield's `value` is always a string, whatever its admin type: plain text
 * for a single-line field, JSON for the rich-text one. Flattening both to a
 * sentence keeps the renderer from needing to know which was chosen.
 */
function metafieldText(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (raw.startsWith('{')) {
    try {
      const json = JSON.parse(raw);
      const flatten = node => (
        Array.isArray(node) ? node.map(flatten).join(' ')
          : typeof node === 'string' ? node
            : node && typeof node === 'object' ? flatten(node.children ?? node.value ?? '') : ''
      );
      return flatten(json).replace(/\s+/g, ' ').trim();
    } catch {
      return raw;
    }
  }
  return raw;
}

/** Media is images and video; only the pictures have anything to show in a grid. */
function normalizeMedia(nodes) {
  return (nodes || []).map(node => {
    if (node.__typename === 'Video') {
      const source = (node.sources || [])[0];
      return {
        id: node.id,
        type: 'video',
        url: source?.url || node.previewImage?.url || '',
        poster: node.previewImage?.url || '',
        altText: node.alt || '',
      };
    }
    return {
      id: node.id,
      type: 'image',
      url: node.image?.url || '',
      altText: node.alt || '',
      width: node.image?.width || null,
      height: node.image?.height || null,
    };
  }).filter(m => m.url);
}

function normalizeProduct(node) {
  const media = normalizeMedia(node.media?.nodes);
  const metafields = Object.fromEntries((node.metafields || [])
    // A product with no value for an identifier comes back as a null entry, not an error.
    .filter(Boolean)
    .map(m => [m.key, metafieldText(m.value)]));

  return {
    id: node.id,
    handle: node.handle,
    title: node.title,
    description: node.description,
    descriptionHtml: node.descriptionHtml,
    descriptionSafe: sanitizeHtml(node.descriptionHtml),
    availableForSale: node.availableForSale,
    updatedAt: node.updatedAt || null,
    tags: node.tags || [],
    vendor: node.vendor || '',
    productType: node.productType || '',
    collections: (node.collections?.edges || []).map(e => e.node),
    priceRange: node.priceRange,
    options: node.options || [],
    media,
    // Every other page in the site reads product.images. Media is the source;
    // this is the same list under the older name so those consumers keep working.
    images: media.filter(m => m.type === 'image'),
    specs: SPEC_FIELDS
      .filter(f => metafields[f.key])
      .map(f => ({ label: f.label, key: f.key, value: metafields[f.key] })),
    notes: NOTE_FIELDS
      .filter(f => metafields[f.key])
      .map(f => ({ label: f.label, key: f.key, value: metafields[f.key] })),
    variants: (node.variants?.edges || []).map(e => e.node),
  };
}

module.exports = { PRODUCT_FRAGMENT, normalizeProduct, sanitizeHtml, SPEC_FIELDS, NOTE_FIELDS };
