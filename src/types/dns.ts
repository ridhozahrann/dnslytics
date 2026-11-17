export type ResolverCategory = 'nextdns' | 'adguard' | 'public' | 'custom';

export type DohFormat = 'wire' | 'json';

export type CorsCapability = 'cors' | 'no-cors' | 'unknown';

export interface PresetResolver {
  id: string;
  provider: string;
  name: string;
  variant: string;
  description: string;
  url: string;
  category: Exclude<ResolverCategory, 'custom'>;
  defaultEnabled: boolean;
  requiresNextDnsId?: boolean;
  isSubEndpoint?: boolean;
  knownCorsSupport: CorsCapability;
  format: DohFormat;
  tags: string[];
  color: string;
}

export interface ActiveResolver {
  id: string;
  provider: string;
  name: string;
  variant: string;
  description: string;
  url: string;
  category: ResolverCategory;
  format: DohFormat;
  knownCorsSupport: CorsCapability;
  tags: string[];
  color: string;
}

export interface CustomResolver {
  id: string;
  name: string;
  url: string;
  format: DohFormat;
  enabled: boolean;
}

export type TestMode = 'cache-miss' | 'cache-hit' | 'both';

export type VerificationStatus =
  | 'cors-verified'
  | 'timing-only'
  | 'cors-blocked'
  | 'failed';

export interface BenchmarkConfig {
  sampleCount: number; // 5..50, default 10
  warmupCount: number; // 1..2, default 2
  timeoutMs: number; // 3000..5000, default 4000
  testMode: TestMode;
  allowNoCorsFallback: boolean;
  nextDnsConfigId: string;
  includeNextDnsSubEndpoints: boolean;
  cacheHitDomains: string[];
}

export interface QuerySample {
  index: number;
  phase: 'warmup' | 'cache-miss' | 'cache-hit';
  domain: string;
  ok: boolean;
  latencyMs: number | null;
  transportMode: 'cors' | 'no-cors';
  rcode?: number;
  rcodeName?: string;
  ancount?: number;
  error?: string;
  errorKind?: 'cors' | 'timeout' | 'http' | 'dns' | 'network';
  timingBreakdown?: {
    dnsMs?: number;
    tcpMs?: number;
    tlsMs?: number;
    ttfbMs?: number;
  };
}

export interface ResolverMetrics {
  medianMs: number | null;
  meanMs: number | null;
  minMs: number | null;
  maxMs: number | null;
  p95Ms: number | null;
  jitterMs: number | null;
  warmupFirstMs: number | null;
  warmupAvgMs: number | null;
  successRate: number; // 0..100
  successCount: number;
  totalCount: number;
  rankScore: number; // lower is better; Infinity if 0% success
  isUnreliable: boolean;
  unreliableReason?: string;
}

export interface ResolverResult {
  resolver: ActiveResolver;
  status: VerificationStatus;
  statusReason?: string;
  metrics: ResolverMetrics;
  cacheMissMetrics?: ResolverMetrics;
  cacheHitMetrics?: ResolverMetrics;
  samples: QuerySample[];
  warmupSamples: QuerySample[];
}

export interface BenchmarkProgress {
  phase: 'idle' | 'probing' | 'warmup' | 'running' | 'complete' | 'cancelled';
  completedSteps: number;
  totalSteps: number;
  elapsedMs: number;
  perResolver: Record<
    string,
    {
      completed: number;
      total: number;
      warmupDone: number;
      warmupTotal: number;
      lastLatencyMs: number | null;
      status: 'pending' | 'running' | 'done' | 'cors-blocked' | 'error';
      transportMode?: 'cors' | 'no-cors';
    }
  >;
}

export interface BenchmarkRecommendation {
  fastestId: string | null;
  fastestName: string | null;
  fastestMedianMs: number | null;
  runnerUpName: string | null;
  runnerUpMedianMs: number | null;
  deltaMs: number | null;
  headline: string;
  summary: string;
  fastestAdBlock?: {
    name: string;
    medianMs: number;
  };
  hasHighJitterWarning?: boolean;
  nextDnsComparison?: {
    ultraLowMs: number | null;
    anycastMs: number | null;
    defaultMs: number | null;
    winner: 'ultralow' | 'anycast' | 'default' | null;
    note: string;
  };
}

export interface BenchmarkRunRecord {
  id: string;
  createdAt: string;
  networkLabel?: string;
  config: Pick<
    BenchmarkConfig,
    'sampleCount' | 'warmupCount' | 'timeoutMs' | 'testMode' | 'allowNoCorsFallback'
  >;
  hasNextDnsConfig: boolean;
  durationMs: number;
  results: ResolverResult[];
  recommendation: BenchmarkRecommendation;
  userAgent?: string;
}
