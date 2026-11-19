import type { CliAdblockRow, CliProtocol, CliReport, CliResultRow } from '../types/cli';

const VALID_PROTOCOLS = new Set<string>(['DoH', 'DoT/853', 'UDP/53']);

function sanitizeNextDnsName(name: string): string {
  return name.replace(/^NextDNS\s*\([a-zA-Z0-9]{4,16}\)$/i, 'NextDNS');
}

export type CliParseResult =
  | { ok: true; report: CliReport }
  | { ok: false; error: string };

/**
 * Validates and normalizes JSON exported from `node cli/dnslytics.mjs --json`
 * or `node cli/dnslytics.mjs --out hasil.json`.
 */
export function parseCliReportJson(rawText: string): CliParseResult {
  const cleaned = rawText.replace(/^\uFEFF/, '').trim();
  if (!cleaned) {
    return { ok: false, error: 'Teks JSON masih kosong.' };
  }

  let parsed: unknown;
  try {
    // Allow accidental npm notice lines before the opening '{' when users redirect stdout
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    const jsonSlice =
      firstBrace !== -1 && lastBrace > firstBrace
        ? cleaned.slice(firstBrace, lastBrace + 1)
        : cleaned;
    parsed = JSON.parse(jsonSlice);
  } catch {
    return {
      ok: false,
      error: 'Format JSON tidak valid. Pastikan file berasal dari output CLI DNSlytics.',
    };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'Struktur JSON tidak dikenali.' };
  }

  const obj = parsed as Record<string, unknown>;
  if (!Array.isArray(obj.results) || obj.results.length === 0) {
    return {
      ok: false,
      error: 'Data "results" tidak ditemukan atau kosong pada file JSON ini.',
    };
  }

  const results: CliResultRow[] = [];
  for (const row of obj.results) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const protocol =
      typeof r.protocol === 'string' && VALID_PROTOCOLS.has(r.protocol)
        ? (r.protocol as CliProtocol)
        : 'DoH';
    const name = typeof r.name === 'string' ? r.name.trim() : '';
    if (!name) continue;
    const medianMs =
      typeof r.medianMs === 'number' && Number.isFinite(r.medianMs)
        ? Math.round(r.medianMs * 10) / 10
        : null;
    const successPct =
      typeof r.successPct === 'number' && Number.isFinite(r.successPct)
        ? Math.max(0, Math.min(100, Math.round(r.successPct)))
        : medianMs !== null
          ? 100
          : 0;
    results.push({ protocol, name, medianMs, successPct });
  }

  if (results.length === 0) {
    return { ok: false, error: 'Tidak ada baris hasil DNS yang valid di file ini.' };
  }

  results.sort(
    (a, b) =>
      (a.medianMs ?? Number.POSITIVE_INFINITY) -
      (b.medianMs ?? Number.POSITIVE_INFINITY),
  );

  const sysRaw =
    obj.systemDns && typeof obj.systemDns === 'object'
      ? (obj.systemDns as Record<string, unknown>)
      : {};
  const systemDns = {
    servers: Array.isArray(sysRaw.servers)
      ? sysRaw.servers.filter((s): s is string => typeof s === 'string')
      : [],
    medianMs:
      typeof sysRaw.medianMs === 'number' && Number.isFinite(sysRaw.medianMs)
        ? Math.round(sysRaw.medianMs * 10) / 10
        : null,
    successPct:
      typeof sysRaw.successPct === 'number' && Number.isFinite(sysRaw.successPct)
        ? Math.round(sysRaw.successPct)
        : 0,
  };

  const p53Raw =
    obj.port53Check && typeof obj.port53Check === 'object'
      ? (obj.port53Check as Record<string, unknown>)
      : {};
  const port53Check = {
    hijacked: Boolean(p53Raw.hijacked),
    udpIdServer: typeof p53Raw.udpIdServer === 'string' ? p53Raw.udpIdServer : null,
    dotIdServer: typeof p53Raw.dotIdServer === 'string' ? p53Raw.dotIdServer : null,
  };

  const adblockCheck: CliAdblockRow[] = Array.isArray(obj.adblockCheck)
    ? obj.adblockCheck
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
        .map((item) => ({
          name:
            typeof item.name === 'string'
              ? sanitizeNextDnsName(item.name)
              : 'Resolver',
          domain:
            typeof item.domain === 'string'
              ? item.domain
              : 'pagead2.googlesyndication.com',
          blocked: Boolean(item.blocked),
          rcode: typeof item.rcode === 'number' ? item.rcode : undefined,
        }))
    : [];

  return {
    ok: true,
    report: {
      schemaVersion: typeof obj.schemaVersion === 'number' ? obj.schemaVersion : 1,
      createdAt:
        typeof obj.createdAt === 'string'
          ? obj.createdAt
          : new Date().toISOString(),
      samples: typeof obj.samples === 'number' ? obj.samples : undefined,
      systemDns,
      port53Check,
      results,
      adblockCheck,
    },
  };
}

function escapeCsvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportCliReportToCsv(report: CliReport): string {
  const headers = ['Rank', 'Resolver', 'Protocol', 'Median_ms', 'Success_Pct'];
  const rows = report.results.map((r, idx) => [
    r.medianMs === null ? '-' : idx + 1,
    r.name,
    r.protocol,
    r.medianMs,
    r.successPct,
  ]);
  return [headers, ...rows]
    .map((row) => row.map(escapeCsvCell).join(','))
    .join('\r\n');
}

/**
 * Renders a minimalist Apple-style high-DPI PNG summary card of the CLI multi-protocol report.
 */
export function exportCliReportToPng(
  report: CliReport,
  theme: 'dark' | 'light' = 'dark',
): void {
  const isDark = theme === 'dark';
  const width = 980;
  const visibleResults = report.results.slice(0, 12);
  const pad = 44;
  const headerHeight = 235;
  const rowHeight = 48;
  const adblockHeight = report.adblockCheck.length > 0 ? 74 : 0;
  const footerHeight = 56;
  const height =
    pad +
    headerHeight +
    visibleResults.length * rowHeight +
    adblockHeight +
    footerHeight;

  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.scale(scale, scale);

  const bgApp = isDark ? '#000000' : '#ffffff';
  const bgSurface = isDark ? '#1c1c1e' : '#f5f5f7';
  const textPrimary = isDark ? '#f5f5f7' : '#1d1d1f';
  const textMuted = isDark ? '#86868b' : '#6e6e73';
  const hairline = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)';
  const accentBlue = isDark ? '#0a84ff' : '#0071e3';
  const neutralBar = isDark ? 'rgba(255, 255, 255, 0.22)' : 'rgba(0, 0, 0, 0.16)';
  const trackBg = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)';
  const fontStack =
    '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", system-ui, sans-serif';

  ctx.fillStyle = bgApp;
  ctx.fillRect(0, 0, width, height);

  const cardX = pad;
  const cardY = pad;
  const cardW = width - pad * 2;
  const cardH = height - pad * 2 - footerHeight + 14;
  ctx.fillStyle = bgSurface;
  ctx.beginPath();
  ctx.roundRect(cardX, cardY, cardW, cardH, 20);
  ctx.fill();

  const innerX = cardX + 36;
  const innerRight = cardX + cardW - 36;

  const dateStr = new Date(report.createdAt).toLocaleString('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  ctx.fillStyle = textMuted;
  ctx.font = `500 13px ${fontStack}`;
  ctx.fillText(
    `DNSlytics CLI  •  ${dateStr}  •  Multi-Protokol (DoT / DoH / UDP)`,
    innerX,
    cardY + 42,
  );

  const winner = report.results.find((r) => r.medianMs !== null) ?? null;

  if (winner) {
    ctx.fillStyle = '#30d158';
    ctx.font = `600 12px ${fontStack}`;
    ctx.fillText('PALING CEPAT', innerX, cardY + 76);

    ctx.fillStyle = textPrimary;
    ctx.font = `600 28px ${fontStack}`;
    ctx.fillText(`${winner.name} (${winner.protocol})`, innerX, cardY + 112);

    ctx.textAlign = 'right';
    ctx.fillStyle = textMuted;
    ctx.font = `400 13px ${fontStack}`;
    ctx.fillText('Waktu Respons', innerRight, cardY + 74);

    ctx.fillStyle = textPrimary;
    ctx.font = `600 36px ${fontStack}`;
    ctx.fillText(`${winner.medianMs} ms`, innerRight, cardY + 114);
    ctx.textAlign = 'left';
  }

  // Baseline + Port 53 status lines
  ctx.fillStyle = textMuted;
  ctx.font = `400 13px ${fontStack}`;
  const sysText =
    report.systemDns.medianMs !== null
      ? `DNS Bawaan Sistem: ${report.systemDns.medianMs} ms (${report.systemDns.successPct}% sukses)`
      : 'DNS Bawaan Sistem: Tidak terukur';
  ctx.fillText(sysText, innerX, cardY + 146);

  ctx.fillStyle = report.port53Check.hijacked ? '#ff9f0a' : '#30d158';
  ctx.font = `500 13px ${fontStack}`;
  const hijackText = report.port53Check.hijacked
    ? `Port UDP/53 Dibelokkan ISP (UDP: ${report.port53Check.udpIdServer ?? '-'} vs DoT: ${report.port53Check.dotIdServer ?? '-'})`
    : `Port UDP/53 Aman — Tidak Dibelokkan (PoP: ${report.port53Check.dotIdServer ?? '-'})`;
  ctx.fillText(hijackText, innerX, cardY + 172);

  const dividerY = cardY + 196;
  ctx.fillStyle = hairline;
  ctx.fillRect(innerX, dividerY, innerRight - innerX, 1);

  const listStartY = dividerY + 24;
  const maxMedian = Math.max(
    10,
    ...visibleResults
      .map((r) => r.medianMs ?? 0)
      .filter((v) => Number.isFinite(v)),
  );

  visibleResults.forEach((r, idx) => {
    const y = listStartY + idx * rowHeight;
    if (idx > 0) {
      ctx.fillStyle = hairline;
      ctx.fillRect(innerX, y - 10, innerRight - innerX, 1);
    }

    ctx.fillStyle = textMuted;
    ctx.font = `500 13px ${fontStack}`;
    ctx.fillText(r.medianMs === null ? '—' : `${idx + 1}`, innerX, y + 17);

    ctx.fillStyle = textPrimary;
    ctx.font = `500 14px ${fontStack}`;
    ctx.fillText(r.name.slice(0, 22), innerX + 34, y + 17);

    ctx.fillStyle = textMuted;
    ctx.font = `500 12px ui-monospace, monospace`;
    ctx.fillText(r.protocol, innerX + 225, y + 17);

    const barX = innerX + 305;
    const barMaxW = 320;
    ctx.fillStyle = trackBg;
    ctx.beginPath();
    ctx.roundRect(barX, y + 6, barMaxW, 12, 6);
    ctx.fill();

    if (r.medianMs !== null) {
      const w = Math.max(10, (r.medianMs / maxMedian) * barMaxW);
      ctx.fillStyle = idx === 0 ? accentBlue : neutralBar;
      ctx.beginPath();
      ctx.roundRect(barX, y + 6, w, 12, 6);
      ctx.fill();
    }

    ctx.textAlign = 'right';
    ctx.fillStyle = textPrimary;
    ctx.font = `600 14px ${fontStack}`;
    ctx.fillText(
      r.medianMs !== null ? `${r.medianMs} ms` : 'Gagal',
      innerRight - 64,
      y + 17,
    );

    ctx.fillStyle = textMuted;
    ctx.font = `400 13px ${fontStack}`;
    ctx.fillText(`${r.successPct}%`, innerRight, y + 17);
    ctx.textAlign = 'left';
  });

  if (report.adblockCheck.length > 0) {
    const adY = listStartY + visibleResults.length * rowHeight + 8;
    ctx.fillStyle = hairline;
    ctx.fillRect(innerX, adY, innerRight - innerX, 1);

    ctx.fillStyle = textMuted;
    ctx.font = `500 12px ${fontStack}`;
    ctx.fillText('Verifikasi Blokir Iklan:', innerX, adY + 28);

    const adSummary = report.adblockCheck
      .map((a) => `${a.name}: ${a.blocked ? 'Terblokir' : 'Tidak'}`)
      .join('   •   ');
    ctx.fillStyle = textPrimary;
    ctx.font = `500 13px ${fontStack}`;
    ctx.fillText(adSummary.slice(0, 96), innerX, adY + 50);
  }

  ctx.fillStyle = textMuted;
  ctx.font = `400 12px ${fontStack}`;
  ctx.fillText(
    'DNSlytics Companion CLI • Uji UDP/53, DoT/853, DoH, Pembelokan Port 53 & Blokir Iklan',
    innerX,
    height - 20,
  );

  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dnslytics-cli-${report.createdAt.slice(0, 10)}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/png');
}

export const SAMPLE_CLI_REPORT: CliReport = {
  schemaVersion: 1,
  createdAt: new Date().toISOString(),
  samples: 5,
  systemDns: { servers: [], medianMs: 16.5, successPct: 100 },
  port53Check: {
    hijacked: true,
    udpIdServer: 'dns-isp-redirect',
    dotIdServer: 'cgk02',
  },
  results: [
    { protocol: 'DoT/853', name: 'Cloudflare 1.1.1.1', medianMs: 8.1, successPct: 100 },
    { protocol: 'DoT/853', name: 'NextDNS', medianMs: 11.5, successPct: 100 },
    { protocol: 'DoH', name: 'Cloudflare 1.1.1.1', medianMs: 12.8, successPct: 100 },
    { protocol: 'DoH', name: 'NextDNS Ultra Low', medianMs: 13.3, successPct: 100 },
    { protocol: 'UDP/53', name: 'Cloudflare 1.1.1.1', medianMs: 12.6, successPct: 100 },
    { protocol: 'DoT/853', name: 'AdGuard DNS', medianMs: 20.2, successPct: 100 },
    { protocol: 'DoH', name: 'NextDNS Anycast', medianMs: 20.4, successPct: 100 },
    { protocol: 'DoT/853', name: 'Quad9', medianMs: 21.8, successPct: 100 },
    { protocol: 'DoH', name: 'AdGuard DNS', medianMs: 22.0, successPct: 100 },
    { protocol: 'DoH', name: 'Google DNS', medianMs: 27.5, successPct: 100 },
  ],
  adblockCheck: [
    { name: 'Cloudflare 1.1.1.1 (Tanpa Filter)', domain: 'pagead2.googlesyndication.com', blocked: false, rcode: 0 },
    { name: 'AdGuard DNS', domain: 'pagead2.googlesyndication.com', blocked: true, rcode: 0 },
    { name: 'NextDNS', domain: 'pagead2.googlesyndication.com', blocked: true, rcode: 0 },
  ],
};
