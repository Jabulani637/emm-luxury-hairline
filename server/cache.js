// Simple in-memory cache with TTL fallback (avoids lru-cache compatibility issues)
const ttlDefault = parseInt(process.env.CACHE_TTL_SECONDS || '300', 10) * 1000;
const store = new Map();

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
  const ttl = (seconds || ttlDefault / 1000) * 1000;
  store.set(key, { value, expires: Date.now() + ttl });
}

function del(key) {
  store.delete(key);
}

module.exports = { get, set, del };
