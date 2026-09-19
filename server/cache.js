// In-memory TTL cache. Entries are grouped by "bucket" so a single event
// (e.g. a new order affecting stock) can invalidate a whole family of keys.
const ttlDefaultSeconds = parseInt(process.env.CACHE_TTL_SECONDS || '300', 10) * 1000;
const MAX_ENTRIES = parseInt(process.env.CACHE_MAX_ENTRIES || '500', 10);
const store = new Map();

// Map iterates in insertion order, so the first key is the oldest entry.
function evictIfNeeded() {
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) return;
    store.delete(oldest);
    inFlight.delete(oldest);
  }
}

function get(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

function set(key, value, seconds) {
  const ttl = Math.round((seconds || ttlDefaultSeconds / 1000) * 1000);
  store.set(key, { value, expires: Date.now() + ttl });
  evictIfNeeded();
}

function del(key) {
  store.delete(key);
}

// Remove every key belonging to a bucket, e.g. invalidate('products') to drop
// all cached product responses at once.
function invalidate(bucket) {
  let removed = 0;
  for (const key of store.keys()) {
    if (key.startsWith(bucket + ':')) {
      store.delete(key);
      removed++;
    }
  }
  return removed;
}

/**
 * Cached loader. `key` is "bucket:rest"; a miss calls `loader` and stores its
 * result. Concurrent identical calls share one in-flight loader promise so a
 * cache-cold homepage does not fire N duplicate Shopify requests.
 */
const inFlight = new Map();

async function wrap(key, loader, seconds) {
  const hit = get(key);
  if (hit !== null) return hit;

  const pending = inFlight.get(key);
  if (pending) return pending;

  const promise = (async () => {
    try {
      const value = await loader();
      if (value !== undefined && value !== null) set(key, value, seconds);
      return value;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, promise);
  return promise;
}

function stats() {
  return { size: store.size, buckets: new Set([...store.keys()].map(k => k.split(':')[0])) };
}

module.exports = { get, set, del, invalidate, wrap, stats };
