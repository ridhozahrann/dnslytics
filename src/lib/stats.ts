import type {
  BenchmarkRecommendation,
  QuerySample,
  ResolverMetrics,
  ResolverResult,
} from '../types/dns';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return round2((sorted[mid - 1] + sorted[mid]) / 2);
  }
  return round2(sorted[mid]);
}

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((acc, v) => acc + v, 0);
  return round2(sum / values.length);
}

export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  const clamped = Math.max(0, Math.min(sorted.length - 1, idx));
  return round2(sorted[clamped]);
}

export function stdDev(values: number[]): number | null {
  if (values.length === 0) return null;
  if (values.length === 1) return 0;
  const avg = values.reduce((acc, v) => acc + v, 0) / values.length;
  const variance =
    values.reduce((acc, v) => acc + (v - avg) * (v - avg), 0) / values.length;
  return round2(Math.sqrt(variance));
}

/**
 * Computes full DNS benchmark metrics from query samples and warmup samples.
 * Ranking score penalizes resolvers with < 100% success rate so flaky resolvers
 * do not win solely on a few lucky fast responses.
 */
export function computeResolverMetrics(
  samples: QuerySample[],
  warmupSamples: QuerySample[] = [],
): ResolverMetrics {
  const totalCount = samples.length;
  const latencies = samples
    .filter((s): s is QuerySample & { latencyMs: number } => s.ok && s.latencyMs !== null)
    .map((s) => s.latencyMs);

  const successCount = latencies.length;
  const successRate = totalCount > 0 ? round2((successCount / totalCount) * 100) : 0;

  const warmupLatencies = warmupSamples
    .filter((s): s is QuerySample & { latencyMs: number } => s.ok && s.latencyMs !== null)
    .map((s) => s.latencyMs);

  const warmupFirstMs = warmupLatencies.length > 0 ? round2(warmupLatencies[0]) : null;
  const warmupAvgMs = mean(warmupLatencies);

  if (successCount === 0) {
    return {
      medianMs: null,
      meanMs: null,
      minMs: null,
      maxMs: null,
      p95Ms: null,
      jitterMs: null,
      warmupFirstMs,
      warmupAvgMs,
      successRate: 0,
      successCount: 0,
      totalCount,
      rankScore: Number.POSITIVE_INFINITY,
      isUnreliable: true,
      unreliableReason: totalCount > 0 ? 'Semua query gagal' : 'Belum ada sampel',
    };
  }

  const med = median(latencies)!;
  const avg = mean(latencies)!;
  const minVal = round2(Math.min(...latencies));
  const maxVal = round2(Math.max(...latencies));
  const p95 = percentile(latencies, 95)!;
  const jitter = stdDev(latencies)!;

  // Penalty: +15 ms per 10% failed queries, plus heavy penalty below 70%
  const failurePct = 100 - successRate;
  const penalty =
    failurePct === 0
      ? 0
      : failurePct <= 30
        ? failurePct * 1.5
        : failurePct * 4;
  const rankScore = round2(med + penalty);

  const reasons: string[] = [];
  if (successRate < 80) {
    reasons.push(`Success rate rendah (${successRate}%)`);
  }
  if (latencies.length >= 3 && jitter > Math.max(med * 0.85, 40)) {
    reasons.push(`Varians/jitter tinggi (±${jitter} ms)`);
  }

  return {
    medianMs: med,
    meanMs: avg,
    minMs: minVal,
    maxMs: maxVal,
    p95Ms: p95,
    jitterMs: jitter,
    warmupFirstMs,
    warmupAvgMs,
    successRate,
    successCount,
    totalCount,
    rankScore,
    isUnreliable: reasons.length > 0,
    unreliableReason: reasons.length > 0 ? reasons.join('; ') : undefined,
  };
}

export function sortResolverResults(results: ResolverResult[]): ResolverResult[] {
  return [...results].sort((a, b) => {
    const aValid = a.status !== 'cors-blocked' && a.status !== 'failed' && Number.isFinite(a.metrics.rankScore);
    const bValid = b.status !== 'cors-blocked' && b.status !== 'failed' && Number.isFinite(b.metrics.rankScore);
    if (aValid && !bValid) return -1;
    if (!aValid && bValid) return 1;
    if (!aValid && !bValid) return 0;

    if (a.metrics.rankScore !== b.metrics.rankScore) {
      return a.metrics.rankScore - b.metrics.rankScore;
    }
    return (a.metrics.p95Ms ?? Infinity) - (b.metrics.p95Ms ?? Infinity);
  });
}

const ADBLOCK_IDS = new Set([
  'adguard-default',
  'adguard-family',
  'controld-ads',
  'nextdns-unified',
  'nextdns-ultralow',
  'nextdns-anycast',
  'nextdns-default',
]);

export function generateRecommendation(
  sortedResults: ResolverResult[],
  hasNextDnsConfig: boolean,
): BenchmarkRecommendation {
  const usable = sortedResults.filter(
    (r) =>
      r.status !== 'cors-blocked' &&
      r.status !== 'failed' &&
      r.metrics.medianMs !== null &&
      r.metrics.successCount > 0,
  );

  const reliable = usable.filter((r) => !r.metrics.isUnreliable);
  const candidates = reliable.length > 0 ? reliable : usable;

  if (candidates.length === 0) {
    return {
      fastestId: null,
      fastestName: null,
      fastestMedianMs: null,
      runnerUpName: null,
      runnerUpMedianMs: null,
      deltaMs: null,
      headline: 'Tidak ada resolver yang berhasil diuji',
      summary:
        'Semua resolver mengalami kegagalan, timeout, atau terblokir kebijakan CORS browser. Coba aktifkan fallback Timing-Only atau periksa koneksi internet Anda.',
    };
  }

  const fastest = candidates[0];
  const runnerUp = candidates.length > 1 ? candidates[1] : null;
  const deltaMs =
    runnerUp && fastest.metrics.medianMs !== null && runnerUp.metrics.medianMs !== null
      ? round2(runnerUp.metrics.medianMs - fastest.metrics.medianMs)
      : null;

  let nextDnsComparison: BenchmarkRecommendation['nextDnsComparison'];
  if (hasNextDnsConfig) {
    const ul = usable.find((r) => r.resolver.id === 'nextdns-ultralow');
    const ac = usable.find((r) => r.resolver.id === 'nextdns-anycast');
    const def = usable.find((r) => r.resolver.id === 'nextdns-default');

    const ulMs = ul?.metrics.medianMs ?? null;
    const acMs = ac?.metrics.medianMs ?? null;
    const defMs = def?.metrics.medianMs ?? null;

    if (ulMs !== null || acMs !== null) {
      let winner: 'ultralow' | 'anycast' | 'default' | null = null;
      const validPairs: Array<{ key: 'ultralow' | 'anycast' | 'default'; ms: number }> = [];
      if (ulMs !== null) validPairs.push({ key: 'ultralow', ms: ulMs });
      if (acMs !== null) validPairs.push({ key: 'anycast', ms: acMs });
      if (defMs !== null) validPairs.push({ key: 'default', ms: defMs });
      validPairs.sort((a, b) => a.ms - b.ms);
      if (validPairs.length > 0) winner = validPairs[0].key;

      let note = '';
      if (ulMs !== null && acMs !== null) {
        const diff = round2(Math.abs(ulMs - acMs));
        if (ulMs < acMs) {
          note = `Untuk NextDNS di jaringan Anda, jalur Ultra Low (${ulMs} ms) lebih cepat ${diff} ms dibanding Anycast (${acMs} ms).`;
        } else if (acMs < ulMs) {
          note = `Untuk NextDNS di jaringan Anda, jalur Anycast (${acMs} ms) lebih cepat ${diff} ms dibanding Ultra Low (${ulMs} ms).`;
        } else {
          note = `Jalur Ultra Low dan Anycast NextDNS sama cepatnya (${ulMs} ms).`;
        }
      } else if (ulMs !== null) {
        note = `NextDNS Ultra Low mencatat kecepatan ${ulMs} ms.`;
      } else if (acMs !== null) {
        note = `NextDNS Anycast mencatat kecepatan ${acMs} ms.`;
      }

      nextDnsComparison = {
        ultraLowMs: ulMs,
        anycastMs: acMs,
        defaultMs: defMs,
        winner,
        note,
      };
    }
  }

  const summary = runnerUp
    ? `${fastest.resolver.name} merespons dalam ${fastest.metrics.medianMs} ms — lebih cepat ${deltaMs} ms dibanding ${runnerUp.resolver.name} (${runnerUp.metrics.medianMs} ms).`
    : `${fastest.resolver.name} merespons dalam ${fastest.metrics.medianMs} ms dengan tingkat keberhasilan ${fastest.metrics.successRate}%.`;

  const fastestAdBlockCandidate = candidates.find(
    (r) =>
      r.resolver.id !== fastest.resolver.id &&
      (ADBLOCK_IDS.has(r.resolver.id) || r.resolver.category === 'nextdns') &&
      r.metrics.medianMs !== null,
  );

  const fastestAdBlock =
    fastestAdBlockCandidate && fastestAdBlockCandidate.metrics.medianMs !== null
      ? {
          name: fastestAdBlockCandidate.resolver.name,
          medianMs: fastestAdBlockCandidate.metrics.medianMs,
        }
      : undefined;

  const unreliableCount = usable.filter((r) => r.metrics.isUnreliable).length;
  const hasHighJitterWarning =
    fastest.metrics.isUnreliable || unreliableCount >= 2;

  return {
    fastestId: fastest.resolver.id,
    fastestName: fastest.resolver.name,
    fastestMedianMs: fastest.metrics.medianMs,
    runnerUpName: runnerUp?.resolver.name ?? null,
    runnerUpMedianMs: runnerUp?.metrics.medianMs ?? null,
    deltaMs,
    headline: `${fastest.resolver.name} paling cepat untuk internet Anda`,
    summary,
    fastestAdBlock,
    hasHighJitterWarning,
    nextDnsComparison,
  };
}
