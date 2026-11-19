import { Check, Copy } from 'lucide-react';
import { useState } from 'react';

interface MethodologyGuideProps {
  isDark: boolean;
  onOpenCliTab?: () => void;
}

type OsTab = 'android' | 'ios' | 'windows' | 'macos' | 'router';

export function MethodologyGuide({ isDark, onOpenCliTab }: MethodologyGuideProps) {
  const [osTab, setOsTab] = useState<OsTab>('android');
  const [showTech, setShowTech] = useState(false);
  const [copiedCli, setCopiedCli] = useState(false);

  const surface = isDark ? 'bg-[#1c1c1e]' : 'bg-[#f5f5f7]';
  const muted = isDark ? 'text-[#86868b]' : 'text-[#6e6e73]';

  const cliCommand = 'node cli/dnslytics.mjs --out hasil-cli.json';

  const handleCopyCli = async () => {
    try {
      await navigator.clipboard.writeText(cliCommand);
      setCopiedCli(true);
      setTimeout(() => setCopiedCli(false), 2000);
    } catch {
      // ignore
    }
  };

  const setupGuides: Record<
    OsTab,
    { title: string; steps: string[]; note: string }
  > = {
    android: {
      title: 'Android (versi 9 ke atas)',
      steps: [
        'Buka Setelan → Jaringan & Internet → DNS Pribadi.',
        'Pilih "Nama host penyedia DNS pribadi".',
        'Isi sesuai DNS tercepat Anda: one.one.one.one (Cloudflare), dns.google (Google), dns.adguard-dns.com (AdGuard), dns.quad9.net (Quad9), atau <id-anda>.dns.nextdns.io (NextDNS).',
        'Tekan Simpan.',
      ],
      note: 'Untuk pengguna NextDNS, aplikasi resmi NextDNS juga bisa langsung digunakan tanpa perlu mengetik alamat manual.',
    },
    ios: {
      title: 'iPhone & iPad',
      steps: [
        'Cara termudah: pasang aplikasi resmi dari DNS pilihan Anda (misalnya aplikasi 1.1.1.1, AdGuard, atau NextDNS) di App Store.',
        'Atau untuk NextDNS, buka my.nextdns.io lalu ikuti panduan profil iOS agar berjalan otomatis tanpa aplikasi.',
      ],
      note: 'Setelah aktif, seluruh aplikasi dan Safari otomatis memakai DNS yang lebih cepat.',
    },
    windows: {
      title: 'Windows 11',
      steps: [
        'Buka Settings → Network & internet → pilih Wi-Fi atau kabel yang sedang dipakai.',
        'Pada bagian DNS server assignment, klik Edit lalu ubah ke Manual.',
        'Nyalakan IPv4, lalu isi Preferred DNS (Cloudflare: 1.1.1.1, Google: 8.8.8.8, Quad9: 9.9.9.9, AdGuard: 94.140.14.14).',
        'Pada opsi DNS over HTTPS, pilih "On (automatic template)" lalu Save.',
      ],
      note: 'Untuk NextDNS di Windows, Anda bisa langsung memasang aplikasi NextDNS resmi.',
    },
    macos: {
      title: 'Mac (macOS)',
      steps: [
        'Buka System Settings → Network → pilih Wi-Fi yang aktif → klik Details → buka tab DNS.',
        'Tekan tombol + dan masukkan alamat IP DNS tercepat pilihan Anda (misal 1.1.1.1 atau 8.8.8.8), lalu OK.',
        'Untuk NextDNS, Anda dapat menginstal profil dari apple.nextdns.io.',
      ],
      note: 'Pengaturan ini hanya perlu dilakukan sekali per jaringan Wi-Fi.',
    },
    router: {
      title: 'Router Wi-Fi Rumah',
      steps: [
        'Buka halaman pengaturan router Anda di browser (biasanya 192.168.1.1 atau 192.168.0.1).',
        'Cari menu Internet / WAN / DHCP Settings → bagian DNS.',
        'Isi Primary & Secondary DNS dengan alamat DNS tercepat, lalu simpan dan restart router jika diminta.',
      ],
      note: 'Mengubah DNS di router otomatis mempercepat semua HP, laptop, dan TV yang terhubung ke Wi-Fi.',
    },
  };

  return (
    <div className="space-y-8">
      {/* Plain language intro */}
      <section className={`rounded-2xl p-6 sm:p-8 ${surface}`}>
        <h2 className="text-xl font-semibold tracking-tight">Cara Membaca Hasil</h2>
        <p className={`mt-2 text-sm leading-relaxed ${muted}`}>
          DNS bekerja seperti buku telepon internet yang menerjemahkan nama situs (misalnya{' '}
          <em>google.com</em>) menjadi alamat server. Makin cepat DNS merespons, makin cepat pula halaman web mulai terbuka.
        </p>

        <div className={`mt-6 grid grid-cols-1 gap-6 border-t pt-6 sm:grid-cols-3 ${isDark ? 'border-white/8' : 'border-black/8'}`}>
          <div>
            <h3 className="text-sm font-semibold">Angka ms (milidetik)</h3>
            <p className={`mt-1 text-xs leading-relaxed ${muted}`}>
              Makin kecil angkanya, makin cepat respons DNS. Misalnya 15 ms jauh lebih responsif dibanding 90 ms.
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold">Tingkat Keberhasilan</h3>
            <p className={`mt-1 text-xs leading-relaxed ${muted}`}>
              Pastikan memilih DNS dengan keberhasilan 100% agar browsing tidak sering gagal atau loading lama.
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold">Hasil Lokal Anda</h3>
            <p className={`mt-1 text-xs leading-relaxed ${muted}`}>
              Kecepatan DNS bergantung pada provider internet dan lokasi Anda. Uji lagi jika Anda berganti Wi-Fi atau kartu seluler.
            </p>
          </div>
        </div>
      </section>

      {/* DNS Setup Guide */}
      <section className={`rounded-2xl p-6 sm:p-8 ${surface}`}>
        <h2 className="text-xl font-semibold tracking-tight">Cara Mengganti DNS</h2>
        <p className={`mt-1 text-sm ${muted}`}>
          Pilih perangkat Anda untuk melihat langkah singkat memasang DNS tercepat.
        </p>

        <div
          className={`mt-5 inline-flex flex-wrap rounded-xl p-1 ${
            isDark ? 'bg-black/45' : 'bg-black/6'
          }`}
        >
          {(
            [
              { id: 'android', label: 'Android' },
              { id: 'ios', label: 'iPhone / iPad' },
              { id: 'windows', label: 'Windows 11' },
              { id: 'macos', label: 'Mac' },
              { id: 'router', label: 'Router Wi-Fi' },
            ] as const
          ).map((t) => {
            const active = osTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setOsTab(t.id)}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition ${
                  active
                    ? isDark
                      ? 'bg-[#2c2c2e] text-white'
                      : 'bg-white text-[#1d1d1f] shadow-xs'
                    : muted
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="mt-5">
          <h3 className="text-sm font-semibold">{setupGuides[osTab].title}</h3>
          <ol className={`mt-3 list-decimal space-y-2 pl-5 text-sm ${muted}`}>
            {setupGuides[osTab].steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
          <p className={`mt-4 text-xs ${muted}`}>
            Tips: {setupGuides[osTab].note}
          </p>
        </div>
      </section>

      {/* Companion CLI Section */}
      <section className={`rounded-2xl p-6 sm:p-8 ${surface}`}>
        <h2 className="text-xl font-semibold tracking-tight">
          Uji Lebih Lengkap lewat Terminal (CLI)
        </h2>
        <p className={`mt-2 text-sm leading-relaxed ${muted}`}>
          Ingin membandingkan DNS tradisional (UDP/53), DoT (port 853), membandingkan dengan DNS bawaan router Anda, mengecek apakah ISP membelokkan DNS, dan memverifikasi blokir iklan? Jalankan CLI pendamping langsung dari terminal:
        </p>

        <div
          className={`mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3 font-mono text-xs ${
            isDark ? 'bg-black/50 text-[#f5f5f7]' : 'bg-white text-[#1d1d1f]'
          }`}
        >
          <span>{cliCommand}</span>
          <button
            type="button"
            onClick={handleCopyCli}
            className={`inline-flex items-center gap-1 rounded-full px-3 py-1 font-sans text-xs font-medium transition ${
              isDark
                ? 'bg-white/10 text-white hover:bg-white/15'
                : 'bg-black/6 text-[#1d1d1f] hover:bg-black/10'
            }`}
          >
            {copiedCli ? (
              <>
                <Check className="h-3 w-3" />
                Disalin
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                Salin Perintah
              </>
            )}
          </button>
        </div>

        {onOpenCliTab && (
          <div className="mt-4">
            <button
              type="button"
              onClick={onOpenCliTab}
              className="rounded-full bg-[#0a84ff] px-4 py-1.5 text-xs font-medium text-white transition hover:opacity-90"
            >
              Buka Panduan &amp; Impor Hasil CLI (.json)
            </button>
          </div>
        )}
      </section>

      {/* Optional technical details collapsed */}
      <section className={`rounded-2xl p-6 ${surface}`}>
        <button
          type="button"
          onClick={() => setShowTech((v) => !v)}
          className="text-xs font-medium text-[#0a84ff] hover:opacity-75"
        >
          {showTech
            ? 'Sembunyikan catatan teknis'
            : 'Ingin tahu cara kerja pengukuran? (Catatan Teknis)'}
        </button>

        {showTech && (
          <div className={`mt-4 space-y-2.5 text-xs leading-relaxed ${muted}`}>
            <p>
              • Pengujian browser memakai DNS-over-HTTPS (DoH) RFC 8484 dan <code className="font-mono">performance.now()</code> tanpa server perantara.
            </p>
            <p>
              • 1–2 percobaan awal (warm-up) dipisahkan agar proses koneksi HTTPS awal tidak memengaruhi angka kecepatan utama.
            </p>
            <p>
              • Penyedia yang belum mengirim header CORS (seperti NextDNS &amp; AdGuard) diukur waktu respons HTTPS-nya melalui mode kompatibel browser (<code className="font-mono">no-cors</code>).
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
