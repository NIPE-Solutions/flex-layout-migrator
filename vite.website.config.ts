import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: fileURLToPath(new URL('./website', import.meta.url)),
  appType: 'mpa',
  plugins: [
    react(),
    {
      name: 'static-not-found-preview',
      configurePreviewServer(server) {
        return () =>
          server.middlewares.use((request, response, next) => {
            const pathname = new URL(request.url ?? '/', 'http://preview.local').pathname;
            if (pathname.endsWith('.html') && existsSync(new URL(`./website/dist${pathname}`, import.meta.url))) {
              next();
              return;
            }
            readFile(new URL('./website/dist/404.html', import.meta.url), 'utf8')
              .then(html => {
                response.statusCode = 404;
                response.setHeader('Content-Type', 'text/html; charset=utf-8');
                response.end(html);
              })
              .catch(next);
          });
      },
    },
  ],
  resolve: {
    alias: {
      '@core': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    manifest: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.spec.{ts,tsx}'],
  },
});
