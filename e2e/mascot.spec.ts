import { expect, test } from '@playwright/test';
import { en, fr } from '../src/lib/i18n';
import { hashSeed } from '../src/lib/rng';
import {
  answerCorrectly,
  answerIncorrectly,
  clearAppStorage,
  expectedItem,
  localePath,
  practiceUrl,
  waitForQuiz,
  type DrillOptions,
} from './helpers';

/**
 * The mascot, and the three promises it has to keep.
 *
 * It is the only purely decorative thing on the site, which is exactly why it is worth testing:
 * decoration is what nobody notices has broken. The assertions below are not about whether it
 * looks nice — that is what `/[lang]/mascot-preview/` is for — but about the three properties
 * that would make it actively harmful if they lapsed.
 *
 * 1. It never appears while something is being measured. Encouragement beside a live item is a
 *    confound, and a cheerful face during a full test is a nudge on the thing under test.
 * 2. It is invisible to assistive technology as a picture and present as text. A cartoon
 *    described aloud costs a screen-reader user time and tells them nothing; its line is real
 *    content and has to be read in order.
 * 3. It says the same thing for the same seed. A run here is reproducible from
 *    `(type, seed, difficulty)`, and a mascot that rerolled its line on replay would be the one
 *    element on the page that broke that.
 */

const OPTS: DrillOptions = { seed: 'MASCOT01', difficulty: 2, length: 2 };

/** The line the component must choose for a seed, derived the same way it derives it. */
function expectedLine(bank: readonly string[], seed: string): string {
  return bank[hashSeed(seed) % bank.length]!;
}

test.describe('the mascot', () => {
  test('greets on the home page and points the way on the practice index', async ({ page }) => {
    await page.goto(localePath('en'));
    const home = page.getByTestId('mascot-home');
    await expect(home).toBeVisible();
    /* No seed on a page with no run, so the bank's first line is the one that must show. */
    await expect(home).toContainText(en.mascot.lines.home[0]!);

    await page.goto(localePath('en', 'practice/'));
    await expect(page.getByTestId('mascot-practice')).toContainText(en.mascot.lines.practice[0]!);
  });

  test('speaks the reader’s language', async ({ page }) => {
    await page.goto(localePath('fr'));
    await expect(page.getByTestId('mascot-home')).toContainText(fr.mascot.lines.home[0]!);
  });

  test('is a picture to the eye and text to a screen reader', async ({ page }) => {
    await page.goto(localePath('en'));
    const figure = page.getByTestId('mascot-home').locator('img');

    /*
     * Both, not either. `alt=""` alone still leaves the image in some accessibility trees as an
     * unnamed graphic, and `aria-hidden` alone is a lint failure waiting to happen on an image
     * that has a name. Together they say: this conveys nothing, skip it.
     */
    await expect(figure).toHaveAttribute('alt', '');
    await expect(figure).toHaveAttribute('aria-hidden', 'true');

    /* The words are not in the picture, so they survive translation, selection and reflow. */
    const bubble = page.getByTestId('mascot-home').locator('.mascot-bubble');
    await expect(bubble).toHaveText(new RegExp(en.mascot.lines.home[0]!.slice(0, 12)));
  });

  test('carries the verdict in its bubble without replacing it', async ({ page }) => {
    await page.goto(practiceUrl('matrix', OPTS));
    await waitForQuiz(page);
    await answerCorrectly(page, 'matrix', OPTS, 0);

    /*
     * The verdict keeps its exact words and its place at the head of the panel. It moved inside
     * the bubble; it did not become the mascot's line, because a reader must not have to infer
     * whether they were right from a mascot's tone.
     */
    const verdict = page.getByTestId('verdict');
    await expect(verdict).toHaveText(en.quiz.correct);
    await expect(page.getByTestId('mascot-correct').locator('.mascot-bubble')).toContainText(
      en.quiz.correct,
    );

    /* And the verdict is stated once, not once by the panel and again by the mascot. */
    await expect(page.getByTestId('feedback').getByText(en.quiz.correct, { exact: true })).toHaveCount(1);
  });

  test('shows the wrong-answer pose without commiserating', async ({ page }) => {
    await page.goto(practiceUrl('matrix', OPTS));
    await waitForQuiz(page);
    await answerIncorrectly(page, 'matrix', OPTS, 0);

    await expect(page.getByTestId('verdict')).toHaveText(en.quiz.notQuite);
    await expect(page.getByTestId('mascot-wrong')).toBeVisible();
    /* The diagnosis still leads the explanation; the mascot hands over to it rather than to itself. */
    await expect(page.getByTestId('mascot-correct')).toHaveCount(0);
  });

  test('says the same thing on a replay of the same seed', async ({ page }) => {
    const read = async () => {
      await page.goto(practiceUrl('matrix', OPTS));
      await waitForQuiz(page);
      await answerCorrectly(page, 'matrix', OPTS, 0);
      return page.getByTestId('mascot-correct').locator('.mascot-bubble').textContent();
    };

    const first = await read();
    const second = await read();
    expect(second).toBe(first);
    /*
     * And it is the line the seed selects, not merely a stable one — a component that always
     * returned the first entry would also pass a bare equality check.
     *
     * The *item's* seed, not the session's. Each item derives its own from the session seed and
     * its position, and the feedback mascot is keyed to the item, so that two items answered the
     * same way inside one run do not repeat the same line back.
     */
    expect(first).toContain(
      expectedLine(en.mascot.lines.correct, expectedItem('matrix', OPTS.seed, 0, OPTS.difficulty).seed),
    );
  });

  test('stays out of the full test entirely', async ({ page }) => {
    await page.goto(localePath('en', 'test/?n=2'));
    await waitForQuiz(page);

    /*
     * The full test withholds feedback until the end, so there is no revealed phase for a mascot
     * to appear in — this asserts that the guard is the *mode*, and does not quietly depend on
     * the reader having instant feedback switched off.
     */
    await expect(page.locator('[data-testid^="mascot-"]')).toHaveCount(0);
    await page.locator('[data-testid^="option-"]').first().click();
    await expect(page.locator('[data-testid^="mascot-"]')).toHaveCount(0);
  });

  test('never appears beside a live item in practice either', async ({ page }) => {
    await page.goto(practiceUrl('matrix', OPTS));
    await waitForQuiz(page);
    await expect(page.locator('[data-testid^="mascot-"]')).toHaveCount(0);
  });

  test('sits in the empty dashboard and leaves once there is data', async ({ page }) => {
    /* `clearAppStorage` runs in the page, so a page has to exist before it can be cleared. */
    await page.goto(localePath('en', 'progress/'));
    await clearAppStorage(page);
    await page.reload();
    await expect(page.getByTestId('mascot-progressEmpty')).toBeVisible();

    /* One finished drill, and the page has something of its own to say. */
    const opts: DrillOptions = { ...OPTS, length: 1 };
    await page.goto(practiceUrl('matrix', opts));
    await waitForQuiz(page);
    await answerCorrectly(page, 'matrix', opts, 0);
    await page.getByTestId('next').click();
    await expect(page.getByTestId('results')).toBeVisible();

    await page.goto(localePath('en', 'progress/'));
    await expect(page.getByTestId('mascot-progressEmpty')).toHaveCount(0);
  });

  test('congratulates the block, not the score', async ({ page }) => {
    const opts: DrillOptions = { ...OPTS, length: 1 };
    await page.goto(practiceUrl('matrix', opts));
    await waitForQuiz(page);
    /*
     * Deliberately wrong. The results mascot appears whatever the score, and says nothing about
     * it — the numbers beneath it are uncalibrated by design, and a drawing that cheered a good
     * one would be making the claim the whole site refuses to make.
     */
    await answerIncorrectly(page, 'matrix', opts, 0);
    await page.getByTestId('next').click();

    const mascot = page.getByTestId('mascot-results');
    await expect(mascot).toBeVisible();
    await expect(mascot).toContainText(expectedLine(en.mascot.lines.results, opts.seed));
  });
});
