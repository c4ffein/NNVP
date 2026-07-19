import { defineConfig, devices } from '@playwright/test';

// Under bun (the node-less dev box) everything is pinned to IPv4: vite binds
// ::1 by default here while bun's readiness probe resolves localhost to
// 127.0.0.1, so the two never meet otherwise.
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
  // CI also writes the html report so the workflow can upload it as the
  // failure artifact (playwright-report/); locally the list output is enough.
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'flow',
      use: { ...chromium },
      testIgnore: '**/tinygradRuntime.spec.js',
    },
    // Opt-in (make test-webgpu): the REAL tinygrad trace pipeline on a real
    // (SwiftShader) WebGPU device. Needs the FULL Chromium build — the
    // headless shell exposes no navigator.gpu — plus network for Pyodide.
    // The spec itself also self-skips unless NNVP_WEBGPU_E2E=1.
    {
      name: 'webgpu',
      testMatch: '**/tinygradRuntime.spec.js',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chromium',
        headless: true,
        launchOptions: {
          args: [
            '--enable-unsafe-webgpu',
            '--enable-features=Vulkan',
            '--use-vulkan=swiftshader',
            '--disable-vulkan-surface',
          ],
        },
      },
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
