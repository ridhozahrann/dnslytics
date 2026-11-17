import type { ActiveResolver, BenchmarkProgress } from '../types/dns';

interface ProgressPanelProps {
  progress: BenchmarkProgress;
  resolvers: ActiveResolver[];
  separateNextDnsVariants: boolean;
  onCancel: () => void;
  isDark: boolean;
}

export function ProgressPanel({
  progress,
  resolvers,
  separateNextDnsVariants,
  onCancel,
  isDark,
}: ProgressPanelProps) {
  const pct =
    progress.totalSteps > 0
      ? Math.min(100, Math.round((progress.completedSteps / progress.totalSteps) * 100))
      : 0;

  const phaseLabel =
    progress.phase === 'probing'
      ? 'Menyiapkan pengujian...'
      : progress.phase === 'warmup'
        ? 'Kalibrasi koneksi awal...'
        : 'Mengukur kecepatan DNS...';

  // Collapse NextDNS sub-rows into one clean "NextDNS" progress row unless separated
  const displayRows: Array<{
    key: string;
    name: string;
    done: number;
    total: number;
    lastMs: number | null;
    blocked: boolean;
  }> = [];

  const nextDnsItems = resolvers.filter((r) => r.category === 'nextdns');
  const nonNextDnsItems = resolvers.filter((r) => r.category !== 'nextdns');

  for (const r of nonNextDnsItems) {
    const st = progress.perResolver[r.id];
    if (!st) continue;
    displayRows.push({
      key: r.id,
      name: r.name,
      done: st.completed + st.warmupDone,
      total: st.total + st.warmupTotal,
      lastMs: st.lastLatencyMs,
      blocked: st.status === 'cors-blocked',
    });
  }

  if (nextDnsItems.length > 0) {
    if (separateNextDnsVariants) {
      for (const r of nextDnsItems) {
        const st = progress.perResolver[r.id];
        if (!st) continue;
        displayRows.push({
          key: r.id,
          name: r.name,
          done: st.completed + st.warmupDone,
          total: st.total + st.warmupTotal,
          lastMs: st.lastLatencyMs,
          blocked: st.status === 'cors-blocked',
        });
      }
    } else {
      let done = 0;
      let total = 0;
      let bestMs: number | null = null;
      let allBlocked = true;
      for (const r of nextDnsItems) {
        const st = progress.perResolver[r.id];
        if (!st) continue;
        done += st.completed + st.warmupDone;
        total += st.total + st.warmupTotal;
        if (st.status !== 'cors-blocked') allBlocked = false;
        if (st.lastLatencyMs !== null) {
          bestMs = bestMs === null ? st.lastLatencyMs : Math.min(bestMs, st.lastLatencyMs);
        }
      }
      displayRows.push({
        key: 'nextdns-unified',
        name: 'NextDNS',
        done,
        total,
        lastMs: bestMs,
        blocked: allBlocked,
      });
    }
  }

  return (
    <section
      aria-live="polite"
      className={`rounded-2xl p-6 ${isDark ? 'bg-[#1c1c1e]' : 'bg-[#f5f5f7]'}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold tracking-tight">{phaseLabel}</h2>
          <p className={`mt-0.5 text-xs tabular-nums ${isDark ? 'text-[#86868b]' : 'text-[#6e6e73]'}`}>
            {pct}% selesai • {(progress.elapsedMs / 1000).toFixed(1)} detik
          </p>
        </div>

        <button
          type="button"
          onClick={onCancel}
          className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${
            isDark
              ? 'bg-white/10 text-white hover:bg-white/15'
              : 'bg-black/8 text-[#1d1d1f] hover:bg-black/12'
          }`}
        >
          Berhenti
        </button>
      </div>

      <div className={`mt-4 h-1.5 w-full overflow-hidden rounded-full ${isDark ? 'bg-white/10' : 'bg-black/10'}`}>
        <div
          className="h-full rounded-full bg-[#0a84ff] transition-all duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className={`mt-5 divide-y ${isDark ? 'divide-white/8' : 'divide-black/8'}`}>
        {displayRows.map((row) => (
          <div
            key={row.key}
            className="flex items-center justify-between py-2.5 text-xs"
          >
            <span className="font-medium">{row.name}</span>
            <div className="flex items-center gap-4 tabular-nums">
              <span className={isDark ? 'text-[#86868b]' : 'text-[#6e6e73]'}>
                {row.done}/{row.total}
              </span>
              <span className="w-16 text-right font-medium">
                {row.blocked
                  ? 'Diblokir'
                  : row.lastMs !== null
                    ? `${row.lastMs} ms`
                    : '—'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
