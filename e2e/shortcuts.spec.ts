import { expect, test } from '@playwright/test';
import { expectedItem, practiceUrl, waitForQuiz, type DrillOptions } from './helpers';
import { dict } from '../src/lib/i18n';

const OPTS: DrillOptions = { seed: 'SHORTCUT', difficulty: 2, length: 3 };

test.describe('the keyboard support is discoverable', () => {
  test('? opens the shortcuts sheet and closes it again', async ({ page }) => {
    await page.goto(practiceUrl('matrix', OPTS));
    await waitForQuiz(page);

    await expect(page.getByTestId('shortcut-sheet')).toHaveCount(0);

    await page.keyboard.press('?');
    const sheet = page.getByTestId('shortcut-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText(dict('en').shortcuts.keys.numbers);
    await expect(sheet).toContainText(dict('en').shortcuts.keys.enter);

    await page.keyboard.press('?');
    await expect(sheet).toHaveCount(0);
  });

  test('Escape closes it', async ({ page }) => {
    await page.goto(practiceUrl('matrix', OPTS));
    await waitForQuiz(page);
    await page.keyboard.press('?');
    await expect(page.getByTestId('shortcut-sheet')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('shortcut-sheet')).toHaveCount(0);
  });

  test('a visible control opens it, for readers who never try ?', async ({ page }) => {
    await page.goto(practiceUrl('matrix', OPTS));
    await waitForQuiz(page);
    await page.getByTestId('shortcut-open').click();
    await expect(page.getByTestId('shortcut-sheet')).toBeVisible();
    await page.getByTestId('shortcut-close').click();
    await expect(page.getByTestId('shortcut-sheet')).toHaveCount(0);
  });

  /** It has to name the keys this item actually accepts, not a fixed range. */
  test('the option range matches the item on screen', async ({ page }) => {
    await page.goto(practiceUrl('series-number', OPTS));
    await waitForQuiz(page);
    const item = expectedItem('series-number', OPTS.seed, 0, OPTS.difficulty);

    await page.keyboard.press('?');
    const keys = await page
      .getByTestId('shortcut-sheet')
      .locator('dt kbd')
      .evaluateAll((els) => els.map((el) => el.textContent));
    expect(keys.slice(0, 2)).toEqual(['1', String(item.options.length)]);
  });

  /**
   * The sheet must not eat the shortcut it documents. Opening it and pressing a number key
   * still has to answer the item — otherwise the help is a trap.
   */
  test('opening the sheet does not break the shortcuts', async ({ page }) => {
    await page.goto(practiceUrl('matrix', OPTS));
    await waitForQuiz(page);

    await page.keyboard.press('?');
    await expect(page.getByTestId('shortcut-sheet')).toBeVisible();

    const item = expectedItem('matrix', OPTS.seed, 0, OPTS.difficulty);
    await page.keyboard.press(String(item.answerIndex + 1));
    await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', 'true');

    await page.keyboard.press('Enter');
    await expect(page.getByTestId('progress-label')).toHaveText(`2 of ${OPTS.length}`);
  });

  /** A question mark typed into the span answer is a character, not a command. */
  test('? typed into the text input does not open the sheet', async ({ page }) => {
    await page.goto(practiceUrl('span', OPTS));
    await waitForQuiz(page);

    const input = page.getByTestId('span-input');
    await expect(input).toBeEnabled({ timeout: 25_000 });
    await input.click();
    await page.keyboard.type('12?3');

    await expect(input).toHaveValue('12?3');
    await expect(page.getByTestId('shortcut-sheet')).toHaveCount(0);
  });

  test('the option keys are drawn as keys', async ({ page }) => {
    await page.goto(practiceUrl('matrix', OPTS));
    await waitForQuiz(page);
    const cap = await page.locator('.option-key').first().evaluate((el) => {
      const style = getComputedStyle(el);
      return { shadow: style.boxShadow, font: style.fontFamily };
    });
    // The pressable edge, and the mono face that marks it as a key rather than a number.
    expect(cap.shadow).not.toBe('none');
    expect(cap.font.toLowerCase()).toContain('mono');
  });

  test('the sheet is translated', async ({ page }) => {
    await page.goto(practiceUrl('matrix', { ...OPTS, locale: 'fr' }));
    await waitForQuiz(page);
    await page.keyboard.press('?');
    await expect(page.getByTestId('shortcut-sheet')).toContainText(
      dict('fr').shortcuts.keys.numbers,
    );
  });
});

test.describe('the proof is staged, not animated into existence', () => {
  /**
   * The load-bearing property: every panel of the argument is present and readable with no
   * scrolling, no JavaScript and no motion. The scroll-driven reveal is additive.
   */
  test('every step is readable without scrolling or motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('en/about/');

    const proof = page.getByTestId('proof');
    const steps = proof.locator('.proof-step');
    await expect(steps).toHaveCount(4);

    const hidden = await steps.evaluateAll((els) =>
      els.filter((el) => Number(getComputedStyle(el).opacity) < 1).length,
    );
    expect(hidden, 'a step of the argument is not fully visible').toBe(0);

    const p = dict('en').pages.about.proof;
    await expect(proof).toContainText(p.readingAAnswer);
    await expect(proof).toContainText(p.readingBAnswer);
    await expect(proof).toContainText(p.verdict);
  });

  test('it shows the two disagreeing readings of 2, 4, 8', async ({ page }) => {
    await page.goto('en/about/');
    const proof = page.getByTestId('proof');

    const terms = await proof
      .locator('.proof-step--sequence .seq-term')
      .evaluateAll((els) => els.map((el) => el.textContent?.trim()));
    expect(terms).toEqual(['2', '4', '8', '?']);

    // Two readings, two different answers, both marked wrong — the verdict is that neither
    // is defensible, not that one wins.
    await expect(proof.locator('[data-reading]')).toHaveCount(2);
    const answers = await proof
      .locator('[data-reading] .proof-answer')
      .evaluateAll((els) => els.map((el) => el.textContent?.trim()));
    expect(new Set(answers).size).toBe(2);
  });

  test('it is translated', async ({ page }) => {
    await page.goto('fr/about/');
    await expect(page.getByTestId('proof')).toContainText(dict('fr').pages.about.proof.verdict);
    await expect(page.getByTestId('proof')).not.toContainText(
      dict('en').pages.about.proof.verdict,
    );
  });
});
