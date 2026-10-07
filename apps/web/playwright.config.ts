import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

/**
 * End-to-end smoke tests (T12, F-144, F-145).
 *
 * Two projects:
 *   local   builds the app and serves it with `next start` on port 3100, with
 *           placeholder Supabase settings, so data pages show their empty or
 *           error states. Run with `pnpm e2e`.
 *   remote  points at a deployed site (a Vercel preview or production) given
 *           by E2E_BASE_URL. No server is started and the specs only make
 *           GET requests. Run with
 *           `E2E_BASE_URL=https://akana-one.vercel.app pnpm e2e`.
 *
 * E2E_BASE_URL picks the project: unset, only "local" is registered and the
 * server is started; set, only "remote" is registered and nothing is started.
 *
 * The specs never sign in and never submit a form. See docs/TESTING.md.
 */

const PORT = 3100;
const LOCAL_URL = `http://localhost:${PORT}`;
const REMOTE_URL = process.env.E2E_BASE_URL;
const CI = !!process.env.CI;

// Use the pre-installed Chromium when there is one (the sandbox and some CI
// images). Elsewhere Playwright's own download is used.
const PREINSTALLED = "/opt/pw-browsers/chromium";
const executablePath =
  process.env.E2E_CHROMIUM_PATH ?? (existsSync(PREINSTALLED) ? PREINSTALLED : undefined);

// Vercel deployment protection on previews: pass the automation bypass
// secret when the project has one.
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

// E2E_SKIP_BUILD=1 reuses an existing .next build (CI builds in its own step).
const startCommand = process.env.E2E_SKIP_BUILD
  ? `pnpm start -p ${PORT}`
  : `pnpm build && pnpm start -p ${PORT}`;

// Results and the HTML report live under node_modules, which git and ESLint
// already ignore, so no other config file needs to change.
const OUT = "node_modules/.e2e";

export default defineConfig({
  testDir: "./e2e",
  outputDir: `${OUT}/test-results`,
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: CI ? 2 : undefined,
  reporter: CI ? [["list"], ["html", { open: "never", outputFolder: `${OUT}/report` }]] : "list",
  timeout: 30_000,
  use: {
    trace: "on-first-retry",
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: REMOTE_URL
    ? [
        {
          name: "remote",
          use: {
            ...devices["Desktop Chrome"],
            baseURL: REMOTE_URL,
            extraHTTPHeaders: bypass ? { "x-vercel-protection-bypass": bypass } : undefined,
          },
        },
      ]
    : [
        {
          name: "local",
          use: { ...devices["Desktop Chrome"], baseURL: LOCAL_URL },
        },
      ],
  webServer: REMOTE_URL
    ? undefined
    : {
        command: startCommand,
        url: `${LOCAL_URL}/api/health`,
        reuseExistingServer: !CI,
        timeout: 300_000,
        stdout: "ignore",
        stderr: "pipe",
        env: {
          NEXT_PUBLIC_SUPABASE_URL:
            process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://example.supabase.co",
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
            process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "e2e-placeholder",
        },
      },
});
