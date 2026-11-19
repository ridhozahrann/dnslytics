import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

function strictProductionCsp(): Plugin {
  return {
    name: 'strict-production-csp',
    apply: 'build',
    transformIndexHtml(html) {
      const csp = [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "connect-src https:",
        "worker-src 'self' blob:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; ');
      return html.replace(
        '<head>',
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`,
      );
    },
  };
}

function serveCompanionCli(): Plugin {
  const cliPath = resolve(process.cwd(), 'cli/dnslytics.mjs');
  return {
    name: 'serve-companion-cli',
    configureServer(server) {
      server.middlewares.use('/dnslytics.mjs', (_req, res) => {
        res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
        res.end(readFileSync(cliPath, 'utf8'));
      });
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'dnslytics.mjs',
        source: readFileSync(cliPath, 'utf8'),
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), strictProductionCsp(), serveCompanionCli()],
});
