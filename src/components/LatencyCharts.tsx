import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  type ChartOptions,
} from 'chart.js';
import { useState } from 'react';
import { Bar, Line } from 'react-chartjs-2';
import type { ResolverResult } from '../types/dns';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
);

interface LatencyChartsProps {
  results: ResolverResult[];
  isDark: boolean;
}

const LINE_PALETTE = ['#0a84ff', '#30d158', '#ff9f0a', '#bf5af2', '#ff375f'];

export function LatencyCharts({ results, isDark }: LatencyChartsProps) {
  const [view, setView] = useState<'speed' | 'stability'>('speed');

  const validResults = results.filter(
    (r) =>
      r.status !== 'cors-blocked' &&
      r.status !== 'failed' &&
      r.metrics.medianMs !== null,
  );

  if (validResults.length === 0) {
    return null;
  }

  const surface = isDark ? 'bg-[#1c1c1e]' : 'bg-[#f5f5f7]';
  const muted = isDark ? 'text-[#86868b]' : 'text-[#6e6e73]';
  const textColor = isDark ? '#d1d1d6' : '#3a3a3c';
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)';

  const barColors = validResults.map((_, idx) =>
    idx === 0
      ? isDark
        ? '#0a84ff'
        : '#0071e3'
      : isDark
        ? 'rgba(255, 255, 255, 0.22)'
        : 'rgba(0, 0, 0, 0.16)',
  );

  const barData = {
    labels: validResults.map((r) => r.resolver.name),
    datasets: [
      {
        label: 'Kecepatan (ms)',
        data: validResults.map((r) => r.metrics.medianMs ?? 0),
        backgroundColor: barColors,
        borderRadius: 6,
        barThickness: 20,
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
        ticks: {
          color: textColor,
          callback: (v) => `${v} ms`,
        },
      },
      y: {
        border: { display: false },
        grid: { display: false },
        ticks: { color: textColor, font: { weight: 500 } },
      },
    },
  };

  const hasRawSamples = validResults.some((r) => r.samples.length > 0);
  const topForLine = validResults.slice(0, 5);
  const maxSamples = Math.max(0, ...topForLine.map((r) => r.samples.length));
  const sampleLabels = Array.from({ length: maxSamples }, (_, i) => `Tes ${i + 1}`);

  const lineData = {
    labels: sampleLabels,
    datasets: topForLine.map((r, idx) => ({
      label: r.resolver.name,
      data: r.samples.map((s) => (s.ok ? s.latencyMs : null)),
      borderColor: LINE_PALETTE[idx % LINE_PALETTE.length],
      backgroundColor: LINE_PALETTE[idx % LINE_PALETTE.length],
      tension: 0.3,
      pointRadius: 2.5,
      borderWidth: 2,
      spanGaps: true,
    })),
  };

  const lineOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: { color: textColor, boxWidth: 10, usePointStyle: true, font: { size: 11 } },
      },
    },
    scales: {
      x: {
        border: { display: false },
        grid: { display: false },
        ticks: { color: textColor },
      },
      y: {
        beginAtZero: true,
        border: { display: false },
        grid: { color: gridColor },
        ticks: {
          color: textColor,
          callback: (v) => `${v} ms`,
        },
      },
    },
  };

  const activeView = hasRawSamples ? view : 'speed';

  return (
    <section className={`rounded-2xl p-6 ${surface}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold tracking-tight">
            {activeView === 'speed' ? 'Perbandingan Kecepatan' : 'Kestabilan Tiap Percobaan'}
          </h3>
          <p className={`mt-0.5 text-xs ${muted}`}>
            {activeView === 'speed'
              ? 'Makin pendek batangnya, makin cepat DNS merespons.'
              : 'Garis yang datar menandakan koneksi lebih stabil.'}
          </p>
        </div>

        {hasRawSamples && (
          <div
            className={`inline-flex rounded-full p-0.5 text-[11px] ${
              isDark ? 'bg-black/40' : 'bg-black/6'
            }`}
          >
            <button
              type="button"
              onClick={() => setView('speed')}
              className={`rounded-full px-3 py-1 font-medium transition ${
                activeView === 'speed'
                  ? isDark
                    ? 'bg-[#2c2c2e] text-white'
                    : 'bg-white text-[#1d1d1f] shadow-xs'
                  : muted
              }`}
            >
              Kecepatan
            </button>
            <button
              type="button"
              onClick={() => setView('stability')}
              className={`rounded-full px-3 py-1 font-medium transition ${
                activeView === 'stability'
                  ? isDark
                    ? 'bg-[#2c2c2e] text-white'
                    : 'bg-white text-[#1d1d1f] shadow-xs'
                  : muted
              }`}
            >
              Kestabilan
            </button>
          </div>
        )}
      </div>

      <div
        className="mt-4 w-full"
        style={{ height: `${Math.max(220, validResults.length * 40)}px` }}
        role="img"
        aria-label="Grafik perbandingan kecepatan DNS"
      >
        {activeView === 'speed' ? (
          <Bar data={barData} options={barOptions} />
        ) : (
          <Line data={lineData} options={lineOptions} />
        )}
      </div>
    </section>
  );
}
