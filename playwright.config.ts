import { defineConfig } from '@playwright/test';
const baseURL = `http://127.0.0.1:${process.env.BIGFISH_PREVIEW_PORT ?? 4178}`;
export default defineConfig({
  testDir: './browser-tests', timeout: 30000, workers: 1,
  use: { baseURL, viewport: { width: 1360, height: 980 }, headless: true },
  webServer: { command: 'pnpm preview', url: baseURL, reuseExistingServer: false, timeout: 15000 },
  reporter: [['list']], outputDir: 'artifacts/browser-results',
});
