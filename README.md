# Emm Luxury Hair — headless Shopify storefront

A luxury human-hair e-commerce site: an Express server that serves a hand-written
static storefront and a JSON API in front of Shopify's Storefront and Admin APIs.
There is no framework and no build step — the HTML is authored directly, and the
server's only rendering job is expanding page partials and injecting SEO headers.

Shopify holds the catalogue and performs checkout. This service never stores a
card, an address or an order as its record of truth.

## Layout

```
server/
  index.js             app wiring: security, CORS, rate limits, router order
  partials.js          expands <!--#marker--> includes in HTML pages
  htmlSeo.js           injects <title>/meta/OG/JSON-LD per page request
  cache.js             in-memory TTL cache, keyed "bucket:hash"
  envFlags.js          isConfigured() — rejects placeholder-shaped secrets
  shopify/env.js       ONE resolver for every Shopify credential
  shopify/client.js    Storefront API GraphQL (products, collections, cart)
  shopify/admin/       Admin API: draft orders for custom orders + contact form
  routes/              one file per endpoint group (see API table below)
  reviews/             review validation + storage abstraction
  db/supabase.js       PostgREST client for the reviews table
  scripts/             smoke.js, verify-shopify.js, verify-reviews.js, register-webhooks.js
  views/partials/      header.html, footer.html, cart-drawer.html — the canonical chrome
public/
  *.html               pages (index, collection, product, cart, pages/*)
  css/  js/  assets/   static front end, plain vanilla JS
  admin/reviews.html   moderation queue shell (no storefront chrome on purpose)
data/                  local JSON mirror of custom orders / reviews / webhook payloads
design/                source artwork that public/ only ever holds derivatives of
  logo-source.jpg      the 2000x2000 brand lockup; logo-mark.png is cropped from it
  payment-sprite.svg   the 12 payment logos; payment-icons.png is rendered from it
  hero/                the five full-size hero photographs
supabase/schema.sql    run once in the Supabase SQL editor
render.yaml            Render blueprint: service settings and the env var list
```

## Running it locally

```bash
npm install
cp .env.example .env      # then fill in the values below
npm run dev               # http://localhost:3000
```

`npm run smoke` boots the server on port 4399 and runs ~25 read-only checks
against it — every page renders with its chrome and no unexpanded marker, legacy
URLs 301, unknown URLs 404, `/api/config` leaks no secret, the admin queue
refuses an unauthenticated caller. Run it after any change to routing, partials
or the API surface.

| Script | What it does |
| --- | --- |
| `npm start` | run the server (`node server/index.js`) |
| `npm run dev` | same, under nodemon |
| `npm run smoke` | end-to-end check of the running app (no external calls) |
| `npm run assets` | regenerate the derived images in `public/assets` from `design/` |
| `npm run verify:shopify` | real Storefront API read of 2 products |
| `npm run verify:reviews` | confirms reviews are landing in Supabase, not on disk |
| `npm run register:webhooks` | create/update the Shopify webhook subscriptions |

## Environment

One `.env` at the **project root** — `server/index.js` loads it explicitly by
path, so a file inside `server/` is ignored. Every value is read once, at boot.

### Shopify credentials

Each credential has exactly one name. `server/shopify/env.js` resolves them,
warns if a legacy alias is also set, and **rejects values that are shape-wrong**
(a placeholder, or an `shpat_` Admin token pasted into a Storefront variable)
rather than passing them through to fail later as a 403.

| Variable | Needed for | Notes |
| --- | --- | --- |
| `SHOPIFY_STORE_DOMAIN` | everything | `xxx.myshopify.com`, no protocol or path |
| `SHOPIFY_PUBLIC_ACCESS_TOKEN` | products, cart, search | 32-char Storefront token. No `shpat_` prefix. Safe to expose to browsers — it is returned by `/api/config` |
| `SHOPIFY_ADMIN_ACCESS_TOKEN` | custom orders, contact enquiries, webhooks | `shpat_…`. Server-side only. **Never press Rotate on the Shopify app without updating this everywhere first** |
| `SHOPIFY_STOREFRONT_API_VERSION` / `SHOPIFY_ADMIN_API_VERSION` | — | pinned versions, sensible defaults if unset |

Legacy aliases (`SHOPIFY_STORE`, `SHOPIFY_STOREFRONT_TOKEN`, `STOREFRONT_TOKEN`,
`SHOPIFY_ADMIN_TOKEN`, `SHOPIFY_ADMIN_API_TOKEN`) still resolve for existing
deployments. Leave them unset in a new one. Note that `.env` in this repo
currently has an **Admin token sitting in `SHOPIFY_STOREFRONT_TOKEN`** — the
resolver ignores it and warns, and it should be deleted from the file.

### Everything else

| Variable | Why it matters |
| --- | --- |
| `WEBHOOK_SECRET` | Must be the custom app's **Client Secret**. Shopify signs each delivery with it; anything unverifiable is dropped. A placeholder here looks like a broken integration, not a missing value |
| `BACKEND_URL` / `FRONTEND_URL` | The front end asks `GET /api/config` for these and derives every API URL from the answer — which is why no page hardcodes an origin |
| `PORT` | Render injects `10000`; defaults to 3000 locally |
| `CACHE_TTL_SECONDS` | Catalog cache lifetime (default 300). Order webhooks invalidate it immediately |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_REVIEWS_TABLE` | Durable review storage. The secret key is service-role level: **server only, never in `public/`** |
| `ADMIN_PASSWORD` | Gates `/admin/reviews`. Unset = the queue answers 503 to everyone rather than falling open |
| `LOCAL_DATA_DIR` | Where the local JSON mirror writes. Defaults to `data/` |
| `CORS_ALLOW_ALL=1` | Debug only. Ignored when `NODE_ENV=production` |

## How a request is served

Router order in `server/index.js` is load-bearing:

1. `helmet` + `compression` + CORS.
2. `/webhooks/shopify` gets the **raw** body before `express.json` — the HMAC is
   computed over the exact bytes Shopify sent, so parsing first would break it.
3. `/robots.txt`, `/sitemap.xml`.
4. The pages router: clean URLs (`/products/<handle>`, `/collections/<handle>`,
   `/pages/<name>`) read the matching HTML, expand its partial markers, inject
   the page's `<title>`/meta/OG/JSON-LD, and cache the result for 600s. Legacy
   `*.html` addresses 301 here. Unknown paths 404 — never a silent homepage.
5. `express.static` for CSS/JS/assets. The files are not content-hashed, so
   production caches them for one hour and locally `maxAge` is 0 so an edit shows
   up on reload. Because the pages router runs first, no `.html` file is ever
   served raw, which is what makes the marker system safe.
6. `/api/*` behind a rate limiter. `/api/health` reports booleans and counts
   only — no secrets, no customer data.

### Partials

`<!--#header active=home cart=drawer-->`, `<!--#footer active=…-->` and
`<!--#cart-drawer-->` are the only copy of the site chrome. Inside a partial,
`<!--if key=value-->…<!--/if-->` keeps or drops a block based on the include's
attributes — that is how one header serves eleven pages with the right nav item
highlighted and a different bag control on the cart page.

To add a page: put the HTML in `public/`, register it in the `PAGES` map in
`server/routes/pages.js` with its title and description, and use the three
markers. Do not paste a header or footer into a page file. An unexpanded marker
reaching a browser is a bug, and `npm run smoke` fails if one does.

### Images

Nothing in `public/assets` is hand-edited. `npm run assets` regenerates the logo
mark, the apple-touch icon, the hero's `-480/-800/-1100` WebP+JPEG pairs and the
payment badge strip from the sources in `design/`. The originals stay there, not
in `public/`, so the browser-facing folder only ever contains files something
actually links to. sharp is a devDependency for this reason, and Render's build
installs with `--omit=dev`.

## Orders and enquiries

* **Cart** — a real Shopify cart created through the Storefront API. The bag
  redirects to Shopify's hosted `checkoutUrl`. `POST /api/cart/buyer-identity`
  with an empty body runs just before that redirect so Shopify does not lock
  checkout to the store's base country, which matters because the business is
  UK-based and sells internationally.
* **Custom orders / contact form** — written as Shopify **draft orders** through
  the Admin API, so they appear in the Shopify admin like any other order.
* **Webhooks** — `npm run register:webhooks` subscribes to order topics;
  `/webhooks/shopify` verifies the HMAC, invalidates the catalog cache and keeps
  a local copy of the payload.

### The `data/` directory is a convenience copy, not a record

`data/` mirrors custom orders, contact enquiries, reviews and webhook payloads as
JSON so nothing is lost while the Shopify credentials are being sorted out.
**Render's free plan has an ephemeral filesystem: this directory is wiped on
every deploy.** Shopify (and Supabase, for reviews) is the source of truth. It is
gitignored because it contains customer PII. Nothing in it is publicly readable:
the one endpoint that lists pending submissions is behind the admin sign-in.

## Customer reviews

Shoppers submit on the product page or `/pages/reviews`; every submission is
stored as `pending` and nothing appears on the site until it is approved.

```
POST /api/reviews            → pending row (validated by server/reviews/schema.js)
GET  /api/reviews            → approved rows only
/admin/reviews               → the queue: password sign-in, approve / reject / edit
GET  /api/admin/reviews/export → JSON snapshot of approved reviews, for backing up before a deploy
```

Sign-in issues a stateless HMAC-signed 12-hour cookie keyed on `ADMIN_PASSWORD`,
so there is no session table. With `SUPABASE_URL`/`SUPABASE_SECRET_KEY` unset the
store falls back to `data/reviews/reviews.json` and the boot log says so loudly —
that file does not survive a deploy, which is the reason Supabase is set up
before launch rather than after.

## Deploying

`render.yaml` is the blueprint: Node runtime, `npm install` / `npm start`,
`autoDeploy: true`, `NODE_ENV=production`, `PORT=10000`, and every env var above
declared with `sync: false` so secrets are entered in the dashboard and never sit
in the repo. A push to the tracked branch deploys immediately.

Before a first deploy, set `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_PUBLIC_ACCESS_TOKEN`,
`SHOPIFY_ADMIN_ACCESS_TOKEN`, `WEBHOOK_SECRET`, `BACKEND_URL`, `FRONTEND_URL`,
`SUPABASE_URL`, `SUPABASE_SECRET_KEY` and `ADMIN_PASSWORD` in Render, then read
the boot log: it prints a bulleted list of whatever is still missing or
placeholder-shaped instead of starting quietly.

### Domains and SEO

**This service has to own the hostname visitors type.** A static file host
cannot serve it, because none of the search-engine-facing work is in the files:
the per-page `<title>`, canonical link, Open Graph tags and JSON-LD, the clean
`/products/<handle>` and `/pages/<name>` URLs, `robots.txt`, `sitemap.xml` and
the 301s from the legacy `*.html` addresses are all produced per request by
`server/routes/pages.js`, `server/routes/seo.js` and `server/htmlSeo.js`. Pointed
at a static snapshot, every one of those either 404s or returns a page whose
product content only exists after JavaScript runs, which is invisible to a
crawler.

`FRONTEND_URL` is the canonical origin. It drives every `<link rel="canonical">`,
every URL in the sitemap and the `og:image` paths, so it must be exactly the
address customers use — currently `https://www.emmluxuryhair.com`. Any other
hostname in the `emmluxuryhair.com` family gets its documents 301'd to it, while
`/api` and `/webhooks` keep answering on every hostname so Shopify's HMAC-signed
webhook posts are never bounced.

On the free plan an idle service sleeps, and the next request — including a
Googlebot crawl — waits roughly thirty seconds for it to wake. That is a ranking
penalty, not a failure; a paid instance removes it.
