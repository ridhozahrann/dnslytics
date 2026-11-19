import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CliVisualizer } from './components/CliVisualizer';
import { Header, type AppTab } from './components/Header';
import { HistoryView } from './components/HistoryView';
import { MethodologyGuide } from './components/MethodologyGuide';
import { ProgressPanel } from './components/ProgressPanel';
import { ResolverConfigurator } from './components/ResolverConfigurator';
import { ResultsDashboard } from './components/ResultsDashboard';
import presetsRaw from './data/resolvers.json';
import { decodeCliShareHash } from './lib/cliImport';
import { DEFAULT_CACHE_HIT_DOMAINS } from './lib/domains';
import { decodeShareHash } from './lib/exportShare';
import { consolidateNextDnsResults } from './lib/nextDnsConsolidate';
import type { CliReport } from './types/cli';
import {
  clearHistory,
  deleteHistoryEntry,
  loadCustomResolvers,
  loadHistory,
  loadSavedNextDnsId,
  loadTheme,
  saveCustomResolvers,
  saveNextDnsId,
  saveRunToHistory,
  saveTheme,
  updateHistoryNetworkLabel,
} from './lib/storage';
import { validateNextDnsId } from './lib/validation';
import type {
  ActiveResolver,
  BenchmarkConfig,
  BenchmarkProgress,
  BenchmarkRunRecord,
  CustomResolver,
  PresetResolver,
} from './types/dns';
import type {
  WorkerInboundMessage,
  WorkerOutboundMessage,
} from './workers/benchmarkWorker';

const PRESETS = presetsRaw as PresetResolver[];

const DEFAULT_PUBLIC_IDS = new Set([
  'cloudflare-1111',
  'google-public',
  'adguard-default',
  'quad9-default',
]);

export function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => loadTheme());
  const [cliReportFromHash, setCliReportFromHash] = useState<CliReport | null>(() =>
    decodeCliShareHash(window.location.hash),
  );
  const [activeTab, setActiveTab] = useState<AppTab>(() =>
    decodeCliShareHash(window.location.hash) ? 'cli' : 'benchmark',
  );

  const [enabledPresetIds, setEnabledPresetIds] = useState<Set<string>>(
    () => new Set(DEFAULT_PUBLIC_IDS),
  );
  const [customResolvers, setCustomResolvers] = useState<CustomResolver[]>(() =>
    loadCustomResolvers(),
  );

  const [savedNextDnsId] = useState<string>(() => loadSavedNextDnsId());
  const [nextDnsEnabled, setNextDnsEnabled] = useState<boolean>(
    () => savedNextDnsId.length > 0,
  );
  const [separateNextDnsVariants, setSeparateNextDnsVariants] = useState(false);
  const [persistNextDnsId, setPersistNextDnsId] = useState<boolean>(
    () => savedNextDnsId.length > 0,
  );

  const [config, setConfig] = useState<BenchmarkConfig>(() => ({
    sampleCount: 10,
    warmupCount: 2,
    timeoutMs: 4000,
    testMode: 'cache-miss',
    allowNoCorsFallback: true,
    nextDnsConfigId: savedNextDnsId,
    includeNextDnsSubEndpoints: false,
    cacheHitDomains: DEFAULT_CACHE_HIT_DOMAINS,
  }));

  const [history, setHistory] = useState<BenchmarkRunRecord[]>(() =>
    loadHistory(),
  );
  const [currentRun, setCurrentRun] = useState<BenchmarkRunRecord | null>(() =>
    decodeShareHash(window.location.hash),
  );
  const [isSharedPreview, setIsSharedPreview] = useState<boolean>(() =>
    decodeShareHash(window.location.hash) !== null,
  );

  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<BenchmarkProgress | null>(null);
  const [activeRunResolvers, setActiveRunResolvers] = useState<ActiveResolver[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
    } else {
      root.classList.add('light');
      root.classList.remove('dark');
    }
    saveTheme(theme);
  }, [theme]);

  useEffect(() => {
    const onHashChange = () => {
      const cliDecoded = decodeCliShareHash(window.location.hash);
      if (cliDecoded) {
        setCliReportFromHash(cliDecoded);
        setActiveTab('cli');
        return;
      }
      const decoded = decodeShareHash(window.location.hash);
      if (decoded) {
        setCurrentRun(decoded);
        setIsSharedPreview(true);
        setActiveTab('benchmark');
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    const check = validateNextDnsId(config.nextDnsConfigId);
    if (persistNextDnsId && check.valid) {
      saveNextDnsId(check.normalized, true);
    } else if (!persistNextDnsId) {
      saveNextDnsId('', false);
    }
  }, [config.nextDnsConfigId, persistNextDnsId]);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const selectedResolvers: ActiveResolver[] = useMemo(() => {
    const nextDnsCheck = validateNextDnsId(config.nextDnsConfigId);
    const hasValidNextDns =
      nextDnsEnabled && nextDnsCheck.valid && nextDnsCheck.normalized.length > 0;

    const activeFromPresets: ActiveResolver[] = [];
    for (const p of PRESETS) {
      if (p.category === 'nextdns') {
        if (!hasValidNextDns) continue;
        if (p.isSubEndpoint) continue;
        activeFromPresets.push({
          id: p.id,
          provider: p.provider,
          name: p.name,
          variant: p.variant,
          description: p.description,
          url: p.url.replace('{configId}', nextDnsCheck.normalized),
          category: p.category,
          format: p.format,
          knownCorsSupport: p.knownCorsSupport,
          tags: p.tags,
          color: p.color,
        });
      } else if (enabledPresetIds.has(p.id)) {
        activeFromPresets.push({
          id: p.id,
          provider: p.provider,
          name: p.name,
          variant: p.variant,
          description: p.description,
          url: p.url,
          category: p.category,
          format: p.format,
          knownCorsSupport: p.knownCorsSupport,
          tags: p.tags,
          color: p.color,
        });
      }
    }

    const activeCustom: ActiveResolver[] = customResolvers
      .filter((c) => c.enabled)
      .map((c) => ({
        id: c.id,
        provider: 'Kustom',
        name: c.name,
        variant: c.format === 'json' ? 'DoH JSON' : 'DoH Standar',
        description: 'Alamat DNS kustom',
        url: c.url,
        category: 'custom',
        format: c.format,
        knownCorsSupport: 'unknown',
        tags: ['Kustom'],
        color: '#0a84ff',
      }));

    return [...activeFromPresets, ...activeCustom];
  }, [enabledPresetIds, customResolvers, nextDnsEnabled, config.nextDnsConfigId]);

  const displayResolverCount = useMemo(() => {
    const nonNextDns = selectedResolvers.filter((r) => r.category !== 'nextdns').length;
    const hasNextDns = selectedResolvers.some((r) => r.category === 'nextdns');
    if (!hasNextDns) return nonNextDns;
    return separateNextDnsVariants
      ? selectedResolvers.length
      : nonNextDns + 1;
  }, [selectedResolvers, separateNextDnsVariants]);

  const handleTogglePreset = useCallback((id: string) => {
    setEnabledPresetIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleAddCustomResolver = useCallback((item: CustomResolver) => {
    setCustomResolvers((prev) => {
      const next = [...prev, item];
      saveCustomResolvers(next);
      return next;
    });
  }, []);

  const handleToggleCustomResolver = useCallback((id: string) => {
    setCustomResolvers((prev) => {
      const next = prev.map((c) =>
        c.id === id ? { ...c, enabled: !c.enabled } : c,
      );
      saveCustomResolvers(next);
      return next;
    });
  }, []);

  const handleRemoveCustomResolver = useCallback((id: string) => {
    setCustomResolvers((prev) => {
      const next = prev.filter((c) => c.id !== id);
      saveCustomResolvers(next);
      return next;
    });
  }, []);

  const handleStartBenchmark = () => {
    setErrorMsg(null);
    if (nextDnsEnabled) {
      const nextDnsCheck = validateNextDnsId(config.nextDnsConfigId);
      if (!config.nextDnsConfigId.trim()) {
        setErrorMsg('Masukkan ID NextDNS Anda, atau matikan sakelar NextDNS jika tidak digunakan.');
        return;
      }
      if (!nextDnsCheck.valid) {
        setErrorMsg(nextDnsCheck.error ?? 'ID NextDNS tidak valid.');
        return;
      }
    }
    if (selectedResolvers.length === 0) {
      setErrorMsg('Pilih minimal satu DNS untuk diuji.');
      return;
    }

    if (isSharedPreview && window.location.hash.startsWith('#s=')) {
      window.history.replaceState(null, '', window.location.pathname);
    }
    setIsSharedPreview(false);

    workerRef.current?.terminate();
    const worker = new Worker(
      new URL('./workers/benchmarkWorker.ts', import.meta.url),
      { type: 'module' },
    );
    workerRef.current = worker;

    setActiveRunResolvers(selectedResolvers);
    setIsRunning(true);
    setProgress({
      phase: 'probing',
      completedSteps: 0,
      totalSteps:
        selectedResolvers.length *
        (config.warmupCount +
          config.sampleCount * (config.testMode === 'both' ? 2 : 1)),
      elapsedMs: 0,
      perResolver: {},
    });

    const separateVariants = separateNextDnsVariants;
    worker.onmessage = (event: MessageEvent<WorkerOutboundMessage>) => {
      const msg = event.data;
      if (msg.type === 'progress') {
        setProgress(msg.progress);
      } else if (msg.type === 'complete') {
        setIsRunning(false);
        setProgress(null);
        const finalRecord = separateVariants
          ? msg.record
          : consolidateNextDnsResults(msg.record);
        setCurrentRun(finalRecord);
        setHistory(saveRunToHistory(finalRecord));
        worker.terminate();
        workerRef.current = null;
        setTimeout(() => {
          resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 80);
      } else if (msg.type === 'cancelled') {
        setIsRunning(false);
        setProgress(null);
        worker.terminate();
        workerRef.current = null;
      } else if (msg.type === 'error') {
        setIsRunning(false);
        setProgress(null);
        setErrorMsg(msg.message);
        worker.terminate();
        workerRef.current = null;
      }
    };

    worker.onerror = () => {
      setIsRunning(false);
      setProgress(null);
      setErrorMsg('Terjadi kesalahan saat menjalankan pengujian.');
      worker.terminate();
      workerRef.current = null;
    };

    worker.postMessage({
      type: 'start',
      runId: `run-${Date.now()}`,
      resolvers: selectedResolvers,
      config,
    } satisfies WorkerInboundMessage);
  };

  const handleCancelBenchmark = () => {
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'cancel' } satisfies WorkerInboundMessage);
    }
  };

  const handleUpdateNetworkLabel = useCallback(
    (id: string, label: string | undefined) => {
      setHistory(updateHistoryNetworkLabel(id, label));
      setCurrentRun((prev) =>
        prev && prev.id === id ? { ...prev, networkLabel: label } : prev,
      );
    },
    [],
  );

  const isDark = theme === 'dark';
  const muted = isDark ? 'text-[#86868b]' : 'text-[#6e6e73]';

  return (
    <div className="min-h-screen flex flex-col">
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        historyCount={history.length}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
      />

      <main className="mx-auto w-full max-w-4xl flex-1 space-y-10 px-4 pb-16 pt-8 sm:px-6 sm:pt-14">
        {activeTab === 'benchmark' && (
          <>
            <section className="mx-auto max-w-xl text-center">
              <h1 className="text-3xl font-semibold tracking-[-0.025em] sm:text-5xl">
                Cari DNS tercepat untuk internet Anda.
              </h1>
              <p className={`mt-3 text-sm leading-relaxed sm:text-base ${muted}`}>
                Uji kecepatan DNS langsung dari browser dalam beberapa detik, tanpa instal aplikasi.
              </p>

              <div className="mt-7 flex flex-col items-center gap-3">
                <button
                  type="button"
                  disabled={isRunning}
                  onClick={handleStartBenchmark}
                  className={`rounded-full px-8 py-3 text-sm font-medium transition ${
                    isRunning
                      ? isDark
                        ? 'cursor-not-allowed bg-white/10 text-[#86868b]'
                        : 'cursor-not-allowed bg-black/10 text-[#6e6e73]'
                      : isDark
                        ? 'bg-[#0a84ff] text-white hover:bg-[#409cff] active:scale-[0.99]'
                        : 'bg-[#0071e3] text-white hover:bg-[#0077ed] active:scale-[0.99]'
                  }`}
                >
                  {isRunning ? 'Menguji kecepatan...' : 'Mulai Tes'}
                </button>

                <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
                  <div
                    className={`inline-flex rounded-full p-0.5 ${
                      isDark ? 'bg-[#1c1c1e]' : 'bg-[#f5f5f7]'
                    }`}
                  >
                    <button
                      type="button"
                      disabled={isRunning}
                      onClick={() => setConfig((c) => ({ ...c, sampleCount: 10 }))}
                      className={`rounded-full px-3 py-1 text-[11px] font-medium transition ${
                        config.sampleCount <= 10
                          ? isDark
                            ? 'bg-[#2c2c2e] text-white'
                            : 'bg-white text-[#1d1d1f] shadow-xs'
                          : muted
                      }`}
                    >
                      Tes Cepat
                    </button>
                    <button
                      type="button"
                      disabled={isRunning}
                      onClick={() => setConfig((c) => ({ ...c, sampleCount: 25 }))}
                      className={`rounded-full px-3 py-1 text-[11px] font-medium transition ${
                        config.sampleCount > 10
                          ? isDark
                            ? 'bg-[#2c2c2e] text-white'
                            : 'bg-white text-[#1d1d1f] shadow-xs'
                          : muted
                      }`}
                    >
                      Tes Akurat
                    </button>
                  </div>
                  <span className={muted}>• {displayResolverCount} DNS dipilih</span>
                </div>
              </div>

              {errorMsg && (
                <p className="mt-4 text-xs text-[#ff453a]">{errorMsg}</p>
              )}
            </section>

            {isRunning && progress && (
              <ProgressPanel
                progress={progress}
                resolvers={activeRunResolvers}
                separateNextDnsVariants={separateNextDnsVariants}
                onCancel={handleCancelBenchmark}
                isDark={isDark}
              />
            )}

            {currentRun && !isRunning && (
              <div ref={resultsRef}>
                <ResultsDashboard
                  run={currentRun}
                  nextDnsConfigId={config.nextDnsConfigId}
                  isSharedPreview={isSharedPreview}
                  onUpdateNetworkLabel={handleUpdateNetworkLabel}
                  isDark={isDark}
                />
              </div>
            )}

            <ResolverConfigurator
              presets={PRESETS}
              enabledPresetIds={enabledPresetIds}
              onTogglePreset={handleTogglePreset}
              nextDnsEnabled={nextDnsEnabled}
              onToggleNextDns={() => setNextDnsEnabled((v) => !v)}
              separateNextDnsVariants={separateNextDnsVariants}
              onToggleSeparateNextDnsVariants={() =>
                setSeparateNextDnsVariants((v) => !v)
              }
              customResolvers={customResolvers}
              onAddCustomResolver={handleAddCustomResolver}
              onToggleCustomResolver={handleToggleCustomResolver}
              onRemoveCustomResolver={handleRemoveCustomResolver}
              config={config}
              onConfigChange={setConfig}
              persistNextDnsId={persistNextDnsId}
              onTogglePersistNextDnsId={setPersistNextDnsId}
              disabled={isRunning}
              isDark={isDark}
            />
          </>
        )}

        {activeTab === 'cli' && (
          <CliVisualizer
            key={cliReportFromHash?.createdAt ?? 'cli-default'}
            defaultNextDnsId={config.nextDnsConfigId}
            initialReport={cliReportFromHash}
            isDark={isDark}
          />
        )}

        {activeTab === 'history' && (
          <HistoryView
            history={history}
            onLoadRun={(run) => {
              setCurrentRun(run);
              setIsSharedPreview(false);
              setActiveTab('benchmark');
            }}
            onUpdateLabel={handleUpdateNetworkLabel}
            onDeleteRun={(id) => setHistory(deleteHistoryEntry(id))}
            onClearAll={() => {
              clearHistory();
              setHistory([]);
            }}
            isDark={isDark}
          />
        )}

        {activeTab === 'guide' && (
          <MethodologyGuide
            isDark={isDark}
            onOpenCliTab={() => setActiveTab('cli')}
          />
        )}
      </main>

      <footer
        className={`border-t py-6 text-xs ${
          isDark ? 'border-white/8 text-[#86868b]' : 'border-black/8 text-[#6e6e73]'
        }`}
      >
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-2 px-4 sm:px-6">
          <span>DNSlytics • Semua pengujian berjalan langsung di browser Anda.</span>
          <button
            type="button"
            onClick={() => setActiveTab('guide')}
            className="text-[#0a84ff] hover:underline"
          >
            Cara Membaca Hasil &amp; Ganti DNS
          </button>
        </div>
      </footer>
    </div>
  );
}

export default App;
