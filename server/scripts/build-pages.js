/**
 * Expands the shared header, footer and cart drawer into the page sources, and
 * writes the result where the web server can serve it.
 *
 *   npm run pages
 *
 * server/views/pages/**.html are the files to edit. The HTML in public/ is
 * generated output — but it is committed on purpose, because the frontend is
 * hosted as static files and has no build step to run this first. Partial
 * expansion is idempotent, so the Express server expanding the same markers at
 * request time is a no-op rather than a second source of truth.
 */
const fs = require('fs');
const path = require('path');

const { expandPage } = require('../partials');

const ROOT = path.join(__dirname, '..', '..');
const SOURCES = path.join(ROOT, 'server', 'views', 'pages');
const OUTPUT = path.join(ROOT, 'public');

function htmlFiles(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...htmlFiles(full));
    else if (entry.name.endsWith('.html')) found.push(full);
  }
  return found;
}

function main() {
  let written = 0;
  for (const source of htmlFiles(SOURCES)) {
    const target = path.join(OUTPUT, path.relative(SOURCES, source));
    const html = expandPage(fs.readFileSync(source, 'utf8'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, html);
    written += 1;
    console.log(`  ${path.relative(ROOT, target)}`);
  }
  console.log(`${written} pages built`);
}

main();
