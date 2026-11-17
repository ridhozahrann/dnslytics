/// <reference lib="webworker" />
import { decodeDnsResponse, encodeDnsQuery, toBase64Url } from '../lib/dnsPacket';
import { generateCacheMissDomain, pickCacheHitDomain } from '../lib/domains';
import {
  computeResolverMetrics,
  generateRecommendation,
  sortResolverResults,
} from '../lib/stats';
import type {
  ActiveResolver,
  BenchmarkConfig,
  BenchmarkProgress,
  BenchmarkRunRecord,
  QuerySample,
  ResolverResult,
  VerificationStatus,
} from '../types/dns';

export type WorkerInboundMessage =
  | {
      type: 'start';
      runId: string;
      resolvers: ActiveResolver[];
      config: BenchmarkConfig;
    }
  | { type: 'cancel' };

export type WorkerOutboundMessage =
  | { type: 'progress'; progress: BenchmarkProgress }
  | { type: 'complete'; record: BenchmarkRunRecord }
  | { type: 'cancelled' }
  | { type: 'error'; message: string };

let activeAbortControllers = new Set<AbortController>();
let isCancelled = false;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildDohUrl(
  resolver: ActiveResolver,
  domain: string,
  seqId: number,
  useJson: boolean,
): string {
  const sep = resolver.url.includes('?') ? '&' : '?';
  if (useJson) {
    return `${resolver.url}${sep}name=${encodeURIComponent(domain)}&type=A`;
  }
  const wire = encodeDnsQuery(domain, 1, seqId);
  const b64u = toBase64Url(wire);
  return `${resolver.url}${sep}dns=${b64u}`;
}

function extractTimingBreakdown(url: string): QuerySample['timingBreakdown'] | undefined {
  if (typeof performance === 'undefined' || !performance.getEntriesByName) {
    return undefined;
  }
  const entries = performance.getEntriesByName(url, 'resource') as PerformanceResourceTiming[];
  if (!entries || entries.length === 0) return undefined;
  const entry = entries[entries.length - 1];
  // Resource timing fields are 0 when cross-origin without Timing-Allow-Origin
  if (entry.responseStart === 0 && entry.connectEnd === 0) {
    return undefined;
  }
  const round2 = (v: number) => Math.max(0, Math.round(v * 100) / 100);
  return {
    dnsMs: entry.domainLookupEnd > entry.domainLookupStart ? round2(entry.domainLookupEnd - entry.domainLookupStart) : undefined,
    tcpMs: entry.connectEnd > entry.connectStart ? round2(entry.connectEnd - entry.connectStart) : undefined,
    tlsMs:
      entry.secureConnectionStart > 0 && entry.connectEnd > entry.secureConnectionStart
        ? round2(entry.connectEnd - entry.secureConnectionStart)
        : undefined,
    ttfbMs:
      entry.responseStart > entry.requestStart ? round2(entry.responseStart - entry.requestStart) : undefined,
  };
}

async function executeSingleQuery(
  resolver: ActiveResolver,
  domain: string,
  index: number,
  phase: QuerySample['phase'],
  transportMode: 'cors' | 'no-cors',
  timeoutMs: number,
): Promise<QuerySample> {
  const useJson = resolver.format === 'json' && transportMode === 'cors';
  const url = buildDohUrl(resolver, domain, index + 1, useJson);
  const controller = new AbortController();
  activeAbortControllers.add(controller);

  const timer = setTimeout(() => {
    controller.abort('timeout');
  }, timeoutMs);

  const start = performance.now();

  try {
    const fetchOptions: RequestInit = {
      method: 'GET',
      mode: transportMode,
      cache: 'no-store',
      credentials: 'omit',
      signal: controller.signal,
    };

    // Only attach Accept header in CORS mode; no-cors forbids non-safelisted Accept values
    if (transportMode === 'cors') {
      fetchOptions.headers = {
        Accept: useJson ? 'application/dns-json' : 'application/dns-message',
      };
    }

    const response = await fetch(url, fetchOptions);

    if (transportMode === 'no-cors') {
      // Opaque response resolves once headers arrive; body is unreadable by browser policy
      const elapsed = Math.round((performance.now() - start) * 100) / 100;
      return {
        index,
        phase,
        domain,
        ok: true,
        latencyMs: elapsed,
        transportMode: 'no-cors',
        timingBreakdown: extractTimingBreakdown(url),
      };
    }

    if (!response.ok) {
      const elapsed = Math.round((performance.now() - start) * 100) / 100;
      return {
        index,
        phase,
        domain,
        ok: false,
        latencyMs: elapsed,
        transportMode: 'cors',
        error: `HTTP ${response.status}`,
        errorKind: 'http',
      };
    }

    if (useJson) {
      const data = (await response.json()) as { Status?: number; Answer?: unknown[] };
      const elapsed = Math.round((performance.now() - start) * 100) / 100;
      const rcode = typeof data.Status === 'number' ? data.Status : 0;
      const valid = rcode === 0 || rcode === 3; // NOERROR or NXDOMAIN (for random cache-miss)
      return {
        index,
        phase,
        domain,
        ok: valid,
        latencyMs: elapsed,
        transportMode: 'cors',
        rcode,
        rcodeName: rcode === 0 ? 'NOERROR' : rcode === 3 ? 'NXDOMAIN' : `RCODE_${rcode}`,
        ancount: Array.isArray(data.Answer) ? data.Answer.length : 0,
        error: valid ? undefined : `DNS Status ${rcode}`,
        errorKind: valid ? undefined : 'dns',
        timingBreakdown: extractTimingBreakdown(url),
      };
    }

    const buffer = await response.arrayBuffer();
    const elapsed = Math.round((performance.now() - start) * 100) / 100;
    const decoded = decodeDnsResponse(buffer);

    if (!decoded.valid) {
      return {
        index,
        phase,
        domain,
        ok: false,
        latencyMs: elapsed,
        transportMode: 'cors',
        rcode: decoded.rcode,
        rcodeName: decoded.rcodeName,
        ancount: decoded.ancount,
        error: `DNS ${decoded.rcodeName}`,
        errorKind: 'dns',
      };
    }

    return {
      index,
      phase,
      domain,
      ok: true,
      latencyMs: elapsed,
      transportMode: 'cors',
      rcode: decoded.rcode,
      rcodeName: decoded.rcodeName,
      ancount: decoded.ancount,
      timingBreakdown: extractTimingBreakdown(url),
    };
  } catch (err) {
    const elapsed = Math.round((performance.now() - start) * 100) / 100;
    if (controller.signal.aborted) {
      return {
        index,
        phase,
        domain,
        ok: false,
        latencyMs: elapsed,
        transportMode,
        error: `Timeout (> ${timeoutMs} ms)`,
        errorKind: 'timeout',
      };
    }
    const msg = err instanceof Error ? err.message : 'Network error';
    return {
      index,
      phase,
      domain,
      ok: false,
      latencyMs: elapsed,
      transportMode,
      error: msg,
      errorKind: transportMode === 'cors' ? 'cors' : 'network',
    };
  } finally {
    clearTimeout(timer);
    activeAbortControllers.delete(controller);
  }
}

async function runBenchmark(
  runId: string,
  resolvers: ActiveResolver[],
  config: BenchmarkConfig,
): Promise<void> {
  isCancelled = false;
  activeAbortControllers.clear();

  const startedAt = performance.now();
  const createdAt = new Date().toISOString();
  const runSalt = Math.random().toString(36).slice(2, 6);

  const perModeSamples = config.sampleCount;
  const modes: Array<'cache-miss' | 'cache-hit'> =
    config.testMode === 'both'
      ? ['cache-miss', 'cache-hit']
      : [config.testMode];

  const totalSamplesPerResolver = modes.length * perModeSamples;
  const totalWarmupsPerResolver = config.warmupCount;
  const totalSteps =
    resolvers.length * (totalWarmupsPerResolver + totalSamplesPerResolver);

  const progress: BenchmarkProgress = {
    phase: 'probing',
    completedSteps: 0,
    totalSteps,
    elapsedMs: 0,
    perResolver: {},
  };

  const resolverTransport = new Map<string, 'cors' | 'no-cors' | 'blocked'>();
  const resolverWarmups = new Map<string, QuerySample[]>();
  const resolverSamples = new Map<string, QuerySample[]>();
  const resolverErrorReason = new Map<string, string>();

  for (const r of resolvers) {
    resolverWarmups.set(r.id, []);
    resolverSamples.set(r.id, []);
    progress.perResolver[r.id] = {
      completed: 0,
      total: totalSamplesPerResolver,
      warmupDone: 0,
      warmupTotal: totalWarmupsPerResolver,
      lastLatencyMs: null,
      status: 'pending',
    };
  }

  const emitProgress = () => {
    progress.elapsedMs = Math.round(performance.now() - startedAt);
    self.postMessage({
      type: 'progress',
      progress: structuredClone(progress),
    } satisfies WorkerOutboundMessage);
  };

  emitProgress();

  // Phase 1: Warm-up & CORS capability probe (interleaved per warmup round)
  progress.phase = 'warmup';
  for (let w = 0; w < totalWarmupsPerResolver; w++) {
    if (isCancelled) return;
    for (const r of resolvers) {
      if (isCancelled) return;
      const currentTransport = resolverTransport.get(r.id);
      if (currentTransport === 'blocked') {
        progress.perResolver[r.id].warmupDone += 1;
        progress.completedSteps += 1;
        continue;
      }

      progress.perResolver[r.id].status = 'running';
      const domain = generateCacheMissDomain(runSalt, w);

      if (w === 0 && !currentTransport) {
        // Always probe CORS first to verify real RFC 8484 support
        const corsProbe = await executeSingleQuery(
          r,
          domain,
          w,
          'warmup',
          'cors',
          config.timeoutMs,
        );
        if (isCancelled) return;

        if (corsProbe.ok) {
          resolverTransport.set(r.id, 'cors');
          progress.perResolver[r.id].transportMode = 'cors';
          resolverWarmups.get(r.id)!.push(corsProbe);
          progress.perResolver[r.id].lastLatencyMs = corsProbe.latencyMs;
        } else if (corsProbe.errorKind === 'cors' && config.allowNoCorsFallback) {
          // Probe with no-cors opaque GET fallback
          const noCorsProbe = await executeSingleQuery(
            r,
            generateCacheMissDomain(runSalt, w + 100),
            w,
            'warmup',
            'no-cors',
            config.timeoutMs,
          );
          if (isCancelled) return;

          if (noCorsProbe.ok) {
            resolverTransport.set(r.id, 'no-cors');
            progress.perResolver[r.id].transportMode = 'no-cors';
            resolverWarmups.get(r.id)!.push(noCorsProbe);
            progress.perResolver[r.id].lastLatencyMs = noCorsProbe.latencyMs;
          } else {
            // Even no-cors failed (network unreachable or blocked)
            resolverTransport.set(r.id, 'cors');
            progress.perResolver[r.id].transportMode = 'cors';
            resolverWarmups.get(r.id)!.push(noCorsProbe);
          }
        } else if (corsProbe.errorKind === 'cors' && !config.allowNoCorsFallback) {
          resolverTransport.set(r.id, 'blocked');
          resolverErrorReason.set(
            r.id,
            'Resolver tidak mengirim header CORS (Access-Control-Allow-Origin).',
          );
          progress.perResolver[r.id].status = 'cors-blocked';
          resolverWarmups.get(r.id)!.push(corsProbe);
        } else {
          // Timeout or HTTP error during warmup; keep CORS mode for actual samples
          resolverTransport.set(r.id, 'cors');
          progress.perResolver[r.id].transportMode = 'cors';
          resolverWarmups.get(r.id)!.push(corsProbe);
        }
      } else {
        const mode = currentTransport === 'no-cors' ? 'no-cors' : 'cors';
        const sample = await executeSingleQuery(
          r,
          domain,
          w,
          'warmup',
          mode,
          config.timeoutMs,
        );
        if (isCancelled) return;
        if (!sample.ok && sample.errorKind === 'cors' && mode === 'cors') {
          if (config.allowNoCorsFallback) {
            const noCorsRetry = await executeSingleQuery(
              r,
              generateCacheMissDomain(runSalt, w + 200),
              w,
              'warmup',
              'no-cors',
              config.timeoutMs,
            );
            if (isCancelled) return;
            if (noCorsRetry.ok) {
              resolverTransport.set(r.id, 'no-cors');
              progress.perResolver[r.id].transportMode = 'no-cors';
              resolverWarmups.get(r.id)!.push(noCorsRetry);
              progress.perResolver[r.id].lastLatencyMs = noCorsRetry.latencyMs;
            } else {
              resolverWarmups.get(r.id)!.push(noCorsRetry);
            }
          } else {
            resolverTransport.set(r.id, 'blocked');
            resolverErrorReason.set(
              r.id,
              'Resolver tidak mengirim header CORS (Access-Control-Allow-Origin).',
            );
            progress.perResolver[r.id].status = 'cors-blocked';
            resolverWarmups.get(r.id)!.push(sample);
          }
        } else {
          resolverWarmups.get(r.id)!.push(sample);
          if (sample.ok) {
            progress.perResolver[r.id].lastLatencyMs = sample.latencyMs;
          }
        }
      }

      progress.perResolver[r.id].warmupDone += 1;
      progress.completedSteps += 1;
      emitProgress();
    }
    if (resolvers.length === 1) {
      await sleep(30);
    }
  }

  // Phase 2: Interleaved Benchmark Queries
  progress.phase = 'running';
  let globalSampleIdx = 0;

  for (const mode of modes) {
    for (let i = 0; i < perModeSamples; i++) {
      if (isCancelled) return;
      const sharedHitDomain =
        mode === 'cache-hit'
          ? pickCacheHitDomain(config.cacheHitDomains, i)
          : '';

      for (const r of resolvers) {
        if (isCancelled) return;
        const transport = resolverTransport.get(r.id) ?? 'cors';

        if (transport === 'blocked') {
          progress.perResolver[r.id].completed += 1;
          progress.completedSteps += 1;
          continue;
        }

        const domain =
          mode === 'cache-miss'
            ? generateCacheMissDomain(runSalt, globalSampleIdx + 1000)
            : sharedHitDomain;

        const sample = await executeSingleQuery(
          r,
          domain,
          globalSampleIdx,
          mode,
          transport,
          config.timeoutMs,
        );

        if (isCancelled) return;

        resolverSamples.get(r.id)!.push(sample);
        progress.perResolver[r.id].completed += 1;
        if (sample.ok) {
          progress.perResolver[r.id].lastLatencyMs = sample.latencyMs;
        }
        progress.completedSteps += 1;
        emitProgress();
      }

      globalSampleIdx += 1;
      // Small spacing when testing very few resolvers to avoid rate limiting
      if (resolvers.length <= 2) {
        await sleep(35);
      }
    }
  }

  // Phase 3: Aggregate & Rank
  const rawResults: ResolverResult[] = resolvers.map((r) => {
    const transport = resolverTransport.get(r.id);
    const warmups = resolverWarmups.get(r.id) ?? [];
    const samples = resolverSamples.get(r.id) ?? [];
    const metrics = computeResolverMetrics(samples, warmups);

    const missSamples = samples.filter((s) => s.phase === 'cache-miss');
    const hitSamples = samples.filter((s) => s.phase === 'cache-hit');

    let status: VerificationStatus;
    let statusReason: string | undefined;

    if (transport === 'blocked') {
      status = 'cors-blocked';
      statusReason =
        resolverErrorReason.get(r.id) ??
        'Tidak didukung di browser (kebijakan CORS).';
      progress.perResolver[r.id].status = 'cors-blocked';
    } else if (metrics.successCount === 0) {
      status = 'failed';
      const firstErr = samples.find((s) => s.error)?.error;
      statusReason = firstErr ?? 'Semua query gagal atau timeout.';
      progress.perResolver[r.id].status = 'error';
    } else if (transport === 'no-cors') {
      status = 'timing-only';
      statusReason =
        'Header CORS tidak tersedia pada endpoint ini; latensi diukur via opaque request (payload DNS tidak dapat diverifikasi).';
      progress.perResolver[r.id].status = 'done';
    } else {
      status = 'cors-verified';
      progress.perResolver[r.id].status = 'done';
    }

    return {
      resolver: r,
      status,
      statusReason,
      metrics,
      cacheMissMetrics:
        missSamples.length > 0 && hitSamples.length > 0
          ? computeResolverMetrics(missSamples, warmups)
          : undefined,
      cacheHitMetrics:
        missSamples.length > 0 && hitSamples.length > 0
          ? computeResolverMetrics(hitSamples, warmups)
          : undefined,
      samples,
      warmupSamples: warmups,
    };
  });

  const sorted = sortResolverResults(rawResults);
  const recommendation = generateRecommendation(
    sorted,
    Boolean(config.nextDnsConfigId.trim()),
  );

  const durationMs = Math.round(performance.now() - startedAt);
  progress.phase = 'complete';
  emitProgress();

  const record: BenchmarkRunRecord = {
    id: runId,
    createdAt,
    config: {
      sampleCount: config.sampleCount,
      warmupCount: config.warmupCount,
      timeoutMs: config.timeoutMs,
      testMode: config.testMode,
      allowNoCorsFallback: config.allowNoCorsFallback,
    },
    hasNextDnsConfig: Boolean(config.nextDnsConfigId.trim()),
    durationMs,
    results: sorted,
    recommendation,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
  };

  self.postMessage({
    type: 'complete',
    record,
  } satisfies WorkerOutboundMessage);
}

self.onmessage = (event: MessageEvent<WorkerInboundMessage>) => {
  const msg = event.data;
  if (msg.type === 'cancel') {
    isCancelled = true;
    for (const ctrl of activeAbortControllers) {
      ctrl.abort('cancelled');
    }
    activeAbortControllers.clear();
    self.postMessage({ type: 'cancelled' } satisfies WorkerOutboundMessage);
    return;
  }

  if (msg.type === 'start') {
    runBenchmark(msg.runId, msg.resolvers, msg.config).catch((err) => {
      self.postMessage({
        type: 'error',
        message: err instanceof Error ? err.message : 'Benchmark worker error',
      } satisfies WorkerOutboundMessage);
    });
  }
};
