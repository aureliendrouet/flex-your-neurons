import { expect, test, type Page } from '@playwright/test';
import { expectedItem, practiceUrl, waitForQuiz, type DrillOptions } from './helpers';

/**
 * The drill stage: while an item is on screen, the item is on screen.
 *
 * The defect these tests exist for was measurable rather than aesthetic. On a 1280x800
 * desktop one matrix item ran from y=299 to y=1011, so the option grid began 211px below
 * the fold and no scroll position existed from which the pattern and the options could both
 * be seen. A matrix is a comparison task; making the comparison depend on memory instead of
 * sight changes what the item measures.
 */
const OPTS: DrillOptions = { seed: 'STAGE001', difficulty: 3, length: 3 };

/** Where an element sits relative to the *viewport*, which is the only frame that matters here. */
async function box(page: Page, selector: string) {
  return page.locator(selector).first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, height: r.height };
  });
}

const scrollY = (page: Page) => page.evaluate(() => window.scrollY);

test.describe('the item owns the viewport while it is live', () => {
  test('the stimulus and the answer tray are both on screen where the page rests', async ({
    page,
  }) => {
    await page.goto(practiceUrl('matrix', OPTS));
    await waitForQuiz(page);

    // The whole claim is that this holds without scrolling anywhere first.
    expect(await scrollY(page)).toBe(0);

    const vh = page.viewportSize()!.height;
    const stimulus = await box(page, '[data-stimulus]');
    expect(stimulus.top).toBeGreaterThanOrEqual(0);
    expect(stimulus.bottom).toBeLessThanOrEqual(vh);

    /*
     * On a phone eight figural options at a legible size genuinely cannot share a screen
     * with the pattern, so the tray is allowed to scroll — but only the tray, and the
     * stimulus above it never moves. On a desktop nothing needs to scroll at all.
     */
    const tray = await box(page, '[data-testid="answer-tray"]');
    expect(tray.top).toBeGreaterThanOrEqual(stimulus.bottom - 1);
    expect(tray.bottom).toBeLessThanOrEqual(vh + 1);
  });

  test('answering does not resize the stimulus', async ({ page }) => {
    await page.goto(practiceUrl('matrix', OPTS));
    await waitForQuiz(page);

    const before = await box(page, '[data-stimulus]');
    const item = expectedItem('matrix', OPTS.seed, 0, OPTS.difficulty);
    await page.getByTestId(`option-${item.answerIndex}`).click();
    await expect(page.getByTestId('feedback')).toBeVisible();
    const after = await box(page, '[data-stimulus]');

    // Motion at the stimulus is the one thing this design does not do; a figure that jumps
    // when the explanation appears is exactly that.
    expect(Math.abs(after.top - before.top)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.height - before.height)).toBeLessThanOrEqual(1);
  });

  test('the verdict and the way forward are visible without scrolling', async ({ page }) => {
    await page.goto(practiceUrl('matrix', OPTS));
    await waitForQuiz(page);

    const item = expectedItem('matrix', OPTS.seed, 0, OPTS.difficulty);
    await page.getByTestId(`option-${item.answerIndex}`).click();

    const vh = page.viewportSize()!.height;
    for (const testid of ['verdict', 'next']) {
      const b = await box(page, `[data-testid="${testid}"]`);
      expect(b.top, `${testid} is above the viewport`).toBeGreaterThanOrEqual(0);
      expect(b.bottom, `${testid} is below the fold`).toBeLessThanOrEqual(vh);
    }
    expect(await scrollY(page)).toBe(0);
  });

  /** A short stimulus must not be stranded in the middle of a region sized for a matrix. */
  test('a two-line stimulus does not reserve a matrix-sized region', async ({ page }) => {
    await page.goto(practiceUrl('syllogism', OPTS));
    await waitForQuiz(page);

    const stimulus = await box(page, '[data-stimulus]');
    const tray = await box(page, '[data-testid="answer-tray"]');
    // Whatever the gap is, it is spacing rather than a fixed slot the text is floating in.
    expect(tray.top - stimulus.bottom).toBeLessThan(80);
  });

  /**
   * The lock must not be a trap. Every navigation target stays on the page and stays
   * clickable — it is only the reading matter around the quiz that goes.
   */
  test('the site navigation stays operable', async ({ page }) => {
    await page.goto(practiceUrl('matrix', OPTS));
    await waitForQuiz(page);

    await expect(page.getByTestId('nav-progress')).toBeVisible();
    await expect(page.getByTestId('wordmark')).toBeVisible();
    await expect(page.getByTestId('lang-fr')).toBeVisible();
    await page.getByTestId('nav-progress').click();
    await expect(page).toHaveURL(/progress/);
  });

  /**
   * The page around the stage is pushed below the fold, never hidden — a drill on
   * `/practice/matrix/` starts on arrival, so anything removed for its duration would be
   * unreachable in practice, and an h1 that is not rendered is not a heading.
   */
  test('the heading and the format description are still on the page', async ({ page }) => {
    await page.goto(practiceUrl('matrix', OPTS));
    await waitForQuiz(page);

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('.prose-card')).toBeVisible();
    // Below the stage rather than above it, which is what keeps the item at the top.
    const stage = await box(page, '.quiz-stage');
    const head = await box(page, '.page-head');
    expect(head.top).toBeGreaterThan(stage.top);
  });

  /** The stage is scoped to a live item: results are an ordinary document again. */
  test('the stage ends when the run ends', async ({ page }) => {
    const opts: DrillOptions = { ...OPTS, length: 1 };
    await page.goto(practiceUrl('matrix', opts));
    await waitForQuiz(page);

    await expect(page.locator('html')).toHaveAttribute('data-drill', '');
    const item = expectedItem('matrix', opts.seed, 0, opts.difficulty);
    await page.getByTestId(`option-${item.answerIndex}`).click();
    await page.getByTestId('next').click();

    await expect(page.getByTestId('results')).toBeVisible();
    await expect(page.locator('html')).not.toHaveAttribute('data-drill', '');
    // And the heading is back above the content, where a document puts it.
    const results = await box(page, '[data-testid="results"]');
    const head = await box(page, '.page-head');
    expect(head.top).toBeLessThan(results.top);
  });
});
