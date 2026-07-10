import { defineConfig, devices } from '@playwright/test';

// Under bun (the node-less dev box; run with PW_DISABLE_TS_ESM=1) everything
// is pinned to IPv4: vite binds ::1 by default here while bun's readiness
// probe resolves localhost to 127.0.0.1, so the two never meet otherwise.
// Under node (local `make test-e2e`) the historical localhost setup stays.
const bunRuntime = !!process.versions.bun;
const baseURL = bunRuntime ? 'http://127.0.0.1:5173' : 'http://localhost:5173';

const chromium = {
  ...devices['Desktop Chrome'],
  // Run in headed mode when DISPLAY is set (e.g., when using xvfb-run)
  // This enables WebGL support for training tests
  headless: !process.env.DISPLAY,
  launchOptions: {
    args: [
      '--disable-gpu',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--use-gl=swiftshader',
    ],
  },
};

export default defineConfig({
  testDir: './tests',
  // Only Playwright specs are *.spec.js; the bun unit suite lives in tests/unit/*.test.js.
  // Without this, `playwright test` (whole dir) tries to load the bun test files and crashes.
  testMatch: '**/*.spec.js',
  fullyParallel: !process.env.CI,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 4,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  // Every spec runs against both canvases through the driver in
  // tests/helpers/canvas.js: `flow` is the app default (Vue Flow), `d3` is
  // the legacy whiteboard kept reachable via ?canvas=d3.
  projects: [
    {
      name: 'flow',
      use: { ...chromium, canvasMode: 'flow' },
    },
    {
      name: 'd3',
      use: { ...chromium, canvasMode: 'd3' },
    },
  ],
  webServer: {
    command: bunRuntime
      ? 'bunx vite --host 127.0.0.1 --port 5173 --strictPort'
      : 'npm run dev',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
