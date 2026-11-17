# DNSlytics

Aplikasi web statis untuk menguji dan membandingkan kecepatan DNS (DNS-over-HTTPS) langsung dari browser dan jaringan Anda sendiri, tanpa instalasi dan tanpa pelacak pihak ketiga.

## Fitur Utama

- **Uji Cepat dari Browser:** Membandingkan **Cloudflare 1.1.1.1**, **Google DNS**, **AdGuard DNS**, **Quad9**, dan **NextDNS** (termasuk pemilihan jalur terbaik otomatis antara *Ultra Low* dan *Anycast*).
- **Siap Pakai untuk Pengguna Awam:** Mode **Tes Cepat** / **Tes Akurat**, tombol **Pasang DNS Ini** dengan alamat siap salin per perangkat, dan rekomendasi otomatis bagi pengguna yang juga ingin memblokir iklan.
- **Privasi Terjaga:** Seluruh pengujian berjalan di sisi klien (*Web Worker*), Config ID NextDNS tidak dikirim ke server perantara mana pun, dan disamarkan otomatis saat ekspor atau berbagi tautan.
- **Riwayat & Ekspor:** Simpan hasil ke `localStorage` dengan label jaringan (`Wi-Fi Rumah`, `Seluler`, `Kantor`), bandingkan antar waktu, serta ekspor ke **PNG**, **CSV**, **JSON**, atau **Share Link**.
- **Companion CLI (`cli/dnslytics.mjs`):** Menguji protokol **UDP/53**, **DoT (port 853)**, dan **DoH**, membandingkan dengan DNS bawaan sistem, mendeteksi pembelokan port 53 oleh ISP, serta memverifikasi pemblokiran iklan.

## Menjalankan Secara Lokal

```bash
npm install
npm run dev
```

Build produksi:

```bash
npm run build
npm run preview
```

Lint & Unit Test:

```bash
npm run lint
npm test
```

## Menjalankan Companion CLI

```bash
npm run cli
# atau dengan NextDNS Config ID:
npm run cli -- --nextdns <config-id>
```

## Deploy ke Cloudflare Pages

1. Hubungkan repository ini di **Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git**.
2. Gunakan konfigurasi build berikut:
   - **Framework preset:** `Vite` (atau `None`)
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
3. Setiap `git push` ke branch `main` akan otomatis di-build dan dipublikasikan ke domain `*.pages.dev`.
