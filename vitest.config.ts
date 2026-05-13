import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@server': path.resolve(import.meta.dirname, 'server'),
    },
  },
  test: {
    // Default environment is node; per-file annotations override for DOM tests.
    // Component tests (src/components/*.test.tsx) and renderHook tests
    // (src/hooks/*.test.ts) use @vitest-environment jsdom annotations.
    // Server tests and pure-Node tests stay in the default node environment.
    environment: 'node',
    globals: true,
    include: [
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      'server/**/*.test.ts',
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'src/**/*.tsx', 'server/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'server/**/*.test.ts',
        'src/main.tsx',
        'src/vite-env.d.ts',
        'src/data/**',
      ],
    },
  },
});
