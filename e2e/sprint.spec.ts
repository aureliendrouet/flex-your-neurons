/**
 * The continuous timed block, end to end.
 *
 * These tests use `?t=` to shrink the window to a few seconds. That parameter is not a test hook
 * bolted on for convenience — it is a real setting, safe to expose because the score is normalised
 * to a rate per minute and the window is recorded on the session, so a short run can neither
 * flatter the reader nor be compared against a long one by accident.
 */
import { expect, test } from '@playwright/test';
import { ALL_META } from '../src/lib/generators';
import { dict } from '../src/lib/i18n';

const SPRINTABLE = ALL_META.filter((m) => m.sprintable);
const url = (type: string, seconds: number, extra = '') =>
  `en/sprint/${type}/?t=${seconds}&d=2${extra}`;

/**
 * Starts the clock, answers at least one item, then answers until the window closes.
 *
 * The first answer is awaited explicitly rather than left to the polling loop, and that is not
 * belt-and-braces. An earlier version went straight into the loop and failed intermittently under
 * parallel load: when the first item painted late, no click landed inside a six-second window, the
 * run ended with nothing recorded, and the empty-run screen appeared where the results were
 * expected. Waiting for the options to exist makes "this run has a score" a fact rather than a
 * race against the machine.
 */
async function sprintToResults(page: import('@playwright/test').Page, budgetMs: number) {
  await page.getByTestId('sprint-start').click();
  await expect(page.getByTestId('options')).toBeVisible();
  await page.getByTestId('option-0').click();

  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    if ((await page.getByTestId('results').count()) > 0) return;
    if ((await page.getByTestId('sprint-empty').count()) > 0) return;
    /*
     * Every click here is speculative, so every click is bounded.
     *
     * Without an explicit timeout this loop hung to the 45-second test timeout, intermittently:
     * the option exists when `count()` is checked, the clock expires a moment later, the element
     * unmounts, and `click()` then waits for an element that will never come back. There is no
     * `actionTimeout` in the Playwright config, so the promise never rejects and the `.catch()`
     * never runs — the failure looked like a product hang and was entirely in the harness.
     */
    const option = page.getByTestId('option-0');
    if ((await option.count()) > 0 && (await option.isEnabled().catch(() => false))) {
      await option.click({ timeout: 1_000 }).catch(() => {});
    }
    await page.waitForTimeout(150);
  }
}

test.describe('sprint mode', () => {
  test('offers only the formats that can actually be sprinted', async ({ page }) => {
    await page.goto('en/sprint/');
    for (const meta of SPRINTABLE) {
      await expect(page.getByTestId(`sprint-card-${meta.id}`), meta.id).toBeVisible();
    }
    await expect(page.locator('[data-testid^="sprint-card-"]')).toHaveCount(SPRINTABLE.length);
    // And it is a real subset: listing everything would mean the flag was doing nothing.
    expect(SPRINTABLE.length).toBeLessThan(ALL_META.length);
  });

  /**
   * The clock must not start before the reader does, and the first item must not be visible while
   * they decide. A visible item would let someone study it for as long as they liked and then start
   * a clock they were already a step ahead of.
   */
  test('waits to be started, and shows nothing to study while it waits', async ({ page }) => {
    await page.goto(url('symbol-search', 20));
    await expect(page.getByTestId('quiz')).toHaveAttribute('data-hydrated', 'true');

    await expect(page.getByTestId('quiz')).toHaveAttribute('data-phase', 'ready');
    await expect(page.getByTestId('sprint-gate')).toBeVisible();
    await expect(page.getByTestId('quiz-item')).toHaveCount(0);
    await expect(page.getByTestId('options')).toHaveCount(0);

    // The clock reads the full window and has not moved.
    await expect(page.getByTestId('sprint-clock')).toHaveText('0:20');
    await page.waitForTimeout(1200);
    await expect(page.getByTestId('sprint-clock')).toHaveText('0:20');

    await page.getByTestId('sprint-start').click();
    await expect(page.getByTestId('quiz')).toHaveAttribute('data-phase', 'answering');
    await expect(page.getByTestId('quiz-item')).toBeVisible();
  });

  test('can be started from the keyboard', async ({ page }) => {
    await page.goto(url('symbol-search', 20));
    await expect(page.getByTestId('quiz')).toHaveAttribute('data-hydrated', 'true');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('quiz')).toHaveAttribute('data-phase', 'answering');
  });

  test('counts down once started', async ({ page }) => {
    await page.goto(url('symbol-search', 20));
    await expect(page.getByTestId('quiz')).toHaveAttribute('data-hydrated', 'true');
    await page.getByTestId('sprint-start').click();
    await expect(page.getByTestId('sprint-clock')).not.toHaveText('0:20', { timeout: 5_000 });
  });

  /**
   * The defining behaviour: answering does not stop for anything. A reveal panel that had to be
   * dismissed would hold the block while the clock kept running, which turns the score into a
   * measure of how fast someone clicks Next.
   */
  test('never pauses to explain, whatever the feedback setting says', async ({ page }) => {
    await page.goto(url('symbol-search', 12));
    await expect(page.getByTestId('quiz')).toHaveAttribute('data-hydrated', 'true');
    await page.getByTestId('sprint-start').click();

    for (let i = 0; i < 4; i++) {
      await page.getByTestId('option-0').click();
      // No feedback card, no Next button, and the phase never leaves `answering`.
      await expect(page.getByTestId('feedback')).toHaveCount(0);
      await expect(page.getByTestId('next')).toHaveCount(0);
      await expect(page.getByTestId('quiz')).toHaveAttribute('data-phase', 'answering');
    }

    // The verdict still arrives — as a mark that does not wait to be dismissed.
    await expect(page.getByTestId('sprint-flash')).toBeVisible();
    await expect(page.getByTestId('sprint-count')).toContainText('4');
  });

  test('holds one difficulty for the whole block', async ({ page }) => {
    await page.goto(`en/sprint/symbol-search/?t=8`);
    await expect(page.getByTestId('quiz')).toHaveAttribute('data-hydrated', 'true');
    const level = await page.getByTestId('quiz').getAttribute('data-difficulty');
    await sprintToResults(page, 20_000);
    const stored = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('iq:v1:sessions') ?? '[]'),
    );
    const sprint = stored.at(-1);
    expect(sprint.mode).toBe('sprint');
    // One level across every response, and it is the level the run started on.
    const levels = [...new Set(sprint.responses.map((r: { difficulty: number }) => r.difficulty))];
    expect(levels).toEqual([Number(level)]);
  });

  test('ends when the clock does and scores in its own units', async ({ page }) => {
    await page.goto(url('coding', 6));
    await expect(page.getByTestId('quiz')).toHaveAttribute('data-hydrated', 'true');
    await sprintToResults(page, 20_000);

    const results = page.getByTestId('results');
    await expect(results).toBeVisible();
    await expect(results).toHaveAttribute('data-mode', 'sprint');

    // A count and a rate, and the window named beside the count.
    await expect(page.getByTestId('stat-correct')).toContainText('6s');
    await expect(page.getByTestId('stat-rate')).toContainText('/min');
    // The untimed headline figures do not belong to a sprint and must not appear.
    await expect(page.getByTestId('stat-accuracy')).toHaveCount(0);
    await expect(page.getByTestId('stat-speed')).toHaveCount(0);
  });

  test('records the window it was scored in', async ({ page }) => {
    await page.goto(url('coding', 6));
    await expect(page.getByTestId('quiz')).toHaveAttribute('data-hydrated', 'true');
    await sprintToResults(page, 20_000);

    const stored = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('iq:v1:sessions') ?? '[]'),
    );
    expect(stored.at(-1).plannedMs).toBe(6000);
  });

  /**
   * The claim the progress page makes in writing — that none of its accuracy or speed figures
   * contain a timed response — checked against the rendered page rather than trusted.
   */
  test('keeps its results off the untimed statistics and on their own board', async ({ page }) => {
    await page.goto(url('coding', 6));
    await expect(page.getByTestId('quiz')).toHaveAttribute('data-hydrated', 'true');
    await sprintToResults(page, 20_000);
    await expect(page.getByTestId('results')).toBeVisible();

    await page.goto('en/progress/');
    // The sprint appears here, with its own figures.
    await expect(page.getByTestId('sprint-section')).toBeVisible();
    await expect(page.getByTestId('sprint-row-coding')).toBeVisible();
    await expect(page.getByTestId('sprint-best-coding')).toContainText('/min');

    // And nowhere else: the untimed row for the same format still has no attempts.
    const row = page.getByTestId('type-row-coding');
    await expect(row).toBeVisible();
    const cells = (await row.textContent()) ?? '';
    expect(cells).not.toMatch(/[1-9]\d*\s*%/);
  });

  test('says so plainly when the clock ran out before anything was answered', async ({ page }) => {
    await page.goto(url('coding', 5));
    await expect(page.getByTestId('quiz')).toHaveAttribute('data-hydrated', 'true');
    await page.getByTestId('sprint-start').click();
    // Answer nothing at all.
    await expect(page.getByTestId('sprint-empty')).toBeVisible({ timeout: 12_000 });
    await expect(page.getByTestId('sprint-empty')).toContainText(dict('en').quiz.sprint.nothing);
    // Nothing was measured, so nothing is stored.
    const stored = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('iq:v1:sessions') ?? '[]'),
    );
    expect(stored).toEqual([]);
  });

  test('is reachable from the site navigation, in both languages', async ({ page }) => {
    for (const locale of ['en', 'fr'] as const) {
      await page.goto(`${locale}/`);
      const link = page.getByRole('navigation').getByText(dict(locale).nav.sprint, { exact: true });
      await expect(link, locale).toBeVisible();
    }
  });
});
