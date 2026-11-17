const NEXTDNS_ID_REGEX = /^[a-zA-Z0-9]{4,16}$/;

export interface NextDnsValidation {
  valid: boolean;
  normalized: string;
  error?: string;
}

/**
 * Validates an optional NextDNS Configuration ID (typically 6 hex/alphanumeric chars).
 */
export function validateNextDnsId(raw: string): NextDnsValidation {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { valid: true, normalized: '' };
  }
  if (!NEXTDNS_ID_REGEX.test(trimmed)) {
    return {
      valid: false,
      normalized: trimmed,
      error: 'Config ID NextDNS harus 4–16 karakter alfanumerik (contoh: a1b2c3).',
    };
  }
  return { valid: true, normalized: trimmed };
}

function isBlockedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (
    lower === 'localhost' ||
    lower.endsWith('.localhost') ||
    lower.endsWith('.local') ||
    lower.endsWith('.internal') ||
    lower.endsWith('.home.arpa') ||
    lower === '[::1]' ||
    lower === '::1'
  ) {
    return true;
  }

  // Strip IPv6 brackets if present
  const bare = lower.startsWith('[') && lower.endsWith(']') ? lower.slice(1, -1) : lower;

  // Check IPv4 private / loopback / link-local ranges
  const ipv4Match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(bare);
  if (ipv4Match) {
    const [, a, b, c, d] = ipv4Match.map(Number);
    if (a > 255 || b > 255 || c > 255 || d > 255) return true;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  }

  // Check IPv6 link-local / unique-local
  if (bare.includes(':')) {
    if (
      bare === '::' ||
      bare === '::1' ||
      bare.startsWith('fe80:') ||
      bare.startsWith('fc') ||
      bare.startsWith('fd')
    ) {
      return true;
    }
  }

  return false;
}

export interface CustomUrlValidation {
  valid: boolean;
  normalized?: string;
  error?: string;
}

/**
 * Validates custom DoH endpoint URLs per security rules:
 * - HTTPS required
 * - No embedded credentials
 * - Blocks loopback, private IPs, and internal hostnames
 */
export function validateCustomDohUrl(rawUrl: string): CustomUrlValidation {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { valid: false, error: 'URL DoH tidak boleh kosong.' };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, error: 'Format URL tidak valid.' };
  }

  if (parsed.protocol !== 'https:') {
    return { valid: false, error: 'Endpoint DoH wajib menggunakan protokol https://.' };
  }

  if (parsed.username || parsed.password) {
    return { valid: false, error: 'URL tidak boleh mengandung kredensial (username/password).' };
  }

  if (!parsed.hostname || isBlockedHostname(parsed.hostname)) {
    return {
      valid: false,
      error: 'Host lokal atau alamat IP privat tidak diizinkan demi keamanan.',
    };
  }

  return { valid: true, normalized: parsed.toString() };
}
