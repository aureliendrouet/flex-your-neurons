import { expect, test, type Page } from '@playwright/test';
import { ITEM_TYPE_IDS } from '../src/lib/generators';
import { dict } from '../src/lib/i18n';
import { clearAppStorage } from './helpers';

const DAY = 86_400_000;

/**
 * Seeds a plausible history directly into localStorage.
 *
 * Playing twelve sessions through the UI would take minutes and would test the quiz, not
 * the charts. The persisted shape is the app's own (`iq:v1:sessions`), so this still
 * exercises the real read path from storage through to the SVG.
 */
async function seedHistory(
  page: Page,
  options: { sessions: number; improving?: boolean; daysApart?: number } = { sessions: 12 },
) {
  const { sessions: count, improving = true, daysApart = 4 } = options;
  await page.evaluate(
    ({ count, improving, daysApart, types }) => {
      const DAY_MS = 86_400_000;
      const now = Date.now();
      const out = [];
      for (let i = 0; i < count; i++) {
        const startedAt = now - (count - 1 - i) * daysApart * DAY_MS;
        const skill = improving ? 0.4 + i * 0.04 : 0.6;
        const responses = [];
        for (let j = 0; j < 10; j++) {
          out.length; // keep the closure simple
          responses.push({
            type: types[(i + j) % types.length],
            seed: `S${i}-${j}`,
            difficulty: 3,
            chosenIndex: 0,
            answerIndex: 0,
            correct: ((i * 7 + j * 13) % 100) / 100 < skill,
            latencyMs: 9000 - i * 300 + ((j * 37) % 2000),
          });
        }
        out.push({
          id: `seeded-${i}`,
          mode: 'practice',
          seed: `SEED${i}`,
          types,
          startedAt,
          finishedAt: startedAt + 60_000,
          responses,
        });
      }
      localStorage.setItem('iq:v1:sessions', JSON.stringify(out));
    },
    { count, improving, daysApart, types: ITEM_TYPE_IDS },
  );
  await page.reload();
}

test.describe('progress charts', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('en/progress/');
    await clearAppStorage(page);
  });

  test('are hidden until there is any history', async ({ page }) => {
    await page.reload();
    await expect(page.getByTestId('empty-state')).toBeVisible();
    await expect(page.getByTestId('charts-section')).toHaveCount(0);
    await expect(page.getByTestId('accuracy-chart')).toHaveCount(0);
  });

  test('plot one point per session, oldest first', async ({ page }) => {
    await seedHistory(page, { sessions: 12 });

    await expect(page.getByTestId('charts-section')).toBeVisible();
    await expect(page.getByTestId('accuracy-chart')).toHaveAttribute('data-points', '12');
    await expect(page.getByTestId('speed-chart')).toHaveAttribute('data-points', '12');

    // The accuracy series must be the real per-session values, in order.
    const values = await page
      .locator('[data-testid="accuracy-chart"] [data-series="accuracy"]')
      .getAttribute('data-values');
    const parsed = values!.split(',').map(Number);
    expect(parsed).toHaveLength(12);
    for (const v of parsed) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    // The seeded history improves, so the last session beats the first.
    expect(parsed[parsed.length - 1]!).toBeGreaterThan(parsed[0]!);
  });

  test('add a rolling average once there are enough sessions', async ({ page }) => {
    await seedHistory(page, { sessions: 2 });
    await expect(page.locator('[data-testid="accuracy-chart"] [data-series="rolling"]')).toHaveCount(0);

    await seedHistory(page, { sessions: 6 });
    const rolling = page.locator('[data-testid="accuracy-chart"] [data-series="rolling"]');
    await expect(rolling).toHaveCount(1);

    // The first two entries have no full window behind them, so they are blank.
    const values = (await rolling.getAttribute('data-values'))!.split(',');
    expect(values[0]).toBe('');
    expect(values[1]).toBe('');
    expect(Number(values[2])).toBeGreaterThan(0);
  });

  test('report the change against the first half of the history', async ({ page }) => {
    await seedHistory(page, { sessions: 12, improving: true });
    const callout = page.getByTestId('improvement');
    await expect(callout).toBeVisible();
    const delta = Number(await callout.getAttribute('data-delta'));
    expect(delta).toBeGreaterThan(0);
    await expect(callout).toContainText('up');
  });

  test('refuse to call a trend on too little history', async ({ page }) => {
    await seedHistory(page, { sessions: 3 });
    await expect(page.getByTestId('charts-section')).toBeVisible();
    await expect(page.getByTestId('improvement')).toHaveCount(0);
  });

  test('show eight weeks of activity including rest days', async ({ page }) => {
    await seedHistory(page, { sessions: 12, daysApart: 4 });
    const activity = page.getByTestId('activity-chart');
    await expect(activity).toBeVisible();
    await expect(activity).toHaveAttribute('data-days', '56');

    // Sessions are four days apart, so most days must be marked as rest days.
    const rest = await page.locator('[data-testid="activity-chart"] [data-rest-day]').count();
    expect(rest).toBeGreaterThan(30);

    const active = await page.locator('[data-testid="activity-chart"] [data-items]:not([data-items="0"])').count();
    expect(active).toBeGreaterThan(0);
  });

  test('give every practised type a trend sparkline', async ({ page }) => {
    await seedHistory(page, { sessions: 12 });
    for (const id of ITEM_TYPE_IDS) {
      const spark = page.getByTestId(`trend-${id}`);
      await expect(spark, id).toBeVisible();
      expect(Number(await spark.getAttribute('data-points')), id).toBeGreaterThan(1);
    }
  });

  test('render charts in French too', async ({ page }) => {
    await seedHistory(page, { sessions: 12 });
    await page.goto('fr/progress/');

    const fr = dict('fr');
    await expect(page.getByTestId('charts-section')).toContainText(fr.dashboard.charts.heading);
    await expect(page.getByTestId('accuracy-chart')).toHaveAttribute(
      'aria-label',
      fr.dashboard.charts.accuracyLabel,
    );
    await expect(page.getByTestId('improvement')).toContainText('précision');
    // French axis ticks use the French percent format.
    await expect(page.getByTestId('accuracy-chart')).toContainText(/100\s%/);
  });

  test('describe every chart for assistive technology', async ({ page }) => {
    await seedHistory(page, { sessions: 12 });
    for (const id of ['accuracy-chart', 'speed-chart', 'activity-chart']) {
      const chart = page.getByTestId(id);
      await expect(chart, id).toHaveAttribute('role', 'img');
      const label = await chart.getAttribute('aria-label');
      expect(label, `${id} has no accessible name`).toBeTruthy();
      expect(label!.length).toBeGreaterThan(10);
    }
  });

  test('survive a history of a single session without breaking', async ({ page }) => {
    await seedHistory(page, { sessions: 1 });
    await expect(page.getByTestId('charts-section')).toBeVisible();
    await expect(page.getByTestId('accuracy-chart')).toHaveAttribute('data-points', '1');
    await expect(page.getByTestId('improvement')).toHaveCount(0);
  });
});
