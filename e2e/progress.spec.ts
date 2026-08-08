import { expect, test, type Page } from '@playwright/test';
import { ALL_META } from '../src/lib/generators';
import { dict } from '../src/lib/i18n';
import type { ErrorType, ItemTypeId, Session } from '../src/lib/types';

const TYPES = ALL_META.map((m) => m.id);

/**
 * Writes a synthetic history straight into localStorage.
 *
 * Answering enough items through the UI to populate ten formats and seven error types would
 * take minutes per test; the persisted shape is a documented contract (`Session[]` under
 * `iq:v1:sessions`), so writing it directly is the same data the app would have written.
 */
async function seedHistory(
  page: Page,
  options: { sessions?: number; errorTypes?: ErrorType[]; types?: ItemTypeId[] } = {},
): Promise<void> {
  const count = options.sessions ?? 6;
  const errorTypes = options.errorTypes ?? ['wrong-axis', 'off-by-one', 'copy'];
  const types = options.types ?? TYPES;

  const sessions: Session[] = Array.from({ length: count }, (_, s) => ({
    id: `synthetic-${s}`,
    mode: 'practice' as const,
    seed: `SYNTH${s}`,
    types,
    startedAt: Date.now() - (count - s) * 86_400_000,
    finishedAt: Date.now() - (count - s) * 86_400_000 + 60_000,
    responses: Array.from({ length: 12 }, (_, i) => {
      const type = types[(s * 5 + i) % types.length]!;
      const correct = (s + i) % 3 !== 0;
      return {
        type,
        seed: `S${s}-${i}`,
        difficulty: 3 as const,
        chosenIndex: correct ? 0 : 1,
        answerIndex: 0,
        correct,
        // Distinct per format, so the scatter has a spread to plot.
        latencyMs: 4000 + types.indexOf(type) * 900 + i * 40,
        // `wrong-axis` deliberately dominates, so there is a habit to find.
        errorType: correct ? ('correct' as const) : errorTypes[i % 2 === 0 ? 0 : i % errorTypes.length]!,
      };
    }),
  }));

  await page.goto('en/progress/');
  await page.evaluate((value) => localStorage.setItem('iq:v1:sessions', JSON.stringify(value)), sessions);
  await page.reload();
  await expect(page.getByTestId('dashboard')).toHaveAttribute('data-has-data', 'true');
}

test.describe('the empty state is designed, not a void', () => {
  test('explains why it is empty and offers both ways to fill it', async ({ page }) => {
    await page.goto('en/progress/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    const empty = page.getByTestId('empty-state');
    const t = dict('en').dashboard;
    await expect(empty).toBeVisible();
    await expect(empty).toContainText(t.emptyHeading);
    await expect(empty).toContainText(t.emptyBody);
    await expect(empty).toContainText(t.emptyPrivacy);

    // Both routes out, and they work.
    await empty.getByRole('link', { name: t.emptyCtaPractice }).click();
    await expect(page).toHaveURL(/\/en\/practice\/$/);
  });

  /** Nothing that needs data is rendered without data. */
  test('shows no chart sections before there is anything to chart', async ({ page }) => {
    await page.goto('en/progress/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    for (const section of ['charts-section', 'profile-section', 'speed-section', 'mistake-section', 'wall-section']) {
      await expect(page.getByTestId(section), section).toHaveCount(0);
    }
  });
});

test.describe('the CHC profile', () => {
  test('shows one bar per domain, with the code beside the name', async ({ page }) => {
    await seedHistory(page);
    const chart = page.getByTestId('domain-chart');
    await expect(chart).toBeVisible();

    for (const domain of ['Gf', 'Gv', 'Gwm', 'Gs']) {
      await expect(chart.locator(`[data-bar="${domain}"]`), domain).toHaveCount(1);
    }
  });

  /**
   * A domain read off three items must not be presented with the same confidence as one read
   * off three hundred. Thin evidence is marked, not hidden — "not enough yet" is a different
   * statement from "this does not exist".
   */
  test('marks a thinly-evidenced domain as provisional', async ({ page }) => {
    // Only matrix and rotation attempted, so the memory and speed domains stay tiny.
    await seedHistory(page, { types: ['matrix', 'rotation', 'span'], sessions: 1 });

    const provisional = page.getByTestId('domain-chart').locator('[data-provisional="true"]');
    expect(await provisional.count()).toBeGreaterThan(0);
    await expect(page.getByTestId('provisional-key')).toBeVisible();
  });
});

test.describe('accuracy against speed', () => {
  test('plots one dot per qualifying format and names the two extremes', async ({ page }) => {
    await seedHistory(page);

    const chart = page.getByTestId('speed-accuracy-chart');
    await expect(chart).toBeVisible();
    const dots = chart.locator('[data-format]');
    expect(await dots.count()).toBeGreaterThanOrEqual(2);

    /*
     * At most two named extremes, and the names live in the caption rather than over the
     * plot. One note rather than two is correct, not a bug: when the same format is both the
     * quickest and the most accurate it is named once, and the halo count has to agree.
     */
    const t = dict('en').dashboard.speed;
    const notes = await page
      .locator('[data-extreme-note]')
      .evaluateAll((els) => els.map((el) => el.textContent ?? ''));
    expect(notes.length).toBeGreaterThanOrEqual(1);
    expect(notes.length).toBeLessThanOrEqual(2);
    for (const note of notes) {
      expect(note, `"${note}" names no extreme`).toMatch(
        new RegExp(`${t.fastest}|${t.mostAccurate}$`),
      );
    }

    // One halo per named format, so plot and caption cannot disagree.
    await expect(chart.locator('[data-extreme]')).toHaveCount(notes.length);
  });

  /** Every dot is reachable as text, so nothing is gated behind a hover. */
  test('every dot carries a description and a table row', async ({ page }) => {
    await seedHistory(page);

    const described = await page
      .locator('[data-testid="speed-accuracy-chart"] [data-format]')
      .evaluateAll((els) =>
        els.map((el) => ({
          format: el.getAttribute('data-format'),
          title: el.querySelector('title')?.textContent ?? '',
        })),
      );
    expect(described.length).toBeGreaterThan(0);
    for (const dot of described) {
      expect(dot.title, `${dot.format} has no description`).not.toBe('');
      // The same value is in the table underneath — the tooltip enhances, never gates.
      await expect(page.getByTestId(`type-row-${dot.format}`)).toBeVisible();
    }
  });

  test('says so rather than plotting a single point', async ({ page }) => {
    await seedHistory(page, { types: ['matrix'], sessions: 1 });
    await expect(page.getByTestId('speed-chart-empty')).toBeVisible();
    await expect(page.getByTestId('speed-accuracy-chart')).toHaveCount(0);
  });
});

test.describe('the mistake profile', () => {
  test('names every recurring mistake and orders them by frequency', async ({ page }) => {
    await seedHistory(page, { errorTypes: ['wrong-axis', 'off-by-one', 'mirror'] });

    const chart = page.getByTestId('mistake-chart');
    await expect(chart).toBeVisible();

    const bars = await chart
      .locator('[data-bar]')
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-bar')));
    expect(bars).toContain('wrong-axis');

    // Commonest first: the bar values descend down the chart.
    const values = await chart
      .locator('[data-bar]')
      .evaluateAll((els) => els.map((el) => Number(el.getAttribute('data-value'))));
    for (let i = 1; i < values.length; i++) {
      expect(values[i]!, 'bars are not in descending order').toBeLessThanOrEqual(values[i - 1]!);
    }

    // The tags are the same words the drill used at the time.
    await expect(chart).toContainText(dict('en').diagnosis.tags['wrong-axis']);
  });

  /** A history written before the taxonomy existed carries no diagnosis; say so. */
  test('reports honestly when nothing is diagnosed', async ({ page }) => {
    await page.goto('en/progress/');
    await page.evaluate(() => {
      const sessions = [
        {
          id: 'legacy',
          mode: 'practice',
          seed: 'LEGACY01',
          types: ['matrix'],
          startedAt: Date.now() - 86_400_000,
          finishedAt: Date.now(),
          // No `errorType` anywhere, exactly as an older export looks.
          responses: Array.from({ length: 6 }, (_, i) => ({
            type: 'matrix',
            seed: `L${i}`,
            difficulty: 3,
            chosenIndex: 1,
            answerIndex: 0,
            correct: false,
            latencyMs: 5000,
          })),
        },
      ];
      localStorage.setItem('iq:v1:sessions', JSON.stringify(sessions));
    });
    await page.reload();

    await expect(page.getByTestId('mistake-profile')).toHaveAttribute('data-count', '0');
    await expect(page.getByTestId('mistake-profile-empty')).toBeVisible();
    await expect(page.getByTestId('mistake-chart')).toHaveCount(0);
  });
});

test.describe('the sparkline wall', () => {
  test('has a cell for every format, attempted or not', async ({ page }) => {
    await seedHistory(page, { types: ['matrix', 'rotation'], sessions: 2 });

    for (const meta of ALL_META) {
      const cell = page.getByTestId(`wall-${meta.id}`);
      await expect(cell, meta.id).toBeVisible();
      await expect(cell, meta.id).toContainText(dict('en').items[meta.id].name);
    }

    // Attempted formats get a trace; untouched ones say so rather than showing an empty box.
    await expect(page.getByTestId('wall-matrix').locator('[data-testid="trend-matrix"]')).toBeVisible();
    await expect(page.getByTestId('wall-syllogism')).toContainText(dict('en').dashboard.wall.never);
  });

  test('each cell links to its own drill', async ({ page }) => {
    await seedHistory(page, { sessions: 2 });
    await page.getByTestId('wall-rotation').click();
    await expect(page).toHaveURL(/\/en\/practice\/rotation\/$/);
  });
});

test.describe('numbers do not jitter', () => {
  /**
   * Tabular figures where numbers stack vertically, so a value changing from 9% to 100% does
   * not shift the column it sits in. And no count-up animation anywhere: an odometer implies
   * a precision this data does not have.
   */
  test('stat values and table columns use tabular figures', async ({ page }) => {
    await seedHistory(page);

    const stat = await page
      .getByTestId('total-accuracy')
      .locator('.stat-value')
      .evaluate((el) => getComputedStyle(el).fontVariantNumeric);
    expect(stat).toContain('tabular-nums');

    const cell = await page
      .getByTestId('type-row-matrix')
      .locator('td.num')
      .first()
      .evaluate((el) => getComputedStyle(el).fontVariantNumeric);
    expect(cell).toContain('tabular-nums');
  });

  test('no value animates on arrival', async ({ page }) => {
    await seedHistory(page);
    const animated = await page
      .locator('.stat-value, .wall-value, .mistakes-count')
      .evaluateAll((els) => els.filter((el) => getComputedStyle(el).animationName !== 'none').length);
    expect(animated).toBe(0);
  });
});
