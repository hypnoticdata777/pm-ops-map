import { defineConfig } from '@playwright/test';

// Browser tests against the PRODUCTION BUILD served under /pm-ops-map/ — the way
// GitHub Pages hosts a project site. Run `npm run build` first (the
// test:e2e:pages script does). Only the specs that are meaningful for the built
// artifact run here; the deep security suites exercise the source tree.
const PORT = Number(process.env.E2E_PAGES_PORT) || 4174;
const PREFIX = '/pm-ops-map';

export default defineConfig({
  testDir: 'e2e',
  testMatch: ['**/smoke.spec.js', '**/demo.spec.js', '**/built-site.spec.js'],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  outputDir: 'test-results-pages',
  use: {
    // The trailing slash matters: it makes relative URLs like "index.html?demo=1" resolve under the prefix.
    baseURL: `http://127.0.0.1:${PORT}${PREFIX}/`,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node e2e/serve.mjs',
    env: { E2E_ROOT: 'dist', E2E_PORT: String(PORT), E2E_PREFIX: PREFIX },
    url: `http://127.0.0.1:${PORT}${PREFIX}/index.html`,
    reuseExistingServer: !process.env.CI,
  },
});
