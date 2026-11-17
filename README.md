# DNSlytics

**DNSlytics** is a privacy-first, zero-backend DNS-over-HTTPS (DoH) speed benchmark web application and companion CLI tool. It measures real-world resolver latency directly from the user's browser and local network to help both everyday users and network engineers identify the fastest and most reliable DNS resolver for their ISP.

---

## Features

### Web Application
- **100% Client-Side Execution:** Runs DNS queries inside a dedicated Web Worker (`src/workers/benchmarkWorker.ts`) using `fetch()` and `performance.now()` with no third-party trackers or backend relays.
- **Popular Preset Resolvers:** Compares **Cloudflare** (`1.1.1.1`, `1.1.1.2`), **Google Public DNS**, **AdGuard DNS** (Default, Non-filtering, Family), **Quad9**, **Control D** (`p0`, `p2`), and **NextDNS** (`Ultra Low`, `Anycast`, `Default`).
- **Unified NextDNS Routing Insight:** Automatically benchmarks NextDNS *Ultra Low*, *Anycast*, and *Default* routes using your optional NextDNS Config ID, surfaces the fastest route cleanly, and masks your Config ID when exporting or sharing results.
- **Custom DoH Endpoints:** Add custom `https://` DoH resolvers (RFC 8484 wireformat or JSON) with built-in input validation that blocks insecure schemes, embedded credentials, and loopback/private IP ranges.
- **Fair & Transparent Methodology:**
  - Discards initial warm-up queries (`1–2` requests) so TLS handshake overhead does not skew steady-state latency.
  - Interleaves requests across resolvers so transient network fluctuations are distributed evenly.
  - Supports **Cache Miss** (random uncached subdomains), **Cache Hit** (popular domains), or **Both**.
  - Probes CORS support first (`CORS Verified`) and transparently falls back to `no-cors` (`Timing-Only`) for providers that omit `Access-Control-Allow-Origin` headers (such as NextDNS and AdGuard DNS), with an option to enforce Strict CORS.
- **Actionable Results & Exports:**
  - Quick duration presets (**Tes Cepat** / **Tes Akurat**), ad-blocking alternative recommendations, and 1-click copyable setup addresses (**Android Private DNS**, **IPv4**, and **DoH URL**).
  - Interactive Chart.js visualizations (latency comparison & per-query stability) and expandable per-query sample logs.
  - Local history stored in `localStorage` with network labels and side-by-side session comparison.
  - Export results as a **PNG summary card**, **CSV**, **JSON**, or a **static shareable URL hash** (`#s=...`).

### Companion CLI (`cli/dnslytics.mjs`)
Browsers cannot open raw UDP/53 or TCP/853 sockets or read DNS payloads across origins lacking CORS headers. The zero-dependency Node.js companion CLI fills those gaps by testing:
- **OS System Baseline:** Benchmarks your currently active system resolver.
- **Port 53 Hijacking Detection:** Compares `id.server` (`CHAOS TXT`) responses from `1.1.1.1` over unencrypted `UDP/53` against encrypted `DoT/853` to detect transparent ISP DNS redirection.
- **Multi-Protocol Latency:** Benchmarks **DoT (port 853)**, **UDP/53**, and **DoH (HTTPS)** side by side (including NextDNS Ultra Low, Anycast, and Default with full RCODE validation).
- **Ad-Block Verification:** Verifies whether filtering resolvers actively block ad-serving test domains.

---

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite 8, Tailwind CSS v4, Chart.js, Lucide Icons
- **Testing & Linting:** Vitest, oxlint
- **Security:** Production build injects a strict `Content-Security-Policy` via `vite.config.ts` and ships Cloudflare Pages security headers in `public/_headers`

---

## Getting Started

### Prerequisites
- Node.js 20+ (tested on Node.js 26)
- npm 10+

### Installation & Local Development

```bash
git clone https://github.com/ridhozahrann/dnslytics.git
cd dnslytics
npm install
npm run dev
```

### Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run build` | Type-check (`tsc -b`) and build production assets to `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run `oxlint` across the codebase |
| `npm test` | Run unit tests with Vitest |
| `npm run cli` | Run the DNSlytics Companion CLI |

### Running the Companion CLI

```bash
# Standard multi-protocol benchmark (Cloudflare, Google, AdGuard, Quad9 + OS DNS)
npm run cli

# Include your NextDNS Config ID
npm run cli -- --nextdns <config-id>

# Customize sample count or output JSON
node cli/dnslytics.mjs --nextdns <config-id> --samples 10
node cli/dnslytics.mjs --json
```

---

## Project Structure

```text
├── cli/
│   └── dnslytics.mjs            # Zero-dependency Node.js multi-protocol CLI
├── public/
│   ├── _headers                 # Cloudflare Pages security headers
│   └── favicon.svg
├── src/
│   ├── components/              # UI components (Header, Configurator, Progress, Results, Charts, History, Guide)
│   ├── data/
│   │   └── resolvers.json       # Centralized preset resolver definitions
│   ├── lib/
│   │   ├── __tests__/           # Vitest unit tests
│   │   ├── dnsPacket.ts         # RFC 1035 / RFC 8484 wireformat encoder & decoder
│   │   ├── dnsSetupAddresses.ts # Copy-ready DNS configuration addresses per provider
│   │   ├── domains.ts           # Cache-miss / cache-hit domain helpers
│   │   ├── exportShare.ts       # PNG canvas renderer, CSV/JSON export, and URL hash sharing
│   │   ├── nextDnsConsolidate.ts# Unified NextDNS route selection helper
│   │   ├── stats.ts             # Median, P95, jitter, and penalty-weighted ranking
│   │   ├── storage.ts           # localStorage persistence for history & custom resolvers
│   │   └── validation.ts        # NextDNS ID & anti-SSRF custom DoH URL validation
│   ├── types/
│   │   └── dns.ts               # Shared TypeScript interfaces
│   ├── workers/
│   │   └── benchmarkWorker.ts   # Web Worker DoH benchmark runner
│   ├── App.tsx
│   └── index.css
└── vite.config.ts               # Vite + Tailwind + strict production CSP plugin
```

---

## Deployment (Cloudflare Pages)

DNSlytics compiles to static assets and requires no server runtime.

1. Open **Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git**.
2. Select the `dnslytics` repository.
3. Configure the build settings:
   - **Production branch:** `main`
   - **Framework preset:** `Vite`
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
4. Click **Save and Deploy**.

Security headers from `public/_headers` and the strict CSP meta tag generated during `npm run build` are automatically included in `dist/`.

---

## Browser Limitations

- Web browsers cannot send raw `UDP/53` or `DoT/853` packets; browser measurements reflect **DNS-over-HTTPS (DoH)** latency including HTTPS overhead.
- Providers that omit `Access-Control-Allow-Origin` headers (such as NextDNS and AdGuard DNS) are measured in `no-cors` opaque mode when browser compatibility mode is enabled, meaning HTTP/TLS round-trip latency is captured without inspecting DNS packet contents. Use the **Companion CLI** for raw UDP/DoT/DoH payload verification.
