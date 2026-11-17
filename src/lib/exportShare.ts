import type { BenchmarkRunRecord, ResolverResult } from '../types/dns';

function sanitizeUrlForShare(url: string, category: string): string {
  if (category === 'nextdns') {
    return url.replace(/\/[a-zA-Z0-9]{4,16}$/, '/<config-id>');
  }
  return url;
}

function escapeCsvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportResultsToCsv(run: BenchmarkRunRecord): string {
  const headers = [
    'Rank',
    'Resolver',
    'Provider',
    'Variant',
    'Status',
    'Median_ms',
    'Mean_ms',
    'Min_ms',
    'Max_ms',
    'P95_ms',
    'Jitter_ms',
    'Warmup_First_ms',
    'Success_Rate_Pct',
    'Success_Count',
    'Total_Count',
    'Unreliable',
    'Endpoint_URL',
  ];

  const rows = run.results.map((r, idx) => [
    r.status === 'cors-blocked' || r.status === 'failed' ? '-' : idx + 1,
    r.resolver.name,
    r.resolver.provider,
    r.resolver.variant,
    r.status,
    r.metrics.medianMs,
    r.metrics.meanMs,
    r.metrics.minMs,
    r.metrics.maxMs,
    r.metrics.p95Ms,
    r.metrics.jitterMs,
    r.metrics.warmupFirstMs,
    r.metrics.successRate,
    r.metrics.successCount,
    r.metrics.totalCount,
    r.metrics.isUnreliable ? 'Ya' : 'Tidak',
    sanitizeUrlForShare(r.resolver.url, r.resolver.category),
  ]);

  return [headers, ...rows]
    .map((row) => row.map(escapeCsvCell).join(','))
    .join('\r\n');
}

export function exportResultsToJson(run: BenchmarkRunRecord): string {
  const sanitized: BenchmarkRunRecord = {
    ...run,
    results: run.results.map((r) => ({
      ...r,
      resolver: {
        ...r.resolver,
        url: sanitizeUrlForShare(r.resolver.url, r.resolver.category),
      },
    })),
  };
  return JSON.stringify(sanitized, null, 2);
}

export function downloadTextFile(
  content: string,
  filename: string,
  mimeType: string,
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Renders a minimalist Apple-style PNG summary card of the benchmark results using Canvas 2D.
 */
export function exportResultsToPng(
  run: BenchmarkRunRecord,
  theme: 'dark' | 'light' = 'dark',
): void {
  const isDark = theme === 'dark';
  const width = 960;
  const visibleResults = run.results.slice(0, 12);
  const hasNextDnsTip = Boolean(run.recommendation.nextDnsComparison?.note);

  const pad = 44;
  const headerHeight = 195 + (hasNextDnsTip ? 34 : 0);
  const rowHeight = 52;
  const footerHeight = 56;
  const height = pad + headerHeight + visibleResults.length * rowHeight + footerHeight;

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

  // Canvas background
  ctx.fillStyle = bgApp;
  ctx.fillRect(0, 0, width, height);

  // Main Apple-style rounded surface card
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

  // Brand + timestamp
  const dateStr = new Date(run.createdAt).toLocaleString('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  ctx.fillStyle = textMuted;
  ctx.font = `500 13px ${fontStack}`;
  ctx.fillText(
    `DNSlytics  •  ${dateStr}  •  Selesai dalam ${(run.durationMs / 1000).toFixed(1)} detik`,
    innerX,
    cardY + 42,
  );

  // Winner eyebrow
  if (run.recommendation.fastestName) {
    ctx.fillStyle = '#30d158';
    ctx.font = `600 12px ${fontStack}`;
    ctx.fillText('PALING CEPAT', innerX, cardY + 76);
  }

  // Winner title
  ctx.fillStyle = textPrimary;
  ctx.font = `600 30px ${fontStack}`;
  const winnerTitle =
    run.recommendation.fastestName ?? run.recommendation.headline;
  ctx.fillText(winnerTitle, innerX, cardY + 112);

  // Big hero latency on right
  if (run.recommendation.fastestMedianMs !== null) {
    const msNum = `${run.recommendation.fastestMedianMs}`;
    ctx.textAlign = 'right';
    ctx.fillStyle = textMuted;
    ctx.font = `400 13px ${fontStack}`;
    ctx.fillText('Waktu Respons', innerRight, cardY + 74);

    ctx.fillStyle = textPrimary;
    ctx.font = `600 36px ${fontStack}`;
    ctx.fillText(`${msNum} ms`, innerRight, cardY + 114);
    ctx.textAlign = 'left';
  }

  // Plain summary (truncated cleanly if needed)
  ctx.fillStyle = textMuted;
  ctx.font = `400 14px ${fontStack}`;
  const maxSummaryChars = 88;
  const summaryText =
    run.recommendation.summary.length > maxSummaryChars
      ? `${run.recommendation.summary.slice(0, maxSummaryChars - 1)}…`
      : run.recommendation.summary;
  ctx.fillText(summaryText, innerX, cardY + 144);

  let dividerY = cardY + 170;
  if (hasNextDnsTip && run.recommendation.nextDnsComparison) {
    ctx.fillStyle = textMuted;
    ctx.font = `400 13px ${fontStack}`;
    const tip = `Tips NextDNS: ${run.recommendation.nextDnsComparison.note}`;
    const trimmedTip = tip.length > 94 ? `${tip.slice(0, 93)}…` : tip;
    ctx.fillText(trimmedTip, innerX, cardY + 172);
    dividerY = cardY + 196;
  }

  // Hairline divider
  ctx.fillStyle = hairline;
  ctx.fillRect(innerX, dividerY, innerRight - innerX, 1);

  const listStartY = dividerY + 24;
  const maxMedian = Math.max(
    10,
    ...visibleResults
      .map((r) => r.metrics.medianMs ?? 0)
      .filter((v) => Number.isFinite(v)),
  );

  visibleResults.forEach((r: ResolverResult, idx: number) => {
    const y = listStartY + idx * rowHeight;
    const isBroken = r.status === 'cors-blocked' || r.status === 'failed';
    const isWinner =
      r.resolver.id === run.recommendation.fastestId &&
      r.metrics.medianMs !== null;

    // Row divider (skip first)
    if (idx > 0) {
      ctx.fillStyle = hairline;
      ctx.fillRect(innerX, y - 10, innerRight - innerX, 1);
    }

    // Rank
    ctx.fillStyle = textMuted;
    ctx.font = `500 13px ${fontStack}`;
    ctx.fillText(isBroken ? '—' : `${idx + 1}`, innerX, y + 18);

    // Name
    ctx.fillStyle = textPrimary;
    ctx.font = `500 15px ${fontStack}`;
    ctx.fillText(r.resolver.name.slice(0, 24), innerX + 34, y + 18);

    // Subtle track + bar
    const barX = innerX + 260;
    const barMaxW = 350;
    ctx.fillStyle = trackBg;
    ctx.beginPath();
    ctx.roundRect(barX, y + 7, barMaxW, 12, 6);
    ctx.fill();

    if (r.metrics.medianMs !== null) {
      const w = Math.max(10, (r.metrics.medianMs / maxMedian) * barMaxW);
      ctx.fillStyle = isWinner ? accentBlue : neutralBar;
      ctx.beginPath();
      ctx.roundRect(barX, y + 7, w, 12, 6);
      ctx.fill();
    }

    // Speed & Success right-aligned
    ctx.textAlign = 'right';
    ctx.fillStyle = textPrimary;
    ctx.font = `600 14px ${fontStack}`;
    const medText = r.metrics.medianMs !== null ? `${r.metrics.medianMs} ms` : 'Gagal';
    ctx.fillText(medText, innerRight - 64, y + 18);

    ctx.fillStyle = textMuted;
    ctx.font = `400 13px ${fontStack}`;
    ctx.fillText(`${r.metrics.successRate}%`, innerRight, y + 18);
    ctx.textAlign = 'left';
  });

  // Quiet footer outside card
  ctx.fillStyle = textMuted;
  ctx.font = `400 12px ${fontStack}`;
  ctx.fillText(
    'DNSlytics • Diuji langsung dari browser tanpa pelacak pihak ketiga',
    innerX,
    height - 20,
  );

  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dnslytics-${run.createdAt.slice(0, 10)}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/png');
}

interface CompactSharePayload {
  v: 1;
  t: string;
  d: number;
  m: string;
  n: number;
  r: Array<{
    id: string;
    nm: string;
    pr: string;
    vr: string;
    cl: string;
    st: ResolverResult['status'];
    sr?: string;
    med: number | null;
    avg: number | null;
    min: number | null;
    max: number | null;
    p95: number | null;
    jit: number | null;
    w1: number | null;
    ok: number;
    tot: number;
    pct: number;
  }>;
  rec: {
    hd: string;
    sm: string;
    fn: string | null;
    fm: number | null;
  };
}

function utf8ToBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToUtf8(b64u: string): string {
  const b64 = b64u.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

export function encodeShareHash(run: BenchmarkRunRecord): string {
  const payload: CompactSharePayload = {
    v: 1,
    t: run.createdAt,
    d: Math.round(run.durationMs),
    m: run.config.testMode,
    n: run.config.sampleCount,
    r: run.results.map((res) => ({
      id: res.resolver.id,
      nm: res.resolver.name,
      pr: res.resolver.provider,
      vr: res.resolver.variant,
      cl: res.resolver.color,
      st: res.status,
      sr: res.statusReason,
      med: res.metrics.medianMs,
      avg: res.metrics.meanMs,
      min: res.metrics.minMs,
      max: res.metrics.maxMs,
      p95: res.metrics.p95Ms,
      jit: res.metrics.jitterMs,
      w1: res.metrics.warmupFirstMs,
      ok: res.metrics.successCount,
      tot: res.metrics.totalCount,
      pct: res.metrics.successRate,
    })),
    rec: {
      hd: run.recommendation.headline,
      sm: run.recommendation.summary,
      fn: run.recommendation.fastestName,
      fm: run.recommendation.fastestMedianMs,
    },
  };
  return `#s=${utf8ToBase64Url(JSON.stringify(payload))}`;
}

export function decodeShareHash(hash: string): BenchmarkRunRecord | null {
  if (!hash.startsWith('#s=')) return null;
  try {
    const raw = base64UrlToUtf8(hash.slice(3));
    const p = JSON.parse(raw) as CompactSharePayload;
    if (p.v !== 1 || !Array.isArray(p.r)) return null;

    const results: ResolverResult[] = p.r.map((item) => ({
      resolver: {
        id: item.id,
        name: item.nm,
        provider: item.pr,
        variant: item.vr,
        description: '',
        url: '',
        category: 'public',
        format: 'wire',
        knownCorsSupport: 'unknown',
        tags: [],
        color: item.cl || '#38bdf8',
      },
      status: item.st,
      statusReason: item.sr,
      metrics: {
        medianMs: item.med,
        meanMs: item.avg,
        minMs: item.min,
        maxMs: item.max,
        p95Ms: item.p95,
        jitterMs: item.jit,
        warmupFirstMs: item.w1,
        warmupAvgMs: item.w1,
        successRate: item.pct,
        successCount: item.ok,
        totalCount: item.tot,
        rankScore: item.med ?? Number.POSITIVE_INFINITY,
        isUnreliable: item.pct < 80,
      },
      samples: [],
      warmupSamples: [],
    }));

    return {
      id: 'shared',
      createdAt: p.t,
      durationMs: p.d,
      hasNextDnsConfig: false,
      config: {
        sampleCount: p.n,
        warmupCount: 2,
        timeoutMs: 4000,
        testMode: (p.m as BenchmarkRunRecord['config']['testMode']) || 'cache-miss',
        allowNoCorsFallback: true,
      },
      results,
      recommendation: {
        fastestId: results[0]?.resolver.id ?? null,
        fastestName: p.rec.fn,
        fastestMedianMs: p.rec.fm,
        runnerUpName: results[1]?.resolver.name ?? null,
        runnerUpMedianMs: results[1]?.metrics.medianMs ?? null,
        deltaMs: null,
        headline: p.rec.hd,
        summary: p.rec.sm,
      },
    };
  } catch {
    return null;
  }
}
