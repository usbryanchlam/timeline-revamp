import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      // Narrow door for the frontend to import the SHARED handle
      // validator + reserved-words list from server/. Frontend code
      // MUST NOT import anything else from server/ (no DB code, no
      // env, no auth middleware) — those would either crash at build
      // time (Node-only modules) or leak server contracts into the
      // bundle. Only @server/handles/* is safe.
      '@server': path.resolve(import.meta.dirname, 'server'),
    },
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      // All /api/* requests from the frontend in dev are proxied to the Hono
      // process started by scripts/dev.ts. Production (Phase 8) replicates
      // this with Nginx. Frontend code never needs to know the API host —
      // always fetch('/api/...').
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: false,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Split maplibre-gl into its own cacheable chunk. Belt-and-braces with
        // the React.lazy() import in Reel.tsx — lazy defers loading until after
        // first paint; manualChunks ensures it's a stable file across deploys.
        manualChunks: {
          maplibre: ['maplibre-gl'],
        },
      },
    },
  },
});
