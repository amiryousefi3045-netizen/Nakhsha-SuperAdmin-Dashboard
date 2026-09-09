import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests for the Super Admin dashboard.
 *
 * The spec drives the real OTP login UI (the backend returns `devCode` in
 * non-production mode, which AuthPanel renders with an auto-use button), so no
 * SMS provider is contacted. The backend runs against a dedicated `nakhsha_e2e`
 * database and never touches the dev database.
 *
 * Local first run:
 *   npm install -D @playwright/test
 *   npx playwright install chromium
 *   npm run test:e2e
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "on-first-retry",
  },
  projects: [{
    name: "chromium",
    use: {
      ...devices["Desktop Chrome"],
      // Local workaround: on this machine the Playwright "headless shell"
      // binary could not be downloaded (browser download fails on the proxy),
      // so PLAYWRIGHT_EXECUTABLE_PATH points at the full Chrome for Testing
      // binary instead. Full Chrome is launched headed locally; CI never sets
      // this variable and uses the normal managed headless-shell via
      // `npx playwright install chromium`.
      executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
      headless: process.env.PLAYWRIGHT_EXECUTABLE_PATH ? false : true,
    },
  }],
  webServer: [
    {
      command: "node server.js",
      cwd: "../backend",
      url: "http://127.0.0.1:5000/api/health",
      reuseExistingServer: !process.env.CI,
      env: {
        PORT: "5000",
        NODE_ENV: "development",
        JWT_SECRET: "e2e-secret-key-for-playwright-only",
        MONGODB_URI: "mongodb://127.0.0.1:27017/nakhsha_e2e",
        SMS_MOCK: "true",
        // The only phone whose OTP login auto-promotes to super_admin.
        SUPER_ADMIN_PHONE: "09120000000",
      },
    },
    {
      command: "npm run dev",
      cwd: ".",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: !process.env.CI,
      env: {
        PORT: "5173",
      },
    },
  ],
});