import type { BenchmarkRunRecord, ResolverResult } from '../types/dns';
import { generateRecommendation, sortResolverResults } from './stats';

const NEXTDNS_VARIANT_LABELS: Record<string, string> = {
  'nextdns-ultralow': 'Ultra Low',
  'nextdns-anycast': 'Anycast',
  'nextdns-default': 'Default',
};

/**
 * Merges NextDNS sub-results (Ultra Low, Anycast, Default) into a single
 * unified "NextDNS" entry using the fastest working variant, so everyday users
 * see one clean NextDNS row while still getting the best route recommendation.
 */
export function consolidateNextDnsResults(
  record: BenchmarkRunRecord,
): BenchmarkRunRecord {
  const nextDnsItems = record.results.filter(
    (r) =>
      r.resolver.category === 'nextdns' &&
      NEXTDNS_VARIANT_LABELS[r.resolver.id] !== undefined,
  );

  if (nextDnsItems.length <= 1) {
    return record;
  }

  const others = record.results.filter(
    (r) =>
      r.resolver.category !== 'nextdns' ||
      NEXTDNS_VARIANT_LABELS[r.resolver.id] === undefined,
  );

  const sortedNextDns = sortResolverResults(nextDnsItems);
  const best = sortedNextDns[0];

  const variantNotes = sortedNextDns
    .filter((item) => item.metrics.medianMs !== null)
    .map(
      (item) =>
        `${NEXTDNS_VARIANT_LABELS[item.resolver.id]}: ${item.metrics.medianMs} ms`,
    );

  const bestLabel = NEXTDNS_VARIANT_LABELS[best.resolver.id] ?? 'Default';

  const unified: ResolverResult = {
    ...best,
    resolver: {
      ...best.resolver,
      id: 'nextdns-unified',
      name: 'NextDNS',
      variant:
        best.metrics.medianMs !== null
          ? `Jalur terbaik: ${bestLabel}`
          : 'NextDNS',
      description:
        variantNotes.length > 0 ? variantNotes.join(' • ') : best.resolver.description,
    },
  };

  const mergedSorted = sortResolverResults([...others, unified]);
  const recommendation = generateRecommendation(
    mergedSorted,
    record.hasNextDnsConfig,
  );

  // Preserve the Ultra Low vs Anycast comparison metadata from raw results
  recommendation.nextDnsComparison = record.recommendation.nextDnsComparison;

  if (
    recommendation.fastestId === 'nextdns-unified' &&
    best.metrics.medianMs !== null
  ) {
    const runnerUp = mergedSorted.find(
      (r) => r.resolver.id !== 'nextdns-unified' && r.metrics.medianMs !== null,
    );
    const delta =
      runnerUp && runnerUp.metrics.medianMs !== null
        ? Math.round((runnerUp.metrics.medianMs - best.metrics.medianMs) * 100) / 100
        : null;
    recommendation.headline = 'NextDNS paling cepat untuk internet Anda';
    recommendation.summary =
      runnerUp && delta !== null
        ? `NextDNS (jalur ${bestLabel}) merespons dalam ${best.metrics.medianMs} ms — lebih cepat ${delta} ms dibanding ${runnerUp.resolver.name} (${runnerUp.metrics.medianMs} ms).`
        : `NextDNS (jalur ${bestLabel}) merespons dalam ${best.metrics.medianMs} ms.`;
  }

  return {
    ...record,
    results: mergedSorted,
    recommendation,
  };
}
