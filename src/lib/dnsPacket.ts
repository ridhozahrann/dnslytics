const RCODE_NAMES: Record<number, string> = {
  0: 'NOERROR',
  1: 'FORMERR',
  2: 'SERVFAIL',
  3: 'NXDOMAIN',
  4: 'NOTIMP',
  5: 'REFUSED',
};

export interface DecodedDnsHeader {
  id: number;
  qr: boolean;
  rcode: number;
  rcodeName: string;
  qdcount: number;
  ancount: number;
  valid: boolean;
}

/**
 * Encodes a standard RFC 1035 DNS query packet (A record by default, IN class)
 * with RD (Recursion Desired) flag set for DoH wireformat transport.
 */
export function encodeDnsQuery(
  domain: string,
  qtype = 1,
  id = 0,
): Uint8Array {
  const cleanDomain = domain.trim().replace(/\.+$/, '');
  const labels = cleanDomain.length > 0 ? cleanDomain.split('.') : [];
  const labelBytes: number[] = [];

  for (const label of labels) {
    const encoded = new TextEncoder().encode(label);
    if (encoded.length === 0 || encoded.length > 63) {
      throw new Error(`Invalid DNS label: "${label}"`);
    }
    labelBytes.push(encoded.length, ...encoded);
  }
  labelBytes.push(0); // root label

  const totalLength = 12 + labelBytes.length + 4;
  const packet = new Uint8Array(totalLength);
  const view = new DataView(packet.buffer);

  // Header (12 bytes)
  view.setUint16(0, id & 0xffff, false);
  view.setUint16(2, 0x0100, false); // Standard query, RD=1
  view.setUint16(4, 1, false); // QDCOUNT = 1
  view.setUint16(6, 0, false); // ANCOUNT = 0
  view.setUint16(8, 0, false); // NSCOUNT = 0
  view.setUint16(10, 0, false); // ARCOUNT = 0

  packet.set(labelBytes, 12);

  const qFooterOffset = 12 + labelBytes.length;
  view.setUint16(qFooterOffset, qtype & 0xffff, false); // QTYPE (1 = A, 28 = AAAA)
  view.setUint16(qFooterOffset + 2, 1, false); // QCLASS (1 = IN)

  return packet;
}

/**
 * Converts bytes to unpadded base64url (RFC 8484 GET ?dns= format).
 */
export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Decodes the DNS header from an RFC 8484 wireformat response.
 */
export function decodeDnsResponse(buffer: ArrayBuffer): DecodedDnsHeader {
  if (buffer.byteLength < 12) {
    return {
      id: 0,
      qr: false,
      rcode: -1,
      rcodeName: 'INVALID',
      qdcount: 0,
      ancount: 0,
      valid: false,
    };
  }
  const view = new DataView(buffer);
  const id = view.getUint16(0, false);
  const flags = view.getUint16(2, false);
  const qr = (flags & 0x8000) !== 0;
  const rcode = flags & 0x000f;
  const qdcount = view.getUint16(4, false);
  const ancount = view.getUint16(6, false);

  return {
    id,
    qr,
    rcode,
    rcodeName: RCODE_NAMES[rcode] ?? `RCODE_${rcode}`,
    qdcount,
    ancount,
    valid: qr && rcode !== 1 && rcode !== 2 && rcode !== 4 && rcode !== 5,
  };
}
