export const DEFAULT_CACHE_HIT_DOMAINS = [
  'google.com',
  'cloudflare.com',
  'github.com',
  'wikipedia.org',
  'mozilla.org',
  'microsoft.com',
  'amazon.com',
  'apple.com',
  'youtube.com',
  'netflix.com',
];

const RANDOM_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Generates a unique uncached subdomain for cache-miss benchmarking.
 * Uses example.com (RFC 2606 reserved domain) with high-entropy prefix so
 * recursive resolvers cannot satisfy the query from warm cache.
 */
export function generateCacheMissDomain(runSalt: string, seq: number): string {
  let rand = '';
  const bytes = new Uint8Array(6);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  for (let i = 0; i < bytes.length; i++) {
    rand += RANDOM_ALPHABET[bytes[i] % RANDOM_ALPHABET.length];
  }
  return `b-${runSalt}-${seq}-${rand}.example.com`;
}

export function pickCacheHitDomain(domains: string[], index: number): string {
  const list = domains.length > 0 ? domains : DEFAULT_CACHE_HIT_DOMAINS;
  return list[index % list.length];
}
