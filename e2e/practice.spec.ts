import { expect, test } from '@playwright/test';
import {
  answerCorrectly,
  answerIncorrectly,
  expectedItem,
  practiceUrl,
  waitForQuiz,
  type DrillOptions,
} from './helpers';

const OPTS: DrillOptions = { seed: 'E2ETEST1', difficulty: 3, length: 3 };

test.describe('practice drill', () => {
  test('renders the item the generator produced for the pinned seed', async ({ page }) => {
    await page.goto(practiceUrl('matrix', OPTS));
    await waitForQuiz(page);

    const expectedFirst = expectedItem('matrix', OPTS.seed, 0, OPTS.difficulty);

    await expect(page.getByTestId('quiz')).toHaveAttribute('data-item-type', 'matrix');
    await expect(page.getByTestId('quiz')).toHaveAttribute('data-difficulty', String(OPTS.difficulty));
    await expect(page.getByTestId('prompt')).toHaveText(expectedFirst.prompt);
    await expect(page.getByTestId('options').locator('button')).toHaveCount(
      expectedFirst.options.length,
    );

    // The matrix shows eight figures and one blank cell.
    await expect(page.locator('[data-stimulus="matrix"] .matrix-cell')).toHaveCount(9);
    await expect(page.locator('.matrix-cell[data-blank="true"]')).toHaveCount(1);
  });

  test('a correct answer is confirmed and explained', async ({ page }) => {
    await page.goto(practiceUrl('matrix', OPTS));
    await waitForQuiz(page);

    await answerCorrectly(page, 'matrix', OPTS, 0);

    const feedback = page.getByTestId('feedback');
    await expect(feedback).toBeVisible();
    await expect(feedback).toHaveAttribute('data-correct', 'true');
    await expect(page.getByTestId('verdict')).toHaveText('Correct');

    // The explanation must actually state the rules, not just say "correct".
    const rules = feedback.locator('ul li');
    await expect(rules.first()).toBeVisible();
    expect(await rules.count()).toBeGreaterThan(0);
  });

  test('a wrong answer marks both what was picked and what was right', async ({ page }) => {
    await page.goto(practiceUrl('matrix', OPTS));
    await waitForQuiz(page);

    const item = expectedItem('matrix', OPTS.seed, 0, OPTS.difficulty);
    const wrongIndex = item.answerIndex === 0 ? 1 : 0;
    await answerIncorrectly(page, 'matrix', OPTS, 0);

    await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', 'false');
    await expect(page.getByTestId('verdict')).toHaveText('Not quite');
    await expect(page.getByTestId(`option-${item.answerIndex}`)).toHaveAttribute('data-state', 'correct');
    await expect(page.getByTestId(`option-${wrongIndex}`)).toHaveAttribute('data-state', 'wrong');
  });

  test('options are locked once answered, so an answer cannot be changed', async ({ page }) => {
    await page.goto(practiceUrl('matrix', OPTS));
    await waitForQuiz(page);

    await answerIncorrectly(page, 'matrix', OPTS, 0);
    await expect(page.getByTestId('option-0')).toBeDisabled();
    await expect(page.getByTestId('option-1')).toBeDisabled();
  });

  test('progresses through every item and shows a result summary', async ({ page }) => {
    await page.goto(practiceUrl('matrix', OPTS));
    await waitForQuiz(page);

    for (let i = 0; i < OPTS.length; i++) {
      await expect(page.getByTestId('progress-label')).toHaveText(`${i + 1} of ${OPTS.length}`);
      await answerCorrectly(page, 'matrix', OPTS, i);
      await page.getByTestId('next').click();
    }

    const results = page.getByTestId('results');
    await expect(results).toBeVisible();
    await expect(page.getByTestId('stat-correct')).toContainText(`${OPTS.length} / ${OPTS.length}`);
    await expect(page.getByTestId('stat-accuracy')).toContainText('100%');
    await expect(page.getByTestId('stat-seed')).toContainText(OPTS.seed);
    await expect(page.getByTestId('result-row-matrix')).toBeVisible();
  });

  test('scores a mixed run accurately', async ({ page }) => {
    await page.goto(practiceUrl('matrix', OPTS));
    await waitForQuiz(page);

    await answerCorrectly(page, 'matrix', OPTS, 0);
    await page.getByTestId('next').click();
    await answerIncorrectly(page, 'matrix', OPTS, 1);
    await page.getByTestId('next').click();
    await answerCorrectly(page, 'matrix', OPTS, 2);
    await page.getByTestId('next').click();

    await expect(page.getByTestId('stat-correct')).toContainText('2 / 3');
    await expect(page.getByTestId('stat-accuracy')).toContainText('67%');
  });

  test('the results page refuses to report an IQ', async ({ page }) => {
    await page.goto(practiceUrl('matrix', { ...OPTS, length: 1 }));
    await waitForQuiz(page);
    await answerCorrectly(page, 'matrix', { ...OPTS, length: 1 }, 0);
    await page.getByTestId('next').click();

    const results = page.getByTestId('results');
    await expect(results).toContainText('not an IQ');
    await expect(results).not.toContainText(/IQ\s*[:=]?\s*\d/);
  });

  test('a shared seed link reproduces exactly the same items', async ({ page, context }) => {
    await page.goto(practiceUrl('matrix', OPTS));
    await waitForQuiz(page);
    const firstPrompt = await page.getByTestId('prompt').textContent();
    const firstOptions = await page.locator('[data-testid="options"] svg[data-figure]').evaluateAll(
      (els) => els.map((e) => e.outerHTML),
    );

    const second = await context.newPage();
    await second.goto(practiceUrl('matrix', OPTS));
    await waitForQuiz(second);
    const secondPrompt = await second.getByTestId('prompt').textContent();
    const secondOptions = await second.locator('[data-testid="options"] svg[data-figure]').evaluateAll(
      (els) => els.map((e) => e.outerHTML),
    );

    expect(secondPrompt).toBe(firstPrompt);
    expect(secondOptions).toEqual(firstOptions);
    expect(firstOptions.length).toBeGreaterThan(0);
    await second.close();
  });

  test('a different seed produces different items', async ({ page }) => {
    await page.goto(practiceUrl('matrix', OPTS));
    await waitForQuiz(page);
    const a = await page.locator('[data-stimulus="matrix"]').innerHTML();

    await page.goto(practiceUrl('matrix', { ...OPTS, seed: 'DIFFERNT' }));
    await waitForQuiz(page);
    const b = await page.locator('[data-stimulus="matrix"]').innerHTML();

    expect(b).not.toBe(a);
  });
});
