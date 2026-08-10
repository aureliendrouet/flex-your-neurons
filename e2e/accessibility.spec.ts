import { expect, test } from '@playwright/test';
import {
  expectedItem,
  paintedColour,
  practiceUrl,
  startSpanIfGated,
  waitForQuiz,
  type DrillOptions,
} from './helpers';

const OPTS: DrillOptions = { seed: 'A11YTEST', difficulty: 2, length: 3 };

test.describe('keyboard operation', () => {
  test('number keys answer, Enter advances — a whole drill without the mouse', async ({ page }) => {
    await page.goto(practiceUrl('matrix', OPTS));
    await waitForQuiz(page);

    for (let i = 0; i < OPTS.length; i++) {
      // Wait for the item to be genuinely ready before pressing. `page.keyboard.press`
      // does not auto-wait the way `click` does, so without this the key can be delivered
      // in the frame before the next item has committed and simply be dropped.
      await expect(page.getByTestId('progress-label')).toHaveText(`${i + 1} of ${OPTS.length}`);
      await expect(page.getByTestId('feedback')).toHaveCount(0);

      const item = expectedItem('matrix', OPTS.seed, i, OPTS.difficulty);
      await page.keyboard.press(String(item.answerIndex + 1));

      await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', 'true');
      await page.keyboard.press('Enter');
    }

    await expect(page.getByTestId('results')).toBeVisible();
    await expect(page.getByTestId('stat-accuracy')).toContainText('100%');
  });

  /**
   * Regression test for a real defect: the feedback panel used to be cleared by an effect
   * rather than in the same update as the cursor, leaving one render in which the next
   * item was on screen with the previous item's feedback still mounted. A second Enter in
   * that window advanced twice and silently skipped an item.
   */
  test('a repeated Enter does not skip an item', async ({ page }) => {
    await page.goto(practiceUrl('matrix', OPTS));
    await waitForQuiz(page);

    const first = expectedItem('matrix', OPTS.seed, 0, OPTS.difficulty);
    await page.getByTestId(`option-${first.answerIndex}`).click();
    await expect(page.getByTestId('feedback')).toBeVisible();

    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');

    // Exactly one advance: item 2 of 3, not 3 of 3 and not the results screen.
    await expect(page.getByTestId('progress-label')).toHaveText(`2 of ${OPTS.length}`);
    await expect(page.getByTestId('results')).toHaveCount(0);
  });

  test('a key beyond the option count does nothing', async ({ page }) => {
    await page.goto(practiceUrl('series-number', OPTS));
    await waitForQuiz(page);

    // Number series has five options, so "8" must be ignored rather than crashing.
    await page.keyboard.press('8');
    await expect(page.getByTestId('feedback')).toHaveCount(0);
    await expect(page.getByTestId('options')).toBeVisible();
  });

  test('typing in the span input does not trigger the option shortcuts', async ({ page }) => {
    await page.goto(practiceUrl('span', OPTS));
    await waitForQuiz(page);

    await startSpanIfGated(page);
    const input = page.getByTestId('span-input');
    await expect(input).toBeEnabled({ timeout: 25_000 });
    await input.click();
    await page.keyboard.type('1234');

    await expect(input).toHaveValue('1234');
    await expect(page.getByTestId('feedback')).toHaveCount(0);
  });

  test('every option is reachable by Tab', async ({ page }) => {
    await page.goto(practiceUrl('matrix', OPTS));
    await waitForQuiz(page);

    const focusable = await page.getByTestId('options').locator('button').count();
    expect(focusable).toBe(8);

    await page.getByTestId('option-0').focus();
    await expect(page.getByTestId('option-0')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('option-1')).toBeFocused();
  });

  test('a skip link is the first thing in the tab order', async ({ page }) => {
    await page.goto('en/');
    await page.keyboard.press('Tab');
    await expect(page.locator(':focus')).toHaveText('Skip to content');
  });
});

test.describe('semantics for assistive technology', () => {
  test('the page has one h1 and a labelled main landmark', async ({ page }) => {
    for (const path of ['en/', 'en/practice/', 'en/test/', 'en/progress/', 'en/about/', 'en/terms/', 'fr/', 'fr/about/', 'fr/terms/']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 }), path).toHaveCount(1);
      await expect(page.locator('main#main'), path).toHaveCount(1);
      // The nav label is itself translated, so assert on the landmark, not the wording.
      await expect(page.getByRole('navigation'), path).toHaveCount(1);
    }
  });

  test('answer options carry a text label, not just a picture', async ({ page }) => {
    await page.goto(practiceUrl('matrix', OPTS));
    await waitForQuiz(page);

    const options = page.getByTestId('options').locator('button');
    const count = await options.count();
    for (let i = 0; i < count; i++) {
      const label = await options.nth(i).getAttribute('aria-label');
      expect(label, `option ${i} has no accessible name`).toBeTruthy();
      expect(label).toMatch(new RegExp(`^Option ${i + 1}:`));
    }
  });

  test('the option group is labelled', async ({ page }) => {
    await page.goto(practiceUrl('matrix', OPTS));
    await waitForQuiz(page);
    await expect(page.getByRole('group', { name: 'Answer options' })).toBeVisible();
  });

  test('matrix cells are described individually', async ({ page }) => {
    await page.goto(practiceUrl('matrix', OPTS));
    await waitForQuiz(page);

    const described = page.locator('.matrix-cell svg[role="img"]');
    await expect(described).toHaveCount(8);
    const first = await described.first().getAttribute('aria-label');
    expect(first).toMatch(/^Cell 1:/);
  });

  test('the text input has a label even though it is visually hidden', async ({ page }) => {
    await page.goto(practiceUrl('span', OPTS));
    await waitForQuiz(page);
    await expect(page.getByLabel('Your answer')).toBeAttached();
  });

  test('the span input is disabled before and while the sequence plays', async ({ page }) => {
    await page.goto(practiceUrl('span', OPTS));
    await waitForQuiz(page);
    await expect(page.getByTestId('span-input')).toBeDisabled();
    await expect(page.getByTestId('submit-text')).toBeDisabled();
    await startSpanIfGated(page);
    await expect(page.getByTestId('span-input')).toBeDisabled();
    await expect(page.getByTestId('submit-text')).toBeDisabled();
  });
});

test.describe('static prose pages', () => {
  /** Headings must descend without skipping a level, or the outline is unusable. */
  test('the terms page has a clean heading order', async ({ page }) => {
    for (const locale of ['en', 'fr']) {
      await page.goto(`${locale}/terms/`);
      const levels = await page
        .locator('main h1, main h2, main h3')
        .evaluateAll((els) => els.map((e) => Number(e.tagName.slice(1))));

      expect(levels[0], locale).toBe(1);
      expect(levels.filter((l) => l === 1), locale).toHaveLength(1);
      for (let i = 1; i < levels.length; i++) {
        expect(levels[i]! - levels[i - 1]!, `${locale}: jump at heading ${i}`).toBeLessThanOrEqual(1);
      }
    }
  });
});

test.describe('layout', () => {
  /** A page that scrolls sideways on a phone is broken, whatever it looks like. */
  test('nothing forces horizontal scrolling on a narrow viewport', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    for (const path of ['./', 'en/', 'en/practice/', 'en/test/', 'en/progress/', 'en/about/', 'en/terms/', 'fr/terms/', 'en/practice/matrix/', 'fr/practice/matrix/']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${path} scrolls horizontally by ${overflow}px`).toBeLessThanOrEqual(1);
    }
  });

  test('the quiz is usable on a narrow viewport', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto(practiceUrl('matrix', OPTS));
    await waitForQuiz(page);

    const item = expectedItem('matrix', OPTS.seed, 0, OPTS.difficulty);
    await expect(page.getByTestId(`option-${item.answerIndex}`)).toBeVisible();
    await page.getByTestId(`option-${item.answerIndex}`).click();
    await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', 'true');
  });

  test('the site renders in dark mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('en/');
    // The dark palette is near-black; the light one is near-white. Read as painted sRGB
    // rather than as a string, because the palette is authored in OKLCH.
    const { r, g, b } = await paintedColour(page, 'body');
    expect(r + g + b).toBeLessThan(200);
  });

  test('the site renders in light mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('en/');
    const { r, g, b } = await paintedColour(page, 'body');
    expect(r + g + b).toBeGreaterThan(600);
  });
});
