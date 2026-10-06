import { defineConfig } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT) || 4173;

// Browser E2E for the static app. A tiny Node server (e2e/serve.mjs) serves the
// repo root exactly like GitHub Pages does — no bundler involved.
export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.spec.js',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node e2e/serve.mjs',
    url: `http://127.0.0.1:${PORT}/index.html`,
    reuseExistingServer: !process.env.CI,
  },
});
