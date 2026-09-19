/**
 * Expands the include markers that keep the header, footer and cart drawer in
 * one place instead of eleven copies of the same markup.
 *
 * Two constructs, both HTML comments so the source files stay valid HTML when
 * read by hand:
 *
 *   <!--#header active=home cart=drawer-->   pull in views/partials/header.html
 *   <!--if active=home--> … <!--/if-->        keep the block only when the
 *                                              enclosing include marker's
 *                                              active= parameter matches
 *
 * A marker's parameters apply to the partial it loads and to everything that
 * partial includes, so a nested conditional can read the page's own context.
 *
 * Expansion happens once per page file and rides in the same 10-minute cache as
 * the page itself (see routes/pages.js readPage). Every HTML response goes
 * through that route — express.static can never serve a .html file because the
 * pages router intercepts the extension first and 301s it — so a marker can only
 * reach a browser if this file stops working, which is why leftovers throw
 * instead of being quietly stripped.
 */
const fs = require('fs');
const path = require('path');

const PARTIAL_DIR = path.join(__dirname, 'views', 'partials');
const INCLUDE = /<!--#([a-z0-9-]+)((?:\s+[a-z0-9-]+=[^\s>]+)*)\s*-->/g;
const CONDITIONAL = /<!--if\s+([a-z0-9-]+)=([^\s>]+)-->([\s\S]*?)<!--\/if-->/g;
const MAX_DEPTH = 4;

const sources = new Map();

function readPartial(name) {
  if (!sources.has(name)) {
    const file = path.join(PARTIAL_DIR, `${name}.html`);
    if (!fs.existsSync(file)) throw new Error(`No partial named "${name}" in ${PARTIAL_DIR}`);
    sources.set(name, fs.readFileSync(file, 'utf8'));
  }
  return sources.get(name);
}

function parseParams(raw) {
  const params = {};
  for (const pair of String(raw || '').trim().split(/\s+/).filter(Boolean)) {
    const [key, value] = pair.split('=');
    params[key] = value;
  }
  return params;
}

function expandConditionals(html, params) {
  return html.replace(CONDITIONAL, (match, key, value, body) => (
    params[key] === value ? body : ''
  ));
}

function expandIncludes(html, params, depth) {
  if (depth > MAX_DEPTH) throw new Error('Partial includes are nested too deeply');
  return html.replace(INCLUDE, (match, name, rawParams) => {
    const merged = { ...params, ...parseParams(rawParams) };
    const body = expandConditionals(readPartial(name), merged);
    return expandIncludes(body, merged, depth + 1);
  });
}

/** Replace every marker in a page file with the partials it refers to. */
function expandPage(html) {
  const out = expandIncludes(html, {}, 0);
  const leftover = out.match(INCLUDE) || out.match(/<!--if\s|<!--\/if-->/);
  if (leftover) {
    throw new Error(`Unexpanded marker left in page: ${leftover[0].slice(0, 60)}`);
  }
  return out;
}

module.exports = { expandPage, PARTIAL_DIR };
