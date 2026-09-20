/**
 * Tells Bing, Yandex, Seznam and Naver which URLs changed, via IndexNow.
 *
 *   npm run indexnow
 *
 * IndexNow is the notification protocol those engines share: rather than wait
 * for a crawler to come back around on its own schedule, we hand it the URL list
 * and it fetches them on demand. Google is deliberately not part of IndexNow —
 * it uses the Search Console sitemap submission instead.
 *
 * An engine accepts a submission only when the key is readable at
 * https://<host>/<key>.txt, which proves the caller controls the site. That file
 * is committed in public/, so it must be deployed before this can succeed —
 * hence the live check before the POST rather than a blind one.
 */
const fs = require('fs');
const path = require('path');

const PUBLIC = path.join(__dirname, '..', '..', 'public');
const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';

/** The key is whatever public/<32-hex>.txt is named, so there is nothing to configure. */
function findKey() {
  const file = fs.readdirSync(PUBLIC).find(f => /^[0-9a-f]{32}\.txt$/.test(f));
  if (!file) throw new Error('No public/<key>.txt IndexNow key file. Create one: a 32-hex filename whose contents are the same 32 characters.');
  return { key: file.slice(0, 32), urlPath: `/${file}` };
}

function sitemapUrls() {
  const xml = fs.readFileSync(path.join(PUBLIC, 'sitemap.xml'), 'utf8');
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(m => m[1]);
}

async function main() {
  const { key, urlPath } = findKey();
  const urlList = sitemapUrls();
  const host = new URL(urlList[0]).host;

  console.log(`IndexNow: ${urlList.length} URLs from sitemap.xml on ${host}, key ${key}`);

  const keyFile = `https://${host}${urlPath}`;
  const check = await fetch(keyFile).catch(err => ({ status: 0, statusText: err.message }));
  console.log(`Key file ${keyFile} -> HTTP ${check.status}`);
  if (check.status !== 200) {
    console.log('Not live yet. Commit and push public/, wait for the deploy, then re-run.');
    process.exitCode = 1;
    return;
  }

  const res = await fetch(INDEXNOW_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host, key, keyLocation: keyFile, urlList }),
  });
  const detail = (await res.text()).slice(0, 300);
  // 200 = accepted; 202 = queued. Anything else, notably 400/403, is the key or
  // the host being rejected.
  console.log(`Submitted: HTTP ${res.status}${detail ? ` ${detail}` : ''}`);
  if (res.status !== 200 && res.status !== 202) process.exitCode = 1;
}

if (require.main === module) {
  main().catch(err => {
    console.error(err.message || err);
    process.exitCode = 1;
  });
}
