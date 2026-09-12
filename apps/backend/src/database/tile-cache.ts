const maxEntries = 500;
const ttlMs = 5 * 60 * 1000;

type Entry = { value: Buffer; expiresAt: number };
const cache = new Map<string, Entry>();

export function getTile(key: string) {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return undefined;
  }
  cache.delete(key);
  cache.set(key, entry);
  return Buffer.from(entry.value);
}

export function setTile(key: string, value: Buffer) {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, { value: Buffer.from(value), expiresAt: Date.now() + ttlMs });
  while (cache.size > maxEntries) cache.delete(cache.keys().next().value as string);
}
