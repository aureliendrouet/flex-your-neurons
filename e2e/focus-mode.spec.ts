import { expect, test } from '@playwright/test';
import {
  answerCorrectly,
  expectedItem,
  practiceUrl,
  startSpanIfGated,
  waitForQuiz,
  type DrillOptions,
} from './helpers';

const OPTS: DrillOptions = { seed: 'FOCUSMOD', difficulty: 2, length: 3 };

test.describe('the interface gets out of the way', () => {
  test('chrome recedes while an item is live and returns on reveal', async ({ page }) => {
    await page.goto(practiceUrl('matrix', OPTS));
    await waitForQuiz(page);

    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-focus', '');

    /*
     * Park the pointer over the item before reading the chrome, because otherwise this test
     * depends on where the harness happens to leave it.
     *
     * The header occupies the top-left corner — its box starts at exactly (0, 0) — and the
     * virtual pointer starts there too, so on any runner that treats the origin as hovered the
     * `:hover` rule below holds the navigation at full strength and the recede never shows.
     * That is what made this pass on macOS and fail on every CI run: the same page, the same
     * CSS, a different default pointer. `hover()` makes the pointer position part of the test
     * rather than part of the environment. The pointer is first put *on* the corner rather than
     * left there implicitly, so the worst case is reproduced on every platform instead of only on
     * the ones whose default happens to hit it.
     */
    await page.mouse.move(0, 0);
    await page.getByTestId('quiz').hover();

    // Polled, not read once: the dim is a 420ms transition that starts when the island's
    // effect sets the flag, so an immediate read can legitimately catch it still near 1.
    await expect
      .poll(() => page.locator('.nav').evaluate((el) => Number(getComputedStyle(el).opacity)))
      .toBeLessThan(0.6);

    await answerCorrectly(page, 'matrix', OPTS, 0);

    // The moment measurement stops, the interface comes back.
    await expect(html).not.toHaveAttribute('data-focus', '');
    await expect
      .poll(() => page.locator('.nav').evaluate((el) => Number(getComputedStyle(el).opacity)))
      .toBe(1);
  });

  test('focus mode ends for good once the session is finished', async ({ page }) => {
    const opts: DrillOptions = { ...OPTS, length: 1 };
    await page.goto(practiceUrl('matrix', opts));
    await waitForQuiz(page);
    await answerCorrectly(page, 'matrix', opts, 0);
    await page.getByTestId('next').click();

    await expect(page.getByTestId('results')).toBeVisible();
    await expect(page.locator('html')).not.toHaveAttribute('data-focus', '');
  });

  /**
   * Receding must be a courtesy, never a trap: someone who wants to leave mid-drill has to
   * be able to, and a keyboard user tabbing into the navigation must not land in something
   * half-faded.
   */
  test('every control stays operable and comes back when reached for', async ({ page }) => {
    await page.goto(practiceUrl('matrix', OPTS));
    await waitForQuiz(page);

    await page.locator('.site-header').hover();
    await expect
      .poll(() => page.locator('.nav').evaluate((el) => Number(getComputedStyle(el).opacity)))
      .toBe(1);

    await page.getByTestId('nav-about').click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('What this measures');
    // Leaving the quiz page clears the flag with it.
    await expect(page.locator('html')).not.toHaveAttribute('data-focus', '');
  });

  test('pages with no live item are never in focus mode', async ({ page }) => {
    for (const path of ['en/', 'en/practice/', 'en/about/', 'en/progress/']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('html'), path).not.toHaveAttribute('data-focus', '');
    }
  });
});

test.describe('speeded formats carry no motion', () => {
  /**
   * Not a matter of taste. On a task scored by response time, an animation near the stimulus
   * competes for attention during the exact interval being measured, so it is a confound.
   */
  test('symbol search is marked as speeded and animates nothing', async ({ page }) => {
    await page.goto(practiceUrl('symbol-search', OPTS));
    await waitForQuiz(page);

    await expect(page.getByTestId('quiz')).toHaveAttribute('data-speeded', 'true');
    await expect(page.locator('html')).toHaveAttribute('data-speeded', '');

    const motion = await page.evaluate(() => {
      const read = (selector: string) => {
        const el = document.querySelector(selector);
        if (!el) return null;
        const style = getComputedStyle(el);
        return { transition: style.transitionDuration, animation: style.animationName };
      };
      return {
        meter: read('.meter > span'),
        option: read('.option'),
        wordmark: read('.wordmark-text'),
        header: read('.site-header'),
      };
    });

    expect(motion.meter?.transition).toBe('0s');
    expect(motion.option?.transition).toBe('0s');
    expect(motion.header?.transition).toBe('0s');
    // The wordmark's one-shot shimmer is decoration, so on a speeded format it does not run.
    expect(motion.wordmark?.animation).toBe('none');
  });

  test('the feedback panel does not animate on a speeded format', async ({ page }) => {
    await page.goto(practiceUrl('symbol-search', OPTS));
    await waitForQuiz(page);

    const item = expectedItem('symbol-search', OPTS.seed, 0, OPTS.difficulty);
    await page.getByTestId(`option-${item.answerIndex}`).click();

    const animation = await page
      .getByTestId('feedback')
      .evaluate((el) => getComputedStyle(el).animationName);
    expect(animation).toBe('none');
  });

  /**
   * Digit span is speeded for the purposes of decoration, but its own playback is untouched:
   * that animation *is* the construct. Take it away and the task measures reading, not memory.
   */
  test('digit span keeps its playback while losing the decoration', async ({ page }) => {
    await page.goto(practiceUrl('span', OPTS));
    await waitForQuiz(page);

    await expect(page.getByTestId('quiz')).toHaveAttribute('data-speeded', 'true');
    await expect(page.locator('[data-stimulus="span"]')).toBeVisible();

    // The sequence still plays and still finishes, i.e. it was not neutralised.
    await startSpanIfGated(page);
    await expect(page.locator('[data-span-finished="true"]')).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId('span-input')).toBeEnabled();
  });

  test('an unhurried format is not marked as speeded', async ({ page }) => {
    await page.goto(practiceUrl('matrix', OPTS));
    await waitForQuiz(page);
    await expect(page.getByTestId('quiz')).toHaveAttribute('data-speeded', 'false');
    await expect(page.locator('html')).not.toHaveAttribute('data-speeded', '');
  });
});

test.describe('no countdown anywhere', () => {
  /**
   * A standing guarantee rather than a change. `suggestedSeconds` exists on every item and is
   * deliberately never rendered: a ticking digit beside a reasoning task is an anxiety
   * generator, and on a speeded format it is an active confound. This test is here so that
   * "there is no countdown timer anywhere in the app" stays true by construction.
   */
  test('no timer is shown on any format', async ({ page }) => {
    for (const type of ['matrix', 'symbol-search', 'span'] as const) {
      await page.goto(practiceUrl(type, OPTS));
      await waitForQuiz(page);
      const text = await page.getByTestId('quiz').innerText();
      // No "12s", "0:09" or "seconds left" style readout.
      expect(text, `${type} shows something timer-shaped`).not.toMatch(
        /\b\d+\s*(s|sec|secs|seconds)\s*(left|remaining)?\b|\b\d:\d{2}\b/i,
      );
    }
  });
});
