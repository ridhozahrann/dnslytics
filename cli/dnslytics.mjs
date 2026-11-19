#!/usr/bin/env node
import { randomBytes } from 'node:crypto';
import dgram from 'node:dgram';
import dns from 'node:dns/promises';
import { writeFile } from 'node:fs/promises';
import process from 'node:process';
import tls from 'node:tls';

function parseArgs(argv) {
  const opts = {
    nextDnsId: '',
    samples: 5,
    timeoutMs: 4000,
    json: false,
    outFile: '',
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--json') opts.json = true;
    else if ((a === '--out' || a === '-o') && argv[i + 1]) {
      opts.outFile = argv[++i].trim();
    } else if (a.startsWith('--out=')) {
      opts.outFile = a.slice(6).trim();
    } else if (a === '--nextdns' && argv[i + 1]) {
      opts.nextDnsId = argv[++i].trim();
    } else if (a.startsWith('--nextdns=')) {
      opts.nextDnsId = a.slice(10).trim();
    } else if (a === '--samples' && argv[i + 1]) {
      const n = Number(argv[++i]);
      if (Number.isFinite(n) && n >= 1 && n <= 50) opts.samples = Math.floor(n);
    }
  }
  return opts;
}

function encodeDnsQuery(domain, qtype = 1, qclass = 1, id = 1) {
  const clean = domain.trim().replace(/\.+$/, '');
  const labels = clean ? clean.split('.') : [];
  const labelBytes = [];
  for (const label of labels) {
    const buf = Buffer.from(label, 'utf8');
    labelBytes.push(buf.length, ...buf);
  }
  labelBytes.push(0);
  const pkt = Buffer.alloc(12 + labelBytes.length + 4);
  pkt.writeUInt16BE(id & 0xffff, 0);
  pkt.writeUInt16BE(0x0100, 2); // RD=1
  pkt.writeUInt16BE(1, 4); // QDCOUNT=1
  Buffer.from(labelBytes).copy(pkt, 12);
  pkt.writeUInt16BE(qtype, 12 + labelBytes.length);
  pkt.writeUInt16BE(qclass, 14 + labelBytes.length);
  return pkt;
}

function parseDnsHeader(buf) {
  if (!buf || buf.length < 12) {
    return { valid: false, rcode: -1, ancount: 0 };
  }
  const flags = buf.readUInt16BE(2);
  const rcode = flags & 0x0f;
  const ancount = buf.readUInt16BE(6);
  return {
    valid: rcode === 0 || rcode === 3,
    rcode,
    ancount,
  };
}

/**
 * Extracts printable ASCII text from a CHAOS TXT response packet for id.server probing.
 */
function extractTxtSnippet(buf) {
  if (!buf || buf.length <= 12) return '';
  // Skip header + question section
  let offset = 12;
  while (offset < buf.length && buf[offset] !== 0) {
    if ((buf[offset] & 0xc0) === 0xc0) {
      offset += 2;
      break;
    }
    offset += buf[offset] + 1;
  }
  if (buf[offset] === 0) offset += 1;
  offset += 4; // QTYPE + QCLASS

  const chunks = [];
  const ancount = buf.readUInt16BE(6);
  for (let a = 0; a < ancount && offset + 12 <= buf.length; a++) {
    // Skip RR name
    if ((buf[offset] & 0xc0) === 0xc0) {
      offset += 2;
    } else {
      while (offset < buf.length && buf[offset] !== 0) {
        offset += buf[offset] + 1;
      }
      offset += 1;
    }
    if (offset + 10 > buf.length) break;
    const type = buf.readUInt16BE(offset);
    const rdlength = buf.readUInt16BE(offset + 8);
    offset += 10;
    if (offset + rdlength > buf.length) break;
    if (type === 16 && rdlength > 1) {
      const txtLen = buf[offset];
      chunks.push(
        buf.subarray(offset + 1, offset + 1 + Math.min(txtLen, rdlength - 1)).toString('utf8'),
      );
    }
    offset += rdlength;
  }
  return chunks.join(' ').trim();
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const val =
    sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  return Math.round(val * 10) / 10;
}

function randomDomain(i) {
  return `cli-${randomBytes(3).toString('hex')}-${i}.example.com`;
}

async function queryDoh(baseUrl, domain, timeoutMs, id = 1) {
  const pkt = encodeDnsQuery(domain, 1, 1, id);
  const sep = baseUrl.includes('?') ? '&' : '?';
  const url = `${baseUrl}${sep}dns=${pkt.toString('base64url')}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const t0 = performance.now();
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/dns-message' },
      signal: ctrl.signal,
    });
    const buf = Buffer.from(await res.arrayBuffer());
    const elapsed = Math.round((performance.now() - t0) * 10) / 10;
    const hdr = parseDnsHeader(buf);
    return {
      ok: res.ok && hdr.valid,
      ms: elapsed,
      rcode: hdr.rcode,
      ancount: hdr.ancount,
      buf,
    };
  } catch {
    return { ok: false, ms: null, rcode: -1, ancount: 0 };
  } finally {
    clearTimeout(timer);
  }
}

function queryUdp(ip, domain, timeoutMs, qtype = 1, qclass = 1) {
  return new Promise((resolve) => {
    const sock = dgram.createSocket('udp4');
    const id = randomBytes(2).readUInt16BE(0);
    const pkt = encodeDnsQuery(domain, qtype, qclass, id);
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        sock.close();
        resolve({ ok: false, ms: null, rcode: -1, buf: null });
      }
    }, timeoutMs);

    const t0 = performance.now();
    sock.on('message', (msg) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const elapsed = Math.round((performance.now() - t0) * 10) / 10;
      sock.close();
      const hdr = parseDnsHeader(msg);
      resolve({
        ok: msg.readUInt16BE(0) === id && hdr.valid,
        ms: elapsed,
        rcode: hdr.rcode,
        buf: msg,
      });
    });

    sock.on('error', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      sock.close();
      resolve({ ok: false, ms: null, rcode: -1, buf: null });
    });

    sock.send(pkt, 53, ip);
  });
}

function queryDot(ip, servername, domain, timeoutMs, qtype = 1, qclass = 1) {
  return new Promise((resolve) => {
    let settled = false;
    const socket = tls.connect(
      { host: ip, port: 853, servername },
      () => {
        const id = randomBytes(2).readUInt16BE(0);
        const pkt = encodeDnsQuery(domain, qtype, qclass, id);
        const framed = Buffer.alloc(2 + pkt.length);
        framed.writeUInt16BE(pkt.length, 0);
        pkt.copy(framed, 2);
        const tQuery = performance.now();
        socket.write(framed);

        let chunks = Buffer.alloc(0);
        socket.on('data', (data) => {
          chunks = Buffer.concat([chunks, data]);
          if (chunks.length < 2) return;
          const expectedLen = chunks.readUInt16BE(0);
          if (chunks.length < 2 + expectedLen) return;
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          const elapsed = Math.round((performance.now() - tQuery) * 10) / 10;
          const payload = chunks.subarray(2, 2 + expectedLen);
          socket.destroy();
          const hdr = parseDnsHeader(payload);
          resolve({
            ok: payload.readUInt16BE(0) === id && hdr.valid,
            ms: elapsed,
            rcode: hdr.rcode,
            buf: payload,
          });
        });
      },
    );

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        socket.destroy();
        resolve({ ok: false, ms: null, rcode: -1, buf: null });
      }
    }, timeoutMs);

    socket.on('error', () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        socket.destroy();
        resolve({ ok: false, ms: null, rcode: -1, buf: null });
      }
    });
  });
}

async function measureSeries(fn, samples) {
  await fn(randomDomain(0)); // 1x warmup
  const times = [];
  let okCount = 0;
  for (let i = 1; i <= samples; i++) {
    const res = await fn(randomDomain(i));
    if (res.ok && res.ms !== null) {
      times.push(res.ms);
      okCount += 1;
    }
  }
  return {
    medianMs: median(times),
    successPct: Math.round((okCount / samples) * 100),
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(`DNSlytics Companion CLI
Pemakaian:
  node cli/dnslytics.mjs [opsi]

Opsi:
  --nextdns <id>     Sertakan endpoint NextDNS (Ultra Low, Anycast, Default)
  --samples <n>      Jumlah tes per resolver (default: 5)
  --out <file.json>  Simpan hasil JSON UTF-8 untuk divisualisasikan di web DNSlytics
  --json             Tampilkan hasil JSON langsung ke terminal
  --help             Tampilkan bantuan ini`);
    return;
  }

  if (!opts.json) {
    console.log('\nDNSlytics CLI — Tes DNS Lengkap (UDP/53, DoT/853, DoH, Blokir Iklan)\n');
  }

  // 1. OS System Baseline (uses dns.lookup so it follows Windows/macOS/Linux OS DNS client)
  const systemServers = dns.getServers().filter((s) => s !== '127.0.0.1');
  const sysRes = await measureSeries(async (d) => {
    const t0 = performance.now();
    try {
      await Promise.race([
        dns.lookup(d, { family: 4 }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('TIMEOUT')), opts.timeoutMs),
        ),
      ]);
      return { ok: true, ms: Math.round((performance.now() - t0) * 10) / 10 };
    } catch (err) {
      if (err && err.code === 'ENOTFOUND') {
        return { ok: true, ms: Math.round((performance.now() - t0) * 10) / 10 };
      }
      return { ok: false, ms: null };
    }
  }, opts.samples);

  // 2. Port 53 Hijacking Check (id.server on 1.1.1.1 UDP vs DoT)
  const udpIdProbe = await queryUdp('1.1.1.1', 'id.server', opts.timeoutMs, 16, 3);
  const dotIdProbe = await queryDot(
    '1.1.1.1',
    'one.one.one.one',
    'id.server',
    opts.timeoutMs,
    16,
    3,
  );
  const udpPop = extractTxtSnippet(udpIdProbe.buf);
  const dotPop = extractTxtSnippet(dotIdProbe.buf);
  const port53Hijacked = Boolean(udpPop && dotPop && udpPop !== dotPop);

  // 3. DoH Targets
  const dohTargets = [
    { name: 'Cloudflare 1.1.1.1', url: 'https://cloudflare-dns.com/dns-query' },
    { name: 'Google DNS', url: 'https://dns.google/dns-query' },
    { name: 'AdGuard DNS', url: 'https://dns.adguard-dns.com/dns-query' },
    { name: 'Quad9', url: 'https://dns.quad9.net/dns-query' },
  ];
  if (opts.nextDnsId) {
    dohTargets.push(
      { name: 'NextDNS Ultra Low', url: `https://ultralow.dns.nextdns.io/${opts.nextDnsId}` },
      { name: 'NextDNS Anycast', url: `https://anycast.dns.nextdns.io/${opts.nextDnsId}` },
      { name: 'NextDNS Default', url: `https://dns.nextdns.io/${opts.nextDnsId}` },
    );
  }

  const dohResults = [];
  for (const t of dohTargets) {
    const r = await measureSeries((d) => queryDoh(t.url, d, opts.timeoutMs), opts.samples);
    dohResults.push({ protocol: 'DoH', name: t.name, ...r });
  }

  // 4. DoT Targets (port 853)
  const dotTargets = [
    { name: 'Cloudflare 1.1.1.1', ip: '1.1.1.1', sni: 'one.one.one.one' },
    { name: 'Google DNS', ip: '8.8.8.8', sni: 'dns.google' },
    { name: 'AdGuard DNS', ip: 'dns.adguard-dns.com', sni: 'dns.adguard-dns.com' },
    { name: 'Quad9', ip: '9.9.9.9', sni: 'dns.quad9.net' },
  ];
  if (opts.nextDnsId) {
    dotTargets.push({
      name: 'NextDNS',
      ip: `${opts.nextDnsId}.dns.nextdns.io`,
      sni: `${opts.nextDnsId}.dns.nextdns.io`,
    });
  }

  const dotResults = [];
  for (const t of dotTargets) {
    const r = await measureSeries(
      (d) => queryDot(t.ip, t.sni, d, opts.timeoutMs),
      opts.samples,
    );
    dotResults.push({ protocol: 'DoT/853', name: t.name, ...r });
  }

  // 5. UDP/53 Targets
  const udpTargets = [
    { name: 'Cloudflare 1.1.1.1', ip: '1.1.1.1' },
    { name: 'Google DNS', ip: '8.8.8.8' },
    { name: 'AdGuard DNS', ip: '94.140.14.14' },
    { name: 'Quad9', ip: '9.9.9.9' },
  ];
  const udpResults = [];
  for (const t of udpTargets) {
    const r = await measureSeries((d) => queryUdp(t.ip, d, opts.timeoutMs), opts.samples);
    udpResults.push({ protocol: 'UDP/53', name: t.name, ...r });
  }

  // 6. Adblock Verification
  const adTestDomain = 'pagead2.googlesyndication.com';
  const adCheckTargets = [
    { name: 'Cloudflare 1.1.1.1 (Tanpa Filter)', url: 'https://cloudflare-dns.com/dns-query' },
    { name: 'AdGuard DNS', url: 'https://dns.adguard-dns.com/dns-query' },
  ];
  if (opts.nextDnsId) {
    adCheckTargets.push({
      name: `NextDNS (${opts.nextDnsId})`,
      url: `https://dns.nextdns.io/${opts.nextDnsId}`,
    });
  }
  const adblockResults = [];
  for (const t of adCheckTargets) {
    const res = await queryDoh(t.url, adTestDomain, opts.timeoutMs);
    let blocked = false;
    if (res.ok && res.buf) {
      // Blocked if NXDOMAIN (rcode 3) or 0 answers or 0.0.0.0 answer bytes
      const hasZeroIp =
        res.ancount === 1 &&
        res.buf.subarray(-4).equals(Buffer.from([0, 0, 0, 0]));
      blocked = res.rcode === 3 || res.ancount === 0 || hasZeroIp;
    }
    adblockResults.push({ name: t.name, domain: adTestDomain, blocked, rcode: res.rcode });
  }

  const allRanked = [...dohResults, ...dotResults, ...udpResults].sort(
    (a, b) => (a.medianMs ?? Infinity) - (b.medianMs ?? Infinity),
  );

  const summary = {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    samples: opts.samples,
    systemDns: { servers: systemServers, ...sysRes },
    port53Check: {
      hijacked: port53Hijacked,
      udpIdServer: udpPop || null,
      dotIdServer: dotPop || null,
    },
    results: allRanked,
    adblockCheck: adblockResults,
  };

  if (opts.outFile) {
    await writeFile(opts.outFile, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    if (!opts.json) {
      console.log(`File JSON tersimpan di: ${opts.outFile}`);
      console.log('Buka tab "CLI" di web DNSlytics lalu unggah file ini untuk melihat grafik & ekspor PNG.\n');
    }
  }

  if (opts.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log(`DNS Bawaan Sistem (${systemServers.join(', ') || 'auto'}): ${sysRes.medianMs ?? 'Gagal'} ms (${sysRes.successPct}% sukses)`);
  if (port53Hijacked) {
    console.log(
      `[PERINGATAN] Port UDP/53 dibelokkan oleh ISP! (UDP id.server="${udpPop}", DoT asli="${dotPop}"). Gunakan DoH/DoT agar tidak dibelokkan.\n`,
    );
  } else {
    console.log(
      `Cek Pembelokan Port 53: Aman (UDP="${udpPop || '-'}", DoT="${dotPop || '-'}").\n`,
    );
  }

  console.log('Peringkat Kecepatan (Semua Protokol):');
  console.log('-------------------------------------------------------------');
  allRanked.forEach((row, idx) => {
    const msStr = row.medianMs !== null ? `${row.medianMs} ms` : 'Gagal';
    console.log(
      `${String(idx + 1).padStart(2)}. ${row.name.padEnd(22)} | ${row.protocol.padEnd(7)} | ${msStr.padStart(8)} | ${row.successPct}%`,
    );
  });

  console.log('\nVerifikasi Blokir Iklan (uji domain: ' + adTestDomain + '):');
  for (const ad of adblockResults) {
    console.log(`- ${ad.name}: ${ad.blocked ? 'TERBLOKIR (Aktif)' : 'Tidak diblokir'}`);
  }
  console.log('');
}

main().catch((err) => {
  console.error('Error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
