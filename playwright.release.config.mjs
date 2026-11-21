import fs from 'node:fs';
import { defineConfig } from '@playwright/test';
import { releasePaths, sha256 } from './scripts/release-core.mjs';
const p=releasePaths();
export default defineConfig({
  testDir:'e2e',testMatch:'**/release-artifact.spec.js',globalSetup:'./e2e/release-setup.mjs',
  workers:1,retries:0,forbidOnly:!!process.env.CI,outputDir:'test-results-release',
  metadata:{artifactSha256:sha256(fs.readFileSync(p.zip))},
  reporter:[['list'],['json',{outputFile:p.report}]],
  use:{browserName:'chromium',trace:'retain-on-failure'},
});
