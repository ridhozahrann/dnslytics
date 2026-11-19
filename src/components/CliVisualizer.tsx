import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  LinearScale,
  Tooltip,
  type ChartOptions,
} from 'chart.js';
import { Check, Copy, FileJson, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import {
  exportCliReportToCsv,
  exportCliReportToPng,
  parseCliReportJson,
  SAMPLE_CLI_REPORT,
} from '../lib/cliImport';
import { downloadTextFile } from '../lib/exportShare';
import type { CliProtocol, CliReport } from '../types/cli';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

interface CliVisualizerProps {
  defaultNextDnsId?: string;
  isDark: boolean;
}

type ProtocolFilter = 'all' | CliProtocol;

export function CliVisualizer({
  defaultNextDnsId = '',
  isDark,
}: CliVisualizerProps) {
  const [cliNextDnsId, setCliNextDnsId] = useState(defaultNextDnsId);
  const [report, setReport] = useState<CliReport | null>(null);
  const [isSample, setIsSample] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [showPasteBox, setShowPasteBox] = useState(false);
  const [pastedJson, setPastedJson] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [protocolFilter, setProtocolFilter] = useState<ProtocolFilter>('all');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const surface = isDark ? 'bg-[#1c1c1e]' : 'bg-[#f5f5f7]';
  const muted = isDark ? 'text-[#86868b]' : 'text-[#6e6e73]';
  const divider = isDark ? 'divide-white/8' : 'divide-black/8';
  const borderHairline = isDark ? 'border-white/8' : 'border-black/8';
  const inputCls = isDark
    ? 'bg-black/50 text-white placeholder:text-[#636366] border-white/10'
    : 'bg-white text-[#1d1d1f] placeholder:text-[#86868b] border-black/10';
  const actionBtn = `rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
    isDark
      ? 'bg-white/8 text-white hover:bg-white/14'
      : 'bg-black/6 text-[#1d1d1f] hover:bg-black/10'
  }`;

  const cleanId = cliNextDnsId.trim();
  const generatedCmd = cleanId
    ? `node cli/dnslytics.mjs --nextdns ${cleanId} --out hasil-cli.json`
    : 'node cli/dnslytics.mjs --out hasil-cli.json';

  const handleCopyCmd = async () => {
    try {
      await navigator.clipboard.writeText(generatedCmd);
      setCopiedCmd(true);
      setTimeout(() => setCopiedCmd(false), 2000);
    } catch {
      // ignore
    }
  };

  const loadFromText = (text: string) => {
    setParseError(null);
    const parsed = parseCliReportJson(text);
    if (!parsed.ok) {
      setParseError(parsed.error);
      return;
    }
    setReport(parsed.report);
    setIsSample(false);
    setProtocolFilter('all');
    setShowPasteBox(false);
    setPastedJson('');
  };

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        loadFromText(reader.result);
      } else {
        setParseError('File tidak dapat dibaca sebagai teks JSON.');
      }
    };
    reader.onerror = () => setParseError('Gagal membaca file yang dipilih.');
    reader.readAsText(file);
  };

  const filteredResults = report
    ? protocolFilter === 'all'
      ? report.results
      : report.results.filter((r) => r.protocol === protocolFilter)
    : [];

  const validFiltered = filteredResults.filter((r) => r.medianMs !== null);
  const winner = report?.results.find((r) => r.medianMs !== null) ?? null;

  const textColor = isDark ? '#d1d1d6' : '#3a3a3c';
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)';

  const barData = {
    labels: validFiltered.map((r) => `${r.name} (${r.protocol})`),
    datasets: [
      {
        label: 'Kecepatan (ms)',
        data: validFiltered.map((r) => r.medianMs ?? 0),
        backgroundColor: validFiltered.map((_, idx) =>
          idx === 0
            ? isDark
              ? '#0a84ff'
              : '#0071e3'
            : isDark
              ? 'rgba(255, 255, 255, 0.22)'
              : 'rgba(0, 0, 0, 0.16)',
        ),
        borderRadius: 6,
        barThickness: 18,
      },
    ],
  };

  const barOptions: ChartOptions<'bar'> = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => `${ctx.parsed.x} ms`,
        },
      },
    },
    scales: {
      x: {
        beginAtZero: true,
        border: { display: false },
        grid: { color: gridColor },
        ticks: { color: textColor, callback: (v) => `${v} ms` },
      },
      y: {
        border: { display: false },
        grid: { display: false },
        ticks: { color: textColor, font: { weight: 500, size: 11 } },
      },
    },
  };

  const handleDownloadCsv = () => {
    if (!report) return;
    downloadTextFile(
      exportCliReportToCsv(report),
      `dnslytics-cli-${report.createdAt.slice(0, 10)}.csv`,
      'text/csv;charset=utf-8',
    );
  };

  const dateFormatted = report
    ? new Date(report.createdAt).toLocaleString('id-ID', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : '';

  return (
    <div className="space-y-8">
      {/* Intro */}
      <section className="mx-auto max-w-2xl text-center">
        <h1 className="text-3xl font-semibold tracking-[-0.025em] sm:text-4xl">
          Visualisasi Hasil CLI.
        </h1>
        <p className={`mt-2.5 text-sm leading-relaxed sm:text-base ${muted}`}>
          Uji DNS lintas protokol (UDP/53, DoT/853, DoH), deteksi pembelokan ISP, dan cek blokir iklan di terminal—lalu unggah file JSON-nya di sini untuk melihat grafik &amp; menyimpan PNG.
        </p>
      </section>

      {/* Loaded Report Dashboard */}
      {report && (
        <div className="space-y-6">
          {isSample && (
            <div className={`rounded-2xl px-4 py-3 text-xs ${surface} ${muted}`}>
              Menampilkan <strong>contoh data CLI</strong>. Jalankan perintah di bawah pada terminal Anda lalu unggah file <code className="font-mono">hasil-cli.json</code> untuk melihat data jaringan Anda sendiri.
            </div>
          )}

          {/* Hero Summary */}
          <section className={`rounded-2xl p-6 sm:p-8 ${surface}`}>
            <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
              <div className="max-w-2xl space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {winner && (
                    <span className="font-semibold uppercase tracking-wider text-[#30d158]">
                      Paling Cepat
                    </span>
                  )}
                  <span className={muted}>
                    {dateFormatted}
                    {report.samples ? ` • ${report.samples} sampel/resolver` : ''}
                  </span>
                </div>

                <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                  {winner ? `${winner.name} (${winner.protocol})` : 'Tidak ada hasil valid'}
                </h2>

                <p className={`text-sm leading-relaxed ${muted}`}>
                  {winner && report.systemDns.medianMs !== null
                    ? winner.medianMs! < report.systemDns.medianMs
                      ? `Lebih cepat ${Math.round((report.systemDns.medianMs - winner.medianMs!) * 10) / 10} ms dibanding DNS bawaan sistem Anda (${report.systemDns.medianMs} ms).`
                      : `DNS bawaan sistem Anda tercatat ${report.systemDns.medianMs} ms (${report.systemDns.successPct}% sukses).`
                    : 'Hasil pengukuran multi-protokol dari Companion CLI.'}
                </p>
              </div>

              {winner && (
                <div className="shrink-0 sm:text-right">
                  <div className={`text-xs ${muted}`}>Waktu Respons</div>
                  <div className="text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">
                    {winner.medianMs}
                    <span className={`ml-1 text-lg font-normal ${muted}`}>ms</span>
                  </div>
                </div>
              )}
            </div>

            {/* System DNS & Port 53 Hijacking Strip */}
            <div
              className={`mt-6 grid grid-cols-1 gap-4 border-t pt-5 sm:grid-cols-2 ${borderHairline}`}
            >
              <div>
                <div className={`text-xs ${muted}`}>DNS Bawaan Sistem</div>
                <div className="mt-1 text-sm font-semibold tabular-nums">
                  {report.systemDns.medianMs !== null
                    ? `${report.systemDns.medianMs} ms (${report.systemDns.successPct}% sukses)`
                    : 'Tidak terukur'}
                </div>
              </div>
              <div>
                <div className={`text-xs ${muted}`}>Cek Pembelokan Port 53 (ISP)</div>
                {report.port53Check.hijacked ? (
                  <div className="mt-1 text-sm font-semibold text-[#ff9f0a]">
                    Terdeteksi Dibelokkan{' '}
                    <span className={`font-normal text-xs ${muted}`}>
                      (UDP: {report.port53Check.udpIdServer ?? '-'} vs DoT asli:{' '}
                      {report.port53Check.dotIdServer ?? '-'})
                    </span>
                  </div>
                ) : (
                  <div className="mt-1 text-sm font-semibold text-[#30d158]">
                    Aman (Tidak Dibelokkan)
                    {report.port53Check.dotIdServer && (
                      <span className={`ml-1.5 font-normal text-xs ${muted}`}>
                        PoP: {report.port53Check.dotIdServer}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Export & Reset Actions */}
            <div className={`mt-6 flex flex-wrap items-center gap-2 border-t pt-5 ${borderHairline}`}>
              <button
                type="button"
                onClick={() => exportCliReportToPng(report, isDark ? 'dark' : 'light')}
                className="rounded-full bg-[#0a84ff] px-4 py-1.5 text-xs font-medium text-white transition hover:opacity-90"
              >
                Simpan Gambar (PNG)
              </button>
              <button
                type="button"
                onClick={handleDownloadCsv}
                className={actionBtn}
              >
                Unduh CSV
              </button>
              <button
                type="button"
                onClick={() => {
                  setReport(null);
                  setIsSample(false);
                }}
                className={actionBtn}
              >
                Muat File Lain
              </button>
            </div>
          </section>

          {/* Multi-Protocol Chart */}
          {validFiltered.length > 0 && (
            <section className={`rounded-2xl p-6 ${surface}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold tracking-tight">
                    Perbandingan Kecepatan Lintas Protokol
                  </h3>
                  <p className={`mt-0.5 text-xs ${muted}`}>
                    Filter berdasarkan protokol untuk membandingkan DoT, DoH, dan UDP/53.
                  </p>
                </div>

                <div
                  className={`inline-flex rounded-full p-0.5 text-[11px] ${
                    isDark ? 'bg-black/40' : 'bg-black/6'
                  }`}
                >
                  {(
                    [
                      { id: 'all', label: 'Semua' },
                      { id: 'DoT/853', label: 'DoT/853' },
                      { id: 'DoH', label: 'DoH' },
                      { id: 'UDP/53', label: 'UDP/53' },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setProtocolFilter(tab.id)}
                      className={`rounded-full px-3 py-1 font-medium transition ${
                        protocolFilter === tab.id
                          ? isDark
                            ? 'bg-[#2c2c2e] text-white'
                            : 'bg-white text-[#1d1d1f] shadow-xs'
                          : muted
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              <div
                className="mt-4 w-full"
                style={{ height: `${Math.max(220, validFiltered.length * 34)}px` }}
                role="img"
                aria-label="Grafik kecepatan DNS hasil CLI"
              >
                <Bar data={barData} options={barOptions} />
              </div>
            </section>
          )}

          {/* Adblock Verification */}
          {report.adblockCheck.length > 0 && (
            <section className={`overflow-hidden rounded-2xl ${surface}`}>
              <div className={`border-b px-6 py-4 ${borderHairline}`}>
                <h3 className="text-sm font-semibold tracking-tight">
                  Verifikasi Blokir Iklan
                </h3>
                <p className={`mt-0.5 text-xs ${muted}`}>
                  Domain uji: <code className="font-mono">{report.adblockCheck[0]?.domain}</code>
                </p>
              </div>
              <div className={`divide-y ${divider}`}>
                {report.adblockCheck.map((ad, i) => (
                  <div
                    key={`${ad.name}-${i}`}
                    className="flex items-center justify-between px-6 py-3.5 text-xs sm:text-[13px]"
                  >
                    <span className="font-medium">{ad.name}</span>
                    <span
                      className={`font-medium ${
                        ad.blocked ? 'text-[#30d158]' : muted
                      }`}
                    >
                      {ad.blocked ? 'Terblokir (Aktif)' : 'Tidak diblokir'}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Ranked Table */}
          <section className={`overflow-hidden rounded-2xl ${surface}`}>
            <div className={`border-b px-6 py-4 ${borderHairline}`}>
              <h3 className="text-sm font-semibold tracking-tight">
                Rincian Semua Protokol ({filteredResults.length})
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-[13px]">
                <thead className={`border-b text-[11px] font-medium ${borderHairline} ${muted}`}>
                  <tr>
                    <th className="py-3 pl-6 pr-3">#</th>
                    <th className="px-3 py-3">Nama DNS</th>
                    <th className="px-3 py-3">Protokol</th>
                    <th className="px-3 py-3 text-right">Kecepatan</th>
                    <th className="py-3 pl-3 pr-6 text-right">Berhasil</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${divider}`}>
                  {filteredResults.map((row, idx) => (
                    <tr key={`${row.name}-${row.protocol}-${idx}`}>
                      <td className={`whitespace-nowrap py-3 pl-6 pr-3 tabular-nums ${muted}`}>
                        {row.medianMs === null ? '—' : idx + 1}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 font-medium">
                        {row.name}
                      </td>
                      <td className={`whitespace-nowrap px-3 py-3 font-mono text-xs ${muted}`}>
                        {row.protocol}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums">
                        {row.medianMs !== null ? `${row.medianMs} ms` : 'Gagal'}
                      </td>
                      <td className="whitespace-nowrap py-3 pl-3 pr-6 text-right tabular-nums">
                        {row.successPct}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* Importer + Step-by-Step Instructions */}
      <section className={`rounded-2xl p-6 sm:p-8 ${surface}`}>
        <h2 className="text-lg font-semibold tracking-tight">
          Cara Pakai (3 Langkah)
        </h2>

        <div className={`mt-5 divide-y ${divider}`}>
          {/* Step 1 */}
          <div className="pb-6">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#0a84ff] text-xs font-semibold text-white">
                1
              </span>
              <h3 className="text-sm font-semibold">
                Jalankan Companion CLI di Terminal (Node.js 20+)
              </h3>
            </div>
            <p className={`mt-2 pl-8 text-xs leading-relaxed ${muted}`}>
              Buka terminal di folder proyek <code className="font-mono">dnslytics</code>, lalu jalankan perintah berikut untuk menyimpan hasil ke file <code className="font-mono">hasil-cli.json</code>:
            </p>

            <div className="mt-3 space-y-2.5 pl-8">
              <div className="flex flex-wrap items-center gap-2">
                <label className={`text-xs ${muted}`} htmlFor="cli-nextdns-id">
                  ID NextDNS (opsional):
                </label>
                <input
                  id="cli-nextdns-id"
                  type="text"
                  maxLength={16}
                  value={cliNextDnsId}
                  onChange={(e) => setCliNextDnsId(e.target.value)}
                  placeholder="Kosongkan jika tidak pakai"
                  className={`rounded-lg border px-2.5 py-1 font-mono text-xs outline-none focus:border-[#0a84ff] ${inputCls}`}
                />
              </div>

              <div
                className={`flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3 font-mono text-xs ${
                  isDark ? 'bg-black/50 text-[#f5f5f7]' : 'bg-white text-[#1d1d1f]'
                }`}
              >
                <span className="break-all">{generatedCmd}</span>
                <button
                  type="button"
                  onClick={handleCopyCmd}
                  className={`inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1 font-sans text-xs font-medium transition ${
                    isDark
                      ? 'bg-white/10 text-white hover:bg-white/15'
                      : 'bg-black/6 text-[#1d1d1f] hover:bg-black/10'
                  }`}
                >
                  {copiedCmd ? (
                    <>
                      <Check className="h-3 w-3" />
                      Disalin
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      Salin
                    </>
                  )}
                </button>
              </div>

              <p className={`text-[11px] ${muted}`}>
                Belum punya foldernya? Jalankan dulu{' '}
                <code className="font-mono">git clone https://github.com/ridhozahrann/dnslytics.git &amp;&amp; cd dnslytics</code>.
              </p>
            </div>
          </div>

          {/* Step 2 */}
          <div className="py-6">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#0a84ff] text-xs font-semibold text-white">
                2
              </span>
              <h3 className="text-sm font-semibold">
                Unggah File <code className="font-mono">hasil-cli.json</code> ke Sini
              </h3>
            </div>

            <div className="mt-3 space-y-3 pl-8">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  handleFile(e.dataTransfer.files?.[0]);
                }}
                className={`flex flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-8 text-center transition ${
                  isDragging
                    ? 'border-[#0a84ff] bg-[#0a84ff]/10'
                    : isDark
                      ? 'border-white/15 bg-black/30'
                      : 'border-black/15 bg-white'
                }`}
              >
                <Upload className={`h-6 w-6 ${muted}`} />
                <p className="mt-2 text-sm font-medium">
                  Tarik file JSON ke sini atau pilih dari perangkat
                </p>
                <p className={`mt-1 text-xs ${muted}`}>
                  Diproses 100% lokal di browser Anda, tidak diunggah ke server mana pun.
                </p>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={(e) => {
                    handleFile(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />

                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#0a84ff] px-4 py-2 text-xs font-medium text-white transition hover:opacity-90"
                  >
                    <FileJson className="h-3.5 w-3.5" />
                    Impor Hasil CLI (.json)
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPasteBox((v) => !v)}
                    className={actionBtn}
                  >
                    {showPasteBox ? 'Tutup Tempel Teks' : 'Tempel Teks JSON'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setParseError(null);
                      setReport(SAMPLE_CLI_REPORT);
                      setIsSample(true);
                      setProtocolFilter('all');
                    }}
                    className={actionBtn}
                  >
                    Coba Contoh Data
                  </button>
                </div>
              </div>

              {showPasteBox && (
                <div className="space-y-2">
                  <textarea
                    rows={6}
                    value={pastedJson}
                    onChange={(e) => {
                      setPastedJson(e.target.value);
                      setParseError(null);
                    }}
                    placeholder='Tempel output dari "node cli/dnslytics.mjs --json" di sini...'
                    className={`w-full rounded-xl border p-3 font-mono text-xs outline-none focus:border-[#0a84ff] ${inputCls}`}
                  />
                  <button
                    type="button"
                    onClick={() => loadFromText(pastedJson)}
                    className="rounded-full bg-[#0a84ff] px-4 py-1.5 text-xs font-medium text-white transition hover:opacity-90"
                  >
                    Visualisasikan JSON
                  </button>
                </div>
              )}

              {parseError && (
                <p className="text-xs text-[#ff453a]">{parseError}</p>
              )}
            </div>
          </div>

          {/* Step 3 */}
          <div className="pt-6">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#0a84ff] text-xs font-semibold text-white">
                3
              </span>
              <h3 className="text-sm font-semibold">
                Analisis Grafik &amp; Simpan sebagai Gambar PNG
              </h3>
            </div>
            <p className={`mt-2 pl-8 text-xs leading-relaxed ${muted}`}>
              Setelah file termuat, Anda dapat memfilter hasil antara <strong>DoT/853</strong>, <strong>DoH</strong>, dan <strong>UDP/53</strong>, melihat apakah ISP membelokkan port 53, mengecek status blokir iklan, lalu klik <strong>Simpan Gambar (PNG)</strong> untuk membagikan hasilnya.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
