import { defineConfig, devices } from '@playwright/test';

/**
 * Tests run against the *built* static site served by `astro preview`, not the dev
 * server. GitHub Pages will serve exactly these files, so this is the artefact worth
 * testing — it also catches base-path mistakes, which a dev server hides.
 */
const BASE_PATH = process.env.BASE_PATH ?? '/iq';
/**
 * Deliberately NOT Astro's default 4321. A dev server left running on that port would be
 * picked up as the "existing server" and the whole suite would silently run against it —
 * which happened, and quietly passed while testing an artefact nobody was going to deploy.
 */
const PORT = Number(process.env.E2E_PORT ?? 4331);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['html'], ['list']] : 'list',
  timeout: 45_000,
  expect: { timeout: 10_000 },

  use: {
    // The trailing slash matters. `new URL('practice/', '…/flex-your-neurons/')` keeps the base path,
    // whereas a leading-slash path would resolve against the origin and drop it — so
    // every test navigates with a RELATIVE path ('practice/matrix/', './' for the home
    // page). That also means these tests genuinely exercise the deployed base path.
    baseURL: `http://localhost:${PORT}${BASE_PATH}/`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],

  webServer: {
    // Not `astro preview`: in Astro 7 it always detaches into a background daemon, and
    // Playwright needs a process it can own and shut down. `scripts/serve-static.mjs`
    // serves dist the way GitHub Pages does.
    command: `npm run build && node scripts/serve-static.mjs --port ${PORT} --base ${BASE_PATH}`,
    url: `http://localhost:${PORT}${BASE_PATH}/`,
    // Never reuse: the point of this suite is to test a *fresh build of dist*, and reuse
    // makes that conditional on whatever is already listening. The rebuild costs ~1s.
    reuseExistingServer: false,
    timeout: 180_000,
    env: { BASE_PATH },
  },
});
