import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { validateCustomDohUrl, validateNextDnsId } from '../lib/validation';
import type {
  BenchmarkConfig,
  CustomResolver,
  DohFormat,
  PresetResolver,
} from '../types/dns';

const PRIMARY_IDS = new Set([
  'cloudflare-1111',
  'google-public',
  'adguard-default',
  'quad9-default',
]);

interface ResolverConfiguratorProps {
  presets: PresetResolver[];
  enabledPresetIds: Set<string>;
  onTogglePreset: (id: string) => void;
  nextDnsEnabled: boolean;
  onToggleNextDns: () => void;
  separateNextDnsVariants: boolean;
  onToggleSeparateNextDnsVariants: () => void;
  customResolvers: CustomResolver[];
  onAddCustomResolver: (item: CustomResolver) => void;
  onToggleCustomResolver: (id: string) => void;
  onRemoveCustomResolver: (id: string) => void;
  config: BenchmarkConfig;
  onConfigChange: (next: BenchmarkConfig) => void;
  persistNextDnsId: boolean;
  onTogglePersistNextDnsId: (persist: boolean) => void;
  disabled: boolean;
  isDark: boolean;
}

function AppleToggle({
  checked,
  disabled,
  onChange,
  label,
  isDark,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  label: string;
  isDark: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={`relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors duration-200 ${
        disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'
      } ${
        checked
          ? 'bg-[#30d158]'
          : isDark
            ? 'bg-white/15'
            : 'bg-black/15'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
          checked ? 'translate-x-[18px]' : 'translate-x-[2px]'
        }`}
      />
    </button>
  );
}

export function ResolverConfigurator({
  presets,
  enabledPresetIds,
  onTogglePreset,
  nextDnsEnabled,
  onToggleNextDns,
  separateNextDnsVariants,
  onToggleSeparateNextDnsVariants,
  customResolvers,
  onAddCustomResolver,
  onToggleCustomResolver,
  onRemoveCustomResolver,
  config,
  onConfigChange,
  persistNextDnsId,
  onTogglePersistNextDnsId,
  disabled,
  isDark,
}: ResolverConfiguratorProps) {
  const [showMore, setShowMore] = useState(false);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const [customFormat, setCustomFormat] = useState<DohFormat>('wire');
  const [customError, setCustomError] = useState<string | null>(null);

  const nextDnsValidation = validateNextDnsId(config.nextDnsConfigId);
  const primaryPresets = presets.filter((p) => PRIMARY_IDS.has(p.id));
  const extraPresets = presets.filter(
    (p) => !PRIMARY_IDS.has(p.id) && p.category !== 'nextdns',
  );

  const handleAddCustom = (e: React.FormEvent) => {
    e.preventDefault();
    const urlCheck = validateCustomDohUrl(customUrl);
    if (!urlCheck.valid || !urlCheck.normalized) {
      setCustomError(urlCheck.error ?? 'Alamat URL tidak valid.');
      return;
    }
    const cleanName = customName.trim() || new URL(urlCheck.normalized).hostname;
    onAddCustomResolver({
      id: `custom-${Date.now()}`,
      name: cleanName,
      url: urlCheck.normalized,
      format: customFormat,
      enabled: true,
    });
    setCustomName('');
    setCustomUrl('');
    setCustomError(null);
    setShowCustomForm(false);
  };

  const surface = isDark ? 'bg-[#1c1c1e]' : 'bg-[#f5f5f7]';
  const divider = isDark ? 'divide-white/8' : 'divide-black/8';
  const borderHairline = isDark ? 'border-white/8' : 'border-black/8';
  const muted = isDark ? 'text-[#86868b]' : 'text-[#6e6e73]';
  const inputCls = isDark
    ? 'bg-black/50 text-white placeholder:text-[#636366] border-white/10'
    : 'bg-white text-[#1d1d1f] placeholder:text-[#86868b] border-black/10';

  return (
    <div className="space-y-6">
      {/* Main Clean DNS List — 5 familiar choices */}
      <section>
        <div className="mb-2 flex items-baseline justify-between px-1">
          <h2 className={`text-xs font-medium uppercase tracking-wider ${muted}`}>
            Pilihan DNS
          </h2>
          <span className={`text-[11px] ${muted}`}>
            Pilih yang ingin dibandingkan
          </span>
        </div>

        <div className={`divide-y overflow-hidden rounded-2xl ${surface} ${divider}`}>
          {primaryPresets.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between gap-4 px-4 py-3.5"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{p.name}</div>
                <p className={`truncate text-xs ${muted}`}>{p.description}</p>
              </div>
              <AppleToggle
                checked={enabledPresetIds.has(p.id)}
                disabled={disabled}
                onChange={() => onTogglePreset(p.id)}
                label={`Aktifkan ${p.name}`}
                isDark={isDark}
              />
            </div>
          ))}

          {/* Single unified NextDNS row */}
          <div className="px-4 py-3.5">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">NextDNS</div>
                <p className={`truncate text-xs ${muted}`}>
                  DNS pribadi dengan blokir iklan (butuh ID NextDNS Anda).
                </p>
              </div>
              <AppleToggle
                checked={nextDnsEnabled}
                disabled={disabled}
                onChange={onToggleNextDns}
                label="Aktifkan NextDNS"
                isDark={isDark}
              />
            </div>

            {nextDnsEnabled && (
              <div className="mt-3 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-1 flex-col gap-1">
                  <input
                    type="text"
                    value={config.nextDnsConfigId}
                    disabled={disabled}
                    maxLength={16}
                    onChange={(e) =>
                      onConfigChange({ ...config, nextDnsConfigId: e.target.value })
                    }
                    placeholder="Masukkan ID NextDNS (contoh: a1b2c3)"
                    aria-label="NextDNS Config ID"
                    className={`w-full rounded-xl border px-3.5 py-2 font-mono text-sm outline-none transition focus:border-[#0a84ff] sm:max-w-xs ${inputCls}`}
                  />
                  {!nextDnsValidation.valid && (
                    <span className="text-xs text-[#ff453a]">
                      {nextDnsValidation.error}
                    </span>
                  )}
                </div>

                <label className="flex cursor-pointer items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    className="accent-[#0a84ff]"
                    checked={persistNextDnsId}
                    disabled={disabled}
                    onChange={(e) => onTogglePersistNextDnsId(e.target.checked)}
                  />
                  <span className={muted}>Ingat ID di browser ini</span>
                </label>
              </div>
            )}
          </div>

          {/* Custom resolvers added by user */}
          {customResolvers.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between gap-4 px-4 py-3.5"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{c.name}</div>
                <p className={`truncate font-mono text-xs ${muted}`}>{c.url}</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onRemoveCustomResolver(c.id)}
                  aria-label={`Hapus ${c.name}`}
                  className={`rounded-full p-1.5 transition hover:text-[#ff453a] ${muted}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                <AppleToggle
                  checked={c.enabled}
                  disabled={disabled}
                  onChange={() => onToggleCustomResolver(c.id)}
                  label={`Aktifkan ${c.name}`}
                  isDark={isDark}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Collapsible Extra Options & Advanced Settings */}
      <section>
        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          className="inline-flex items-center gap-1.5 px-1 text-xs font-medium text-[#0a84ff] transition hover:opacity-75"
        >
          <span>Pilihan DNS Lainnya &amp; Pengaturan</span>
          {showMore ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </button>

        {showMore && (
          <div className="mt-3 space-y-5">
            {/* Extra DNS providers */}
            <div className={`divide-y overflow-hidden rounded-2xl ${surface} ${divider}`}>
              {extraPresets.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-4 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{p.name}</div>
                    <p className={`truncate text-xs ${muted}`}>{p.description}</p>
                  </div>
                  <AppleToggle
                    checked={enabledPresetIds.has(p.id)}
                    disabled={disabled}
                    onChange={() => onTogglePreset(p.id)}
                    label={`Aktifkan ${p.name}`}
                    isDark={isDark}
                  />
                </div>
              ))}
            </div>

            {/* Test parameters */}
            <div className={`space-y-4 rounded-2xl p-5 ${surface}`}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className={`block text-xs font-medium ${muted}`}>
                    Jenis Pengujian
                  </label>
                  <select
                    value={config.testMode}
                    disabled={disabled}
                    onChange={(e) =>
                      onConfigChange({
                        ...config,
                        testMode: e.target.value as BenchmarkConfig['testMode'],
                      })
                    }
                    className={`mt-1.5 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-[#0a84ff] ${inputCls}`}
                  >
                    <option value="cache-miss">Alamat Baru (Acak)</option>
                    <option value="cache-hit">Website Populer</option>
                    <option value="both">Keduanya</option>
                  </select>
                </div>

                <div>
                  <label className={`block text-xs font-medium ${muted}`}>
                    Jumlah Percobaan ({config.sampleCount}x)
                  </label>
                  <input
                    type="range"
                    min={5}
                    max={50}
                    step={5}
                    value={config.sampleCount}
                    disabled={disabled}
                    onChange={(e) =>
                      onConfigChange({
                        ...config,
                        sampleCount: Number(e.target.value),
                      })
                    }
                    className="mt-3 w-full accent-[#0a84ff]"
                  />
                </div>

                <div>
                  <label className={`block text-xs font-medium ${muted}`}>
                    Batas Waktu Tunggu
                  </label>
                  <select
                    aria-label="Batas waktu tunggu"
                    value={config.timeoutMs}
                    disabled={disabled}
                    onChange={(e) =>
                      onConfigChange({
                        ...config,
                        timeoutMs: Number(e.target.value),
                      })
                    }
                    className={`mt-1.5 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-[#0a84ff] ${inputCls}`}
                  >
                    <option value={3000}>3 detik</option>
                    <option value={4000}>4 detik</option>
                    <option value={5000}>5 detik</option>
                  </select>
                </div>
              </div>

              {nextDnsEnabled && (
                <div
                  className={`flex items-center justify-between gap-4 border-t pt-4 ${borderHairline}`}
                >
                  <div>
                    <div className="text-sm font-medium">
                      Tampilkan Varian NextDNS Secara Terpisah
                    </div>
                    <p className={`text-xs ${muted}`}>
                      Secara bawaan hasil NextDNS digabung menjadi satu dengan jalur tercepat otomatis.
                    </p>
                  </div>
                  <AppleToggle
                    checked={separateNextDnsVariants}
                    disabled={disabled}
                    onChange={onToggleSeparateNextDnsVariants}
                    label="Pisahkan varian NextDNS"
                    isDark={isDark}
                  />
                </div>
              )}

              <div
                className={`flex items-center justify-between gap-4 border-t pt-4 ${borderHairline}`}
              >
                <div>
                  <div className="text-sm font-medium">
                    Mode Kompatibel Browser (No-CORS)
                  </div>
                  <p className={`text-xs ${muted}`}>
                    Memungkinkan pengujian AdGuard &amp; NextDNS langsung dari browser.
                  </p>
                </div>
                <AppleToggle
                  checked={config.allowNoCorsFallback}
                  disabled={disabled}
                  onChange={() =>
                    onConfigChange({
                      ...config,
                      allowNoCorsFallback: !config.allowNoCorsFallback,
                    })
                  }
                  label="Mode Kompatibel Browser"
                  isDark={isDark}
                />
              </div>

              <div className={`border-t pt-4 ${borderHairline}`}>
                {!showCustomForm ? (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => setShowCustomForm(true)}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-[#0a84ff] hover:opacity-75"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Tambah Alamat DNS Sendiri (DoH)
                  </button>
                ) : (
                  <form onSubmit={handleAddCustom} className="space-y-2.5">
                    <div className="text-xs font-medium">Tambah Alamat DNS Sendiri</div>
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-12">
                      <input
                        type="text"
                        placeholder="Nama DNS"
                        value={customName}
                        onChange={(e) => setCustomName(e.target.value)}
                        className={`rounded-xl border px-3 py-2 text-xs outline-none focus:border-[#0a84ff] sm:col-span-4 ${inputCls}`}
                      />
                      <input
                        type="url"
                        required
                        placeholder="https://dns.example.com/dns-query"
                        value={customUrl}
                        onChange={(e) => {
                          setCustomUrl(e.target.value);
                          setCustomError(null);
                        }}
                        className={`rounded-xl border px-3 py-2 font-mono text-xs outline-none focus:border-[#0a84ff] sm:col-span-5 ${inputCls}`}
                      />
                      <select
                        value={customFormat}
                        onChange={(e) => setCustomFormat(e.target.value as DohFormat)}
                        aria-label="Format DoH"
                        className={`rounded-xl border px-2.5 py-2 text-xs outline-none focus:border-[#0a84ff] sm:col-span-2 ${inputCls}`}
                      >
                        <option value="wire">Standar</option>
                        <option value="json">JSON</option>
                      </select>
                      <button
                        type="submit"
                        className="rounded-xl bg-[#0a84ff] px-3 py-2 text-xs font-medium text-white transition hover:opacity-90 sm:col-span-1"
                      >
                        Simpan
                      </button>
                    </div>
                    {customError && (
                      <p className="text-xs text-[#ff453a]">{customError}</p>
                    )}
                  </form>
                )}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
