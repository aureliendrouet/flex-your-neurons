import { expect, test } from '@playwright/test';
import { expectedItem, practiceUrl, waitForQuiz, type DrillOptions } from './helpers';
import { dict } from '../src/lib/i18n';
import type { ErrorType } from '../src/lib/types';

const OPTS: DrillOptions = { seed: 'DIAGNOS1', difficulty: 3, length: 3 };

/**
 * Finds a distractor whose diagnosis is a specific named mistake, so the test asserts on
 * the *taxonomy* rather than on "some option that happens to be wrong". Computed in Node
 * from the same generator the browser runs, which is what makes it an end-to-end claim.
 */
function distractorWith(
  errorTypes: ErrorType[],
  answerIndex: number,
): { index: number; errorType: ErrorType } {
  const index = errorTypes.findIndex(
    (e, i) => i !== answerIndex && e !== 'correct' && e !== 'plausible',
  );
  const fallback = errorTypes.findIndex((_, i) => i !== answerIndex);
  const at = index >= 0 ? index : fallback;
  return { index: at, errorType: errorTypes[at]! };
}

test.describe('the mistake is named, not just marked', () => {
  test('a wrong answer is diagnosed by name', async ({ page }) => {
    await page.goto(practiceUrl('matrix', OPTS));
    await waitForQuiz(page);

    const item = expectedItem('matrix', OPTS.seed, 0, OPTS.difficulty);
    const { index, errorType } = distractorWith(item.errorTypes, item.answerIndex);
    await page.getByTestId(`option-${index}`).click();

    const feedback = page.getByTestId('feedback');
    await expect(feedback).toHaveAttribute('data-correct', 'false');
    await expect(feedback).toHaveAttribute('data-error-type', errorType);

    // The name and the explanation of the mistake, in the reader's language.
    const t = dict('en').diagnosis;
    await expect(page.getByTestId('diagnosis-tag')).toHaveText(t.tags[errorType]);
    await expect(page.getByTestId('diagnosis')).toContainText(t.bodies[errorType]);
  });

  /** The diagnosis leads the panel: it is why someone who got it wrong is still reading. */
  test('the diagnosis comes before the rules and the answer', async ({ page }) => {
    await page.goto(practiceUrl('matrix', OPTS));
    await waitForQuiz(page);

    const item = expectedItem('matrix', OPTS.seed, 0, OPTS.difficulty);
    const { index } = distractorWith(item.errorTypes, item.answerIndex);
    await page.getByTestId(`option-${index}`).click();

    const order = await page
      .getByTestId('feedback')
      .locator('[data-testid="verdict"], [data-testid="diagnosis"], .feedback-rules, [data-testid="answer-summary"]')
      .evaluateAll((els) =>
        els.map((e) => e.getAttribute('data-testid') ?? e.classList[0] ?? ''),
      );

    expect(order).toEqual(['verdict', 'diagnosis', 'feedback-rules', 'answer-summary']);
  });

  test('a correct answer is not given a diagnosis', async ({ page }) => {
    await page.goto(practiceUrl('matrix', OPTS));
    await waitForQuiz(page);

    const item = expectedItem('matrix', OPTS.seed, 0, OPTS.difficulty);
    await page.getByTestId(`option-${item.answerIndex}`).click();

    await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', 'true');
    await expect(page.getByTestId('diagnosis')).toHaveCount(0);
  });

  /**
   * Once the answer is out, the option grid becomes a map of the ways the item can be
   * misread — every distractor says how it is wrong.
   */
  test('every distractor is tagged once the answer is revealed', async ({ page }) => {
    await page.goto(practiceUrl('matrix', OPTS));
    await waitForQuiz(page);

    // Before answering, no tag exists anywhere: it would be an answer key.
    await expect(page.locator('.option-tag')).toHaveCount(0);

    const item = expectedItem('matrix', OPTS.seed, 0, OPTS.difficulty);
    await page.getByTestId(`option-${item.answerIndex}`).click();

    await expect(page.locator('.option-tag')).toHaveCount(item.options.length - 1);
    await expect(page.getByTestId(`option-${item.answerIndex}`).locator('.option-tag')).toHaveCount(
      0,
    );

    for (let i = 0; i < item.options.length; i++) {
      await expect(page.getByTestId(`option-${i}`)).toHaveAttribute(
        'data-error-type',
        item.errorTypes[i]!,
      );
    }
  });

  test('the diagnosis is translated, not glossed', async ({ page }) => {
    const fr: DrillOptions = { ...OPTS, locale: 'fr' };
    await page.goto(practiceUrl('matrix', fr));
    await waitForQuiz(page);

    const item = expectedItem('matrix', fr.seed, 0, fr.difficulty, 'fr');
    const { index, errorType } = distractorWith(item.errorTypes, item.answerIndex);
    await page.getByTestId(`option-${index}`).click();

    await expect(page.getByTestId('diagnosis-tag')).toHaveText(
      dict('fr').diagnosis.tags[errorType],
    );
    // And genuinely different from the English wording.
    await expect(page.getByTestId('diagnosis-tag')).not.toHaveText(
      dict('en').diagnosis.tags[errorType],
    );
  });
});

test.describe('the session summary names the habit', () => {
  test('repeating one mistake is reported as that mistake', async ({ page }) => {
    const opts: DrillOptions = { seed: 'HABIT001', difficulty: 3, length: 3 };
    await page.goto(practiceUrl('matrix', opts));
    await waitForQuiz(page);

    const picked: ErrorType[] = [];
    for (let i = 0; i < opts.length; i++) {
      const item = expectedItem('matrix', opts.seed, i, opts.difficulty);
      // Always take the first distractor carrying the same named mistake if one exists,
      // so the run has a genuine habit to find.
      const target =
        item.errorTypes.findIndex((e, j) => j !== item.answerIndex && e === picked[0]) >= 0 &&
        picked.length > 0
          ? item.errorTypes.findIndex((e, j) => j !== item.answerIndex && e === picked[0])
          : distractorWith(item.errorTypes, item.answerIndex).index;
      picked.push(item.errorTypes[target]!);
      await page.getByTestId(`option-${target}`).click();
      await page.getByTestId('next').click();
    }

    const mistakes = page.getByTestId('mistakes');
    await expect(mistakes).toBeVisible();
    await expect(mistakes).toHaveAttribute('data-count', String(opts.length));

    // Every mistake made is listed by name, with its count.
    const counts = new Map<ErrorType, number>();
    for (const e of picked) counts.set(e, (counts.get(e) ?? 0) + 1);
    for (const [errorType, count] of counts) {
      const row = mistakes.locator(`li[data-error-type="${errorType}"]`);
      await expect(row).toHaveCount(1);
      await expect(row.locator('.mistakes-count')).toHaveText(String(count));
    }
  });

  test('a clean session says so rather than showing an empty breakdown', async ({ page }) => {
    const opts: DrillOptions = { seed: 'CLEANRUN', difficulty: 2, length: 2 };
    await page.goto(practiceUrl('matrix', opts));
    await waitForQuiz(page);

    for (let i = 0; i < opts.length; i++) {
      const item = expectedItem('matrix', opts.seed, i, opts.difficulty);
      await page.getByTestId(`option-${item.answerIndex}`).click();
      await page.getByTestId('next').click();
    }

    const mistakes = page.getByTestId('mistakes');
    await expect(mistakes).toHaveAttribute('data-count', '0');
    await expect(mistakes).toContainText(dict('en').results.mistakesNone);
  });

  /** The diagnosis has to survive to storage, or the progress page cannot use it. */
  test('the chosen diagnosis is persisted with the response', async ({ page }) => {
    const opts: DrillOptions = { seed: 'PERSIST1', difficulty: 3, length: 1 };
    await page.goto(practiceUrl('matrix', opts));
    await waitForQuiz(page);

    const item = expectedItem('matrix', opts.seed, 0, opts.difficulty);
    const { index, errorType } = distractorWith(item.errorTypes, item.answerIndex);
    await page.getByTestId(`option-${index}`).click();
    await page.getByTestId('next').click();
    await expect(page.getByTestId('results')).toBeVisible();

    const stored = await page.evaluate(() => {
      const raw = localStorage.getItem('iq:v1:sessions');
      return raw ? JSON.parse(raw) : [];
    });
    expect(stored.at(-1).responses[0].errorType).toBe(errorType);
  });
});
