import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { BenchmarkRunRecord } from '../types/dns';

const NETWORK_PRESET_LABELS = ['Wi-Fi Rumah', 'Seluler', 'Kantor'];

interface HistoryViewProps {
  history: BenchmarkRunRecord[];
  onLoadRun: (run: BenchmarkRunRecord) => void;
  onUpdateLabel: (id: string, label: string | undefined) => void;
  onDeleteRun: (id: string) => void;
  onClearAll: () => void;
  isDark: boolean;
}

export function HistoryView({
  history,
  onLoadRun,
  onUpdateLabel,
  onDeleteRun,
  onClearAll,
  isDark,
}: HistoryViewProps) {
  const [compareAId, setCompareAId] = useState<string>(history[0]?.id ?? '');
  const [compareBId, setCompareBId] = useState<string>(history[1]?.id ?? '');

  const surface = isDark ? 'bg-[#1c1c1e]' : 'bg-[#f5f5f7]';
  const muted = isDark ? 'text-[#86868b]' : 'text-[#6e6e73]';
  const divider = isDark ? 'divide-white/8' : 'divide-black/8';
  const borderHairline = isDark ? 'border-white/8' : 'border-black/8';
  const selectCls = isDark
    ? 'border-white/10 bg-black/50 text-white'
    : 'border-black/10 bg-white text-[#1d1d1f]';

  if (history.length === 0) {
    return (
      <div className={`rounded-2xl px-6 py-14 text-center ${surface}`}>
        <h2 className="text-base font-semibold tracking-tight">Belum Ada Riwayat</h2>
        <p className={`mt-1 text-sm ${muted}`}>
          Hasil pengujian Anda akan tersimpan secara lokal di browser ini.
        </p>
      </div>
    );
  }

  const runA = history.find((h) => h.id === compareAId) ?? history[0];
  const runB = history.find((h) => h.id === compareBId) ?? history[1] ?? null;

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString('id-ID', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });

  const formatRunLabel = (h: BenchmarkRunRecord) => {
    const tag = h.networkLabel ? `[${h.networkLabel}] ` : '';
    return `${tag}${formatDate(h.createdAt)} (${h.recommendation.fastestName ?? '—'})`;
  };

  const comparisonRows =
    runA && runB && runA.id !== runB.id
      ? Array.from(
          new Set([
            ...runA.results.map((r) => r.resolver.id),
            ...runB.results.map((r) => r.resolver.id),
          ]),
        ).map((id) => {
          const itemA = runA.results.find((r) => r.resolver.id === id);
          const itemB = runB.results.find((r) => r.resolver.id === id);
          const medA = itemA?.metrics.medianMs ?? null;
          const medB = itemB?.metrics.medianMs ?? null;
          const delta =
            medA !== null && medB !== null
              ? Math.round((medA - medB) * 100) / 100
              : null;
          return {
            id,
            name: itemA?.resolver.name ?? itemB?.resolver.name ?? id,
            medA,
            medB,
            delta,
          };
        })
      : [];

  return (
    <div className="space-y-8">
      {history.length >= 2 && (
        <section className={`rounded-2xl p-6 ${surface}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold tracking-tight">
              Perbandingan Antar Waktu
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <select
                aria-label="Sesi A"
                value={runA?.id ?? ''}
                onChange={(e) => setCompareAId(e.target.value)}
                className={`rounded-xl border px-3 py-1.5 outline-none ${selectCls}`}
              >
                {history.map((h) => (
                  <option key={h.id} value={h.id}>
                    {formatRunLabel(h)}
                  </option>
                ))}
              </select>
              <span className={muted}>vs</span>
              <select
                aria-label="Sesi B"
                value={runB?.id ?? ''}
                onChange={(e) => setCompareBId(e.target.value)}
                className={`rounded-xl border px-3 py-1.5 outline-none ${selectCls}`}
              >
                {history.map((h) => (
                  <option key={h.id} value={h.id}>
                    {formatRunLabel(h)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {comparisonRows.length > 0 ? (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className={`border-b ${borderHairline} ${muted}`}>
                  <tr>
                    <th className="py-2.5 pr-4 font-medium">Nama DNS</th>
                    <th className="px-3 py-2.5 text-right font-medium">Tes A</th>
                    <th className="px-3 py-2.5 text-right font-medium">Tes B</th>
                    <th className="py-2.5 pl-3 text-right font-medium">Selisih</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${divider}`}>
                  {comparisonRows.map((row) => (
                    <tr key={row.id}>
                      <td className="py-2.5 pr-4 font-medium">{row.name}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {row.medA !== null ? `${row.medA} ms` : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {row.medB !== null ? `${row.medB} ms` : '—'}
                      </td>
                      <td className="py-2.5 pl-3 text-right font-medium tabular-nums">
                        {row.delta === null ? (
                          '—'
                        ) : row.delta < 0 ? (
                          <span className="text-[#30d158]">{row.delta} ms</span>
                        ) : row.delta > 0 ? (
                          <span className="text-[#ff453a]">+{row.delta} ms</span>
                        ) : (
                          <span className={muted}>0 ms</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className={`mt-3 text-xs ${muted}`}>
              Pilih dua tes berbeda untuk membandingkan kecepatan.
            </p>
          )}
        </section>
      )}

      <section>
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className={`text-xs font-medium uppercase tracking-wider ${muted}`}>
            Riwayat Tersimpan ({history.length})
          </h2>
          <button
            type="button"
            onClick={onClearAll}
            className="text-xs text-[#ff453a] transition hover:opacity-75"
          >
            Hapus Semua
          </button>
        </div>

        <div className={`divide-y overflow-hidden rounded-2xl ${surface} ${divider}`}>
          {history.map((item) => (
            <div
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
            >
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="text-sm font-semibold">
                    {item.recommendation.fastestName ?? 'Tidak ada hasil'}
                  </span>
                  {item.recommendation.fastestMedianMs !== null && (
                    <span className="text-xs font-medium tabular-nums text-[#30d158]">
                      {item.recommendation.fastestMedianMs} ms
                    </span>
                  )}
                  {item.networkLabel && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        isDark ? 'bg-white/10 text-white' : 'bg-black/8 text-[#1d1d1f]'
                      }`}
                    >
                      {item.networkLabel}
                    </span>
                  )}
                </div>
                <p className={`text-xs ${muted}`}>
                  {formatDate(item.createdAt)} • {item.results.length} DNS •{' '}
                  {item.config.sampleCount} sampel
                </p>
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  {NETWORK_PRESET_LABELS.map((lbl) => {
                    const active = item.networkLabel === lbl;
                    return (
                      <button
                        key={lbl}
                        type="button"
                        onClick={() =>
                          onUpdateLabel(item.id, active ? undefined : lbl)
                        }
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium transition ${
                          active
                            ? 'bg-[#0a84ff] text-white'
                            : isDark
                              ? 'bg-white/6 text-[#86868b] hover:text-white'
                              : 'bg-black/5 text-[#6e6e73] hover:text-[#1d1d1f]'
                        }`}
                      >
                        {lbl}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onLoadRun(item)}
                  className="rounded-full bg-[#0a84ff] px-3.5 py-1.5 text-xs font-medium text-white transition hover:opacity-90"
                >
                  Lihat
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteRun(item.id)}
                  aria-label="Hapus riwayat"
                  className={`rounded-full p-1.5 transition hover:text-[#ff453a] ${muted}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
