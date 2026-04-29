import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  server: {
    host: true,
    port: 5173,
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
