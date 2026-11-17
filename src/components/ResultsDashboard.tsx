import { Check, ChevronDown, ChevronUp, Copy, Share2 } from 'lucide-react';
import { Fragment, useState } from 'react';
import { getSetupAddresses } from '../lib/dnsSetupAddresses';
import {
  downloadTextFile,
  encodeShareHash,
  exportResultsToCsv,
  exportResultsToJson,
  exportResultsToPng,
} from '../lib/exportShare';
import type { BenchmarkRunRecord, ResolverResult } from '../types/dns';
import { LatencyCharts } from './LatencyCharts';

const NETWORK_PRESET_LABELS = ['Wi-Fi Rumah', 'Seluler', 'Kantor'];

interface ResultsDashboardProps {
  run: BenchmarkRunRecord;
  nextDnsConfigId?: string;
  isSharedPreview?: boolean;
  onUpdateNetworkLabel?: (id: string, label: string | undefined) => void;
  isDark: boolean;
}

function TechnicalStatusLabel({
  status,
  isDark,
}: {
  status: ResolverResult['status'];
  isDark: boolean;
}) {
  switch (status) {
    case 'cors-verified':
      return <span className="text-[#30d158]">Terverifikasi</span>;
    case 'timing-only':
      return (
        <span className={isDark ? 'text-[#ffd60a]' : 'text-[#b28704]'}>
          Timing-Only
        </span>
      );
    case 'cors-blocked':
      return <span className="text-[#ff453a]">Diblokir CORS</span>;
    case 'failed':
      return <span className="text-[#ff453a]">Gagal</span>;
  }
}

export function ResultsDashboard({
  run,
  nextDnsConfigId,
  isSharedPreview = false,
  onUpdateNetworkLabel,
  isDark,
}: ResultsDashboardProps) {
  const [showTechnical, setShowTechnical] = useState(false);
  const [showSetupDrawer, setShowSetupDrawer] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedShare, setCopiedShare] = useState(false);

  const surface = isDark ? 'bg-[#1c1c1e]' : 'bg-[#f5f5f7]';
  const muted = isDark ? 'text-[#86868b]' : 'text-[#6e6e73]';
  const divider = isDark ? 'divide-white/8' : 'divide-black/8';
  const borderHairline = isDark ? 'border-white/8' : 'border-black/8';

  const winnerResult = run.results.find(
    (r) =>
      r.resolver.id === run.recommendation.fastestId &&
      r.metrics.medianMs !== null,
  );
  const setupInfo = winnerResult
    ? getSetupAddresses(winnerResult, nextDnsConfigId)
    : null;

  const handleCopyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleCopyShare = async () => {
    const hash = encodeShareHash(run);
    const shareUrl = `${window.location.origin}${window.location.pathname}${hash}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedShare(true);
      setTimeout(() => setCopiedShare(false), 2500);
    } catch {
      window.location.hash = hash;
      setCopiedShare(true);
      setTimeout(() => setCopiedShare(false), 2500);
    }
  };

  const handleDownloadCsv = () => {
    const csv = exportResultsToCsv(run);
    downloadTextFile(
      csv,
      `dnslytics-${run.createdAt.slice(0, 10)}.csv`,
      'text/csv;charset=utf-8',
    );
  };

  const handleDownloadJson = () => {
    const json = exportResultsToJson(run);
    downloadTextFile(
      json,
      `dnslytics-${run.createdAt.slice(0, 10)}.json`,
      'application/json;charset=utf-8',
    );
  };

  const dateFormatted = new Date(run.createdAt).toLocaleString('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const actionBtn = `rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
    isDark
      ? 'bg-white/8 text-white hover:bg-white/14'
      : 'bg-black/6 text-[#1d1d1f] hover:bg-black/10'
  }`;

  return (
    <div className="space-y-6">
      {isSharedPreview && (
        <div
          className={`rounded-2xl px-4 py-3 text-xs ${
            isDark ? 'bg-[#1c1c1e] text-[#d1d1d6]' : 'bg-[#f5f5f7] text-[#3a3a3c]'
          }`}
        >
          Menampilkan hasil tes yang dibagikan ({dateFormatted}). Tekan{' '}
          <strong>Mulai Tes</strong> untuk menguji dari internet Anda sendiri.
        </div>
      )}

      {/* Hero Summary Card */}
      <section className={`rounded-2xl p-6 sm:p-8 ${surface}`}>
        <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
          <div className="max-w-2xl space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {run.recommendation.fastestName && (
                <span className="font-semibold uppercase tracking-wider text-[#30d158]">
                  Paling Cepat
                </span>
              )}
              <span className={muted}>
                {dateFormatted} • Selesai dalam {(run.durationMs / 1000).toFixed(1)} detik
              </span>
              {run.networkLabel && (
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    isDark ? 'bg-white/10 text-white' : 'bg-black/8 text-[#1d1d1f]'
                  }`}
                >
                  {run.networkLabel}
                </span>
              )}
            </div>

            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {run.recommendation.fastestName ?? run.recommendation.headline}
            </h2>
            <p className={`text-sm leading-relaxed ${muted}`}>
              {run.recommendation.summary}
            </p>
          </div>

          {run.recommendation.fastestMedianMs !== null && (
            <div className="shrink-0 sm:text-right">
              <div className={`text-xs ${muted}`}>Waktu Respons</div>
              <div className="text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">
                {run.recommendation.fastestMedianMs}
                <span className={`ml-1 text-lg font-normal ${muted}`}>ms</span>
              </div>
            </div>
          )}
        </div>

        {/* Contextual tips (Adblock alternative, NextDNS route, Jitter warning) */}
        {(run.recommendation.fastestAdBlock ||
          run.recommendation.nextDnsComparison ||
          run.recommendation.hasHighJitterWarning) && (
          <div className={`mt-5 space-y-1.5 border-t pt-4 text-xs ${borderHairline} ${muted}`}>
            {run.recommendation.fastestAdBlock && (
              <p>
                <span className={isDark ? 'font-medium text-white' : 'font-medium text-[#1d1d1f]'}>
                  Jika ingin sekaligus blokir iklan:{' '}
                </span>
                {run.recommendation.fastestAdBlock.name} ({run.recommendation.fastestAdBlock.medianMs} ms).
              </p>
            )}
            {run.recommendation.nextDnsComparison && (
              <p>
                <span className={isDark ? 'font-medium text-white' : 'font-medium text-[#1d1d1f]'}>
                  Tips NextDNS:{' '}
                </span>
                {run.recommendation.nextDnsComparison.note}
              </p>
            )}
            {run.recommendation.hasHighJitterWarning && (
              <p className={isDark ? 'text-[#ffd60a]' : 'text-[#b28704]'}>
                Koneksi sempat mengalami lonjakan kecepatan. Coba ulangi dengan mode Tes Akurat untuk hasil lebih pasti.
              </p>
            )}
          </div>
        )}

        {/* Action Pills */}
        <div
          className={`mt-6 flex flex-wrap items-center gap-2 border-t pt-5 ${borderHairline}`}
        >
          {setupInfo && (
            <button
              type="button"
              onClick={() => setShowSetupDrawer((v) => !v)}
              className="rounded-full bg-[#30d158] px-4 py-1.5 text-xs font-semibold text-black transition hover:opacity-90"
            >
              {showSetupDrawer ? 'Tutup Cara Pasang' : 'Pasang DNS Ini'}
            </button>
          )}
          <button
            type="button"
            onClick={() => exportResultsToPng(run, isDark ? 'dark' : 'light')}
            className={actionBtn}
          >
            Simpan Gambar
          </button>
          <button
            type="button"
            onClick={handleDownloadCsv}
            className={actionBtn}
          >
            Unduh CSV
          </button>
          {showTechnical && (
            <button
              type="button"
              onClick={handleDownloadJson}
              className={actionBtn}
            >
              Unduh JSON
            </button>
          )}
          <button
            type="button"
            onClick={handleCopyShare}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#0a84ff] px-4 py-1.5 text-xs font-medium text-white transition hover:opacity-90"
          >
            {copiedShare ? (
              <>
                <Check className="h-3.5 w-3.5" />
                Tautan Disalin
              </>
            ) : (
              <>
                <Share2 className="h-3.5 w-3.5" />
                Bagikan Hasil
              </>
            )}
          </button>
        </div>

        {/* 1-Click Copy Setup Drawer */}
        {showSetupDrawer && setupInfo && (
          <div
            className={`mt-5 space-y-3 rounded-xl p-4 text-xs ${
              isDark ? 'bg-black/45' : 'bg-white'
            }`}
          >
            <div className="font-semibold">
              Alamat Siap Salin untuk {setupInfo.title}
            </div>

            <div className={`divide-y ${divider}`}>
              {setupInfo.androidDot && (
                <div className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div>
                    <div className={muted}>Android (DNS Pribadi / Private DNS)</div>
                    <div className="mt-0.5 font-mono text-[13px] font-medium">
                      {setupInfo.androidDot}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopyText('android', setupInfo.androidDot!)}
                    className={actionBtn}
                  >
                    {copiedKey === 'android' ? 'Tersalin' : 'Salin'}
                  </button>
                </div>
              )}

              {setupInfo.ipv4 && (
                <div className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div>
                    <div className={muted}>Router / Mac / IPv4</div>
                    <div className="mt-0.5 font-mono text-[13px] font-medium">
                      {setupInfo.ipv4}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      handleCopyText('ipv4', setupInfo.ipv4!.split('/')[0].trim())
                    }
                    className={actionBtn}
                  >
                    {copiedKey === 'ipv4' ? 'Tersalin' : 'Salin IP Utama'}
                  </button>
                </div>
              )}

              {setupInfo.dohUrl && (
                <div className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className={muted}>Browser / Windows 11 (DoH)</div>
                    <div className="mt-0.5 truncate font-mono text-[13px] font-medium">
                      {setupInfo.dohUrl}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopyText('doh', setupInfo.dohUrl!)}
                    className={`inline-flex items-center gap-1 ${actionBtn}`}
                  >
                    <Copy className="h-3 w-3" />
                    {copiedKey === 'doh' ? 'Tersalin' : 'Salin'}
                  </button>
                </div>
              )}
            </div>

            <p className={`text-[11px] ${muted}`}>{setupInfo.note}</p>
          </div>
        )}

        {/* Quick network tag selector for History */}
        {!isSharedPreview && onUpdateNetworkLabel && run.id !== 'shared' && (
          <div className={`mt-4 flex flex-wrap items-center gap-2 border-t pt-4 text-xs ${borderHairline}`}>
            <span className={muted}>Tandai jaringan:</span>
            {NETWORK_PRESET_LABELS.map((lbl) => {
              const active = run.networkLabel === lbl;
              return (
                <button
                  key={lbl}
                  type="button"
                  onClick={() =>
                    onUpdateNetworkLabel(run.id, active ? undefined : lbl)
                  }
                  className={`rounded-full px-3 py-1 text-[11px] font-medium transition ${
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
        )}
      </section>

      {/* Single Clean Chart */}
      <LatencyCharts results={run.results} isDark={isDark} />

      {/* Simple Results Table */}
      <section className={`overflow-hidden rounded-2xl ${surface}`}>
        <div
          className={`flex flex-wrap items-center justify-between gap-2 border-b px-6 py-4 ${borderHairline}`}
        >
          <div>
            <h3 className="text-sm font-semibold tracking-tight">Urutan Kecepatan</h3>
            <p className={`mt-0.5 text-xs ${muted}`}>
              Angka lebih kecil berarti membuka alamat web lebih cepat.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowTechnical((v) => !v)}
            className="text-xs font-medium text-[#0a84ff] transition hover:opacity-75"
          >
            {showTechnical ? 'Sembunyikan angka teknis' : 'Lihat angka teknis'}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-[13px]">
            <thead className={`border-b text-[11px] font-medium ${borderHairline} ${muted}`}>
              <tr>
                <th className="py-3 pl-6 pr-3">#</th>
                <th className="px-3 py-3">Nama DNS</th>
                {showTechnical && <th className="px-3 py-3">Status</th>}
                <th className="px-3 py-3 text-right">
                  {showTechnical ? 'Median' : 'Kecepatan'}
                </th>
                {showTechnical && (
                  <>
                    <th className="px-3 py-3 text-right">Rata²</th>
                    <th className="px-3 py-3 text-right">Min</th>
                    <th className="px-3 py-3 text-right">Max</th>
                    <th className="px-3 py-3 text-right">P95</th>
                    <th className="px-3 py-3 text-right">Jitter</th>
                  </>
                )}
                <th className="px-3 py-3 text-right">Berhasil</th>
                <th className="py-3 pl-2 pr-6" />
              </tr>
            </thead>
            <tbody className={`divide-y ${divider}`}>
              {run.results.map((r, idx) => {
                const isWinner =
                  r.resolver.id === run.recommendation.fastestId &&
                  r.metrics.medianMs !== null;
                const isExpanded = expandedId === r.resolver.id;
                const isBroken = r.status === 'cors-blocked' || r.status === 'failed';
                const fmt = (v: number | null) => (v !== null ? `${v} ms` : '—');

                return (
                  <Fragment key={r.resolver.id}>
                    <tr
                      onClick={() =>
                        setExpandedId(isExpanded ? null : r.resolver.id)
                      }
                      className={`cursor-pointer transition-colors ${
                        isDark ? 'hover:bg-white/[0.03]' : 'hover:bg-black/[0.025]'
                      }`}
                    >
                      <td className={`whitespace-nowrap py-3.5 pl-6 pr-3 font-medium tabular-nums ${muted}`}>
                        {isBroken ? '—' : idx + 1}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3.5">
                        <div className="flex items-center gap-2 font-medium">
                          <span>{r.resolver.name}</span>
                          {isWinner && (
                            <span className="text-[11px] font-semibold text-[#30d158]">
                              Tercepat
                            </span>
                          )}
                          {isBroken && (
                            <span className="text-[11px] text-[#ff453a]">
                              Gagal
                            </span>
                          )}
                          {r.metrics.isUnreliable && !isBroken && (
                            <span className="text-[11px] text-[#ff9f0a]">
                              Kurang stabil
                            </span>
                          )}
                        </div>
                        <div className={`text-[11px] ${muted}`}>
                          {r.resolver.id === 'nextdns-unified'
                            ? r.resolver.variant
                            : r.resolver.description || r.resolver.provider}
                        </div>
                      </td>

                      {showTechnical && (
                        <td className="whitespace-nowrap px-3 py-3.5 text-xs font-medium">
                          <TechnicalStatusLabel status={r.status} isDark={isDark} />
                        </td>
                      )}

                      <td className="whitespace-nowrap px-3 py-3.5 text-right font-semibold tabular-nums">
                        {fmt(r.metrics.medianMs)}
                      </td>

                      {showTechnical && (
                        <>
                          <td className={`whitespace-nowrap px-3 py-3.5 text-right tabular-nums ${muted}`}>
                            {fmt(r.metrics.meanMs)}
                          </td>
                          <td className={`whitespace-nowrap px-3 py-3.5 text-right tabular-nums ${muted}`}>
                            {fmt(r.metrics.minMs)}
                          </td>
                          <td className={`whitespace-nowrap px-3 py-3.5 text-right tabular-nums ${muted}`}>
                            {fmt(r.metrics.maxMs)}
                          </td>
                          <td className={`whitespace-nowrap px-3 py-3.5 text-right tabular-nums ${muted}`}>
                            {fmt(r.metrics.p95Ms)}
                          </td>
                          <td className={`whitespace-nowrap px-3 py-3.5 text-right tabular-nums ${muted}`}>
                            {r.metrics.jitterMs !== null ? `±${r.metrics.jitterMs} ms` : '—'}
                          </td>
                        </>
                      )}

                      <td className="whitespace-nowrap px-3 py-3.5 text-right tabular-nums">
                        {r.metrics.successRate}%
                      </td>
                      <td className={`py-3.5 pl-2 pr-6 ${muted}`}>
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr className={isDark ? 'bg-black/25' : 'bg-black/[0.02]'}>
                        <td colSpan={showTechnical ? 11 : 5} className="px-6 py-4 text-xs">
                          <div className="space-y-2.5">
                            {r.resolver.id === 'nextdns-unified' && r.resolver.description && (
                              <p className={muted}>
                                Perbandingan jalur NextDNS: {r.resolver.description}
                              </p>
                            )}
                            {r.metrics.warmupFirstMs !== null && (
                              <p className={muted}>
                                Koneksi awal (warm-up): {r.metrics.warmupFirstMs} ms
                              </p>
                            )}
                            {r.samples.length > 0 ? (
                              <div className="flex flex-wrap gap-1.5">
                                {r.samples.map((s, sIdx) => (
                                  <span
                                    key={`${s.phase}-${sIdx}`}
                                    className={`rounded-lg px-2.5 py-1 font-mono text-[11px] tabular-nums ${
                                      s.ok
                                        ? isDark
                                          ? 'bg-white/6 text-[#f5f5f7]'
                                          : 'bg-black/5 text-[#1d1d1f]'
                                        : 'bg-[#ff453a]/15 text-[#ff453a]'
                                    }`}
                                  >
                                    #{sIdx + 1} {s.ok ? `${s.latencyMs} ms` : s.error ?? 'Gagal'}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <p className={muted}>
                                Rincian tiap tes tidak tersedia pada tautan yang dibagikan.
                              </p>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
