import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    ...devices['iPhone 13'],
  },
  projects: [
    { name: 'webkit-iphone', use: { ...devices['iPhone 13'] } },
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'bun run preview --host --port 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
