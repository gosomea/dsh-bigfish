import { defineConfig } from '@playwright/test';
const baseURL = `http://127.0.0.1:${process.env.BIGFISH_PREVIEW_PORT ?? 4178}`;
export default defineConfig({
  testDir: './browser-tests', timeout: 30000, workers: process.env.BIGFISH_BROWSER_WORKERS ? Number(process.env.BIGFISH_BROWSER_WORKERS) : 1,
  use: { baseURL, viewport: { width: 1360, height: 980 }, headless: true, launchOptions: {timeout: 30000} },
  webServer: { command: 'pnpm preview', url: baseURL, reuseExistingServer: false, timeout: 15000 },
  reporter: [['list']], outputDir: 'artifacts/browser-results',
});
