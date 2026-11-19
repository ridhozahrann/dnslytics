import { describe, expect, it } from 'vitest';
import { decodeDnsResponse, encodeDnsQuery, toBase64Url } from '../dnsPacket';
import { getSetupAddresses } from '../dnsSetupAddresses';
import { encodeShareHash, decodeShareHash } from '../exportShare';
import { consolidateNextDnsResults } from '../nextDnsConsolidate';
import { computeResolverMetrics, median, percentile, stdDev } from '../stats';
import { validateCustomDohUrl, validateNextDnsId } from '../validation';
import type { BenchmarkRunRecord, QuerySample } from '../../types/dns';

describe('dnsPacket', () => {
  it('encodes example.com A query matching RFC 8484 wireformat', () => {
    const packet = encodeDnsQuery('example.com', 1, 0);
    expect(toBase64Url(packet)).toBe('AAABAAABAAAAAAAAB2V4YW1wbGUDY29tAAABAAE');
  });

  it('decodes valid DNS response header', () => {
    const bytes = new Uint8Array([
      0x00, 0x05, // ID 5
      0x81, 0x80, // QR=1, RCODE=0 (NOERROR)
      0x00, 0x01, // QDCOUNT=1
      0x00, 0x02, // ANCOUNT=2
      0x00, 0x00,
      0x00, 0x00,
    ]);
    const decoded = decodeDnsResponse(bytes.buffer);
    expect(decoded.valid).toBe(true);
    expect(decoded.rcodeName).toBe('NOERROR');
    expect(decoded.ancount).toBe(2);
  });

  it('marks SERVFAIL responses as invalid', () => {
    const bytes = new Uint8Array([
      0x00, 0x01,
      0x81, 0x82, // RCODE=2 SERVFAIL
      0x00, 0x01,
      0x00, 0x00,
      0x00, 0x00,
      0x00, 0x00,
    ]);
    const decoded = decodeDnsResponse(bytes.buffer);
    expect(decoded.valid).toBe(false);
    expect(decoded.rcodeName).toBe('SERVFAIL');
  });
});

describe('stats', () => {
  it('computes median, p95, and stdDev accurately', () => {
    const values = [10, 20, 30, 40, 100];
    expect(median(values)).toBe(30);
    expect(percentile(values, 95)).toBe(100);
    expect(stdDev(values)).toBeGreaterThan(30);
  });

  it('penalizes low success rate in rankScore', () => {
    const reliableSamples: QuerySample[] = [25, 26, 24, 25].map((ms, i) => ({
      index: i,
      phase: 'cache-miss',
      domain: 'a.example.com',
      ok: true,
      latencyMs: ms,
      transportMode: 'cors',
    }));
    const flakySamples: QuerySample[] = [
      { index: 0, phase: 'cache-miss', domain: 'a.example.com', ok: true, latencyMs: 18, transportMode: 'cors' },
      { index: 1, phase: 'cache-miss', domain: 'b.example.com', ok: true, latencyMs: 20, transportMode: 'cors' },
      { index: 2, phase: 'cache-miss', domain: 'c.example.com', ok: false, latencyMs: null, transportMode: 'cors', error: 'Timeout' },
      { index: 3, phase: 'cache-miss', domain: 'd.example.com', ok: false, latencyMs: null, transportMode: 'cors', error: 'Timeout' },
    ];

    const mReliable = computeResolverMetrics(reliableSamples);
    const mFlaky = computeResolverMetrics(flakySamples);
    expect(mReliable.successRate).toBe(100);
    expect(mFlaky.successRate).toBe(50);
    expect(mFlaky.isUnreliable).toBe(true);
    expect(mReliable.rankScore).toBeLessThan(mFlaky.rankScore);
  });
});

describe('validation', () => {
  it('validates NextDNS Config IDs', () => {
    expect(validateNextDnsId('').valid).toBe(true);
    expect(validateNextDnsId('a1b2c3').valid).toBe(true);
    expect(validateNextDnsId('bad id!').valid).toBe(false);
    expect(validateNextDnsId('ab').valid).toBe(false);
  });

  it('enforces HTTPS and blocks SSRF/local hosts in custom DoH URLs', () => {
    expect(validateCustomDohUrl('https://dns.example.org/dns-query').valid).toBe(true);
    expect(validateCustomDohUrl('http://dns.example.org/dns-query').valid).toBe(false);
    expect(validateCustomDohUrl('https://localhost/dns-query').valid).toBe(false);
    expect(validateCustomDohUrl('https://127.0.0.1/dns-query').valid).toBe(false);
    expect(validateCustomDohUrl('https://192.168.1.1/dns-query').valid).toBe(false);
    expect(validateCustomDohUrl('https://user:pass@dns.example.org/dns-query').valid).toBe(false);
  });
});

describe('share hash roundtrip', () => {
  it('encodes and decodes a benchmark summary including networkLabel and adblock tip', () => {
    const sampleRun: BenchmarkRunRecord = {
      id: 'run-1',
      createdAt: '2026-11-17T08:00:00.000Z',
      networkLabel: 'Wi-Fi Rumah',
      durationMs: 4200,
      hasNextDnsConfig: false,
      config: {
        sampleCount: 10,
        warmupCount: 2,
        timeoutMs: 4000,
        testMode: 'cache-miss',
        allowNoCorsFallback: true,
      },
      results: [],
      recommendation: {
        fastestId: 'cloudflare-1111',
        fastestName: 'Cloudflare 1.1.1.1',
        fastestMedianMs: 14.2,
        runnerUpName: null,
        runnerUpMedianMs: null,
        deltaMs: null,
        headline: 'Cloudflare 1.1.1.1 adalah resolver tercepat',
        summary: 'Ringkasan tes',
        fastestAdBlock: { name: 'AdGuard DNS', medianMs: 22.5 },
      },
    };
    const hash = encodeShareHash(sampleRun);
    const decoded = decodeShareHash(hash);
    expect(decoded).not.toBeNull();
    expect(decoded?.networkLabel).toBe('Wi-Fi Rumah');
    expect(decoded?.recommendation.fastestId).toBe('cloudflare-1111');
    expect(decoded?.recommendation.fastestName).toBe('Cloudflare 1.1.1.1');
    expect(decoded?.recommendation.fastestMedianMs).toBe(14.2);
    expect(decoded?.recommendation.fastestAdBlock?.name).toBe('AdGuard DNS');
  });
});

describe('consolidateNextDnsResults', () => {
  it('merges NextDNS variants into one fastest NextDNS row', () => {
    const makeSample = (ms: number): QuerySample => ({
      index: 0,
      phase: 'cache-miss',
      domain: 'a.example.com',
      ok: true,
      latencyMs: ms,
      transportMode: 'no-cors',
    });

    const record: BenchmarkRunRecord = {
      id: 'run-2',
      createdAt: '2026-11-17T08:00:00.000Z',
      durationMs: 2000,
      hasNextDnsConfig: true,
      config: {
        sampleCount: 5,
        warmupCount: 2,
        timeoutMs: 4000,
        testMode: 'cache-miss',
        allowNoCorsFallback: true,
      },
      results: [
        {
          resolver: {
            id: 'nextdns-ultralow',
            provider: 'NextDNS',
            name: 'NextDNS Ultra Low',
            variant: 'Ultra Low Latency',
            description: '',
            url: 'https://ultralow.dns.nextdns.io/a1b2c3',
            category: 'nextdns',
            format: 'wire',
            knownCorsSupport: 'no-cors',
            tags: [],
            color: '#38bdf8',
          },
          status: 'timing-only',
          metrics: computeResolverMetrics([makeSample(12)]),
          samples: [makeSample(12)],
          warmupSamples: [],
        },
        {
          resolver: {
            id: 'nextdns-anycast',
            provider: 'NextDNS',
            name: 'NextDNS Anycast',
            variant: 'Anycast',
            description: '',
            url: 'https://anycast.dns.nextdns.io/a1b2c3',
            category: 'nextdns',
            format: 'wire',
            knownCorsSupport: 'no-cors',
            tags: [],
            color: '#818cf8',
          },
          status: 'timing-only',
          metrics: computeResolverMetrics([makeSample(85)]),
          samples: [makeSample(85)],
          warmupSamples: [],
        },
        {
          resolver: {
            id: 'cloudflare-1111',
            provider: 'Cloudflare',
            name: 'Cloudflare 1.1.1.1',
            variant: '1.1.1.1',
            description: '',
            url: 'https://cloudflare-dns.com/dns-query',
            category: 'public',
            format: 'wire',
            knownCorsSupport: 'cors',
            tags: [],
            color: '#fb923c',
          },
          status: 'cors-verified',
          metrics: computeResolverMetrics([makeSample(15)]),
          samples: [makeSample(15)],
          warmupSamples: [],
        },
      ],
      recommendation: {
        fastestId: 'nextdns-ultralow',
        fastestName: 'NextDNS Ultra Low',
        fastestMedianMs: 12,
        runnerUpName: 'Cloudflare 1.1.1.1',
        runnerUpMedianMs: 15,
        deltaMs: 3,
        headline: 'NextDNS Ultra Low tercepat',
        summary: 'Ringkasan',
      },
    };

    const consolidated = consolidateNextDnsResults(record);
    expect(consolidated.results).toHaveLength(2);
    expect(consolidated.results[0].resolver.name).toBe('NextDNS');
    expect(consolidated.results[0].resolver.variant).toContain('Ultra Low');
    expect(consolidated.results[0].metrics.medianMs).toBe(12);
    expect(consolidated.recommendation.fastestName).toBe('NextDNS');
  });
});

describe('getSetupAddresses', () => {
  it('returns ready-to-copy addresses for NextDNS with Config ID and AdGuard', () => {
    const baseResult = (id: string, name: string, variant: string): BenchmarkRunRecord['results'][number] => ({
      resolver: {
        id,
        provider: 'Test',
        name,
        variant,
        description: '',
        url: '',
        category: 'public',
        format: 'wire',
        knownCorsSupport: 'cors',
        tags: [],
        color: '#0a84ff',
      },
      status: 'cors-verified',
      metrics: computeResolverMetrics([]),
      samples: [],
      warmupSamples: [],
    });

    const nd = getSetupAddresses(
      baseResult('nextdns-unified', 'NextDNS', 'Jalur terbaik: Ultra Low'),
      'xyz789',
    );
    expect(nd.androidDot).toBe('xyz789.dns.nextdns.io');
    expect(nd.dohUrl).toBe('https://ultralow.dns.nextdns.io/xyz789');

    const ag = getSetupAddresses(baseResult('adguard-default', 'AdGuard DNS', 'Blokir Iklan'));
    expect(ag.androidDot).toBe('dns.adguard-dns.com');
    expect(ag.ipv4).toContain('94.140.14.14');
  });
});
