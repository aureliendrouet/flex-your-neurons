import { expect, test } from '@playwright/test';
import { ALL_META, getItemText } from '../src/lib/generators';
import {
  answerCorrectly,
  answerIncorrectly,
  expectedItem,
  practiceUrl,
  waitForQuiz,
  type DrillOptions,
} from './helpers';
import type { ItemTypeId } from '../src/lib/types';

const OPTS: DrillOptions = { seed: 'ALLTYPES', difficulty: 3, length: 1 };

/**
 * Every item type gets the same three assertions: it renders, a correct answer is scored
 * correct, and a wrong answer is scored wrong. Running them per type — rather than only
 * on matrices — is what catches a renderer that silently drops a stimulus variant.
 */
for (const meta of ALL_META) {
  test.describe(`item type: ${meta.id}`, () => {
    test('renders the stimulus and a way to respond', async ({ page }) => {
      await page.goto(practiceUrl(meta.id, OPTS));
      await waitForQuiz(page);

      const item = expectedItem(meta.id, OPTS.seed, 0, OPTS.difficulty);
      await expect(page.getByTestId('quiz')).toHaveAttribute('data-item-type', meta.id);
      await expect(page.getByTestId('prompt')).toHaveText(item.prompt);
      await expect(page.getByTestId('item-type-label')).toContainText(getItemText(meta.id, 'en').name);

      if (item.stimulus.kind !== 'none') {
        await expect(page.locator(`[data-stimulus="${item.stimulus.kind}"]`)).toBeVisible();
      }

      if (item.responseMode === 'text') {
        await expect(page.getByTestId('text-response')).toBeVisible();
        await expect(page.getByTestId('span-input')).toBeEnabled({ timeout: 20_000 });
      } else {
        await expect(page.getByTestId('options').locator('button')).toHaveCount(item.options.length);
      }
    });

    test('scores a correct answer as correct', async ({ page }) => {
      await page.goto(practiceUrl(meta.id, OPTS));
      await waitForQuiz(page);
      await answerCorrectly(page, meta.id, OPTS, 0);
      await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', 'true');
    });

    test('scores a wrong answer as wrong and explains it', async ({ page }) => {
      await page.goto(practiceUrl(meta.id, OPTS));
      await waitForQuiz(page);
      await answerIncorrectly(page, meta.id, OPTS, 0);

      const feedback = page.getByTestId('feedback');
      await expect(feedback).toHaveAttribute('data-correct', 'false');
      await expect(feedback.locator('ul li').first()).toBeVisible();
    });
  });
}

test.describe('format-specific rendering', () => {
  test('matrix draws eight figures and one blank cell', async ({ page }) => {
    await page.goto(practiceUrl('matrix', OPTS));
    await waitForQuiz(page);
    await expect(page.locator('.matrix-cell')).toHaveCount(9);
    await expect(page.locator('.matrix-cell[data-blank="false"] svg[data-figure]')).toHaveCount(8);
    await expect(page.locator('.matrix-cell[data-blank="true"]')).toHaveCount(1);
  });

  test('number series shows the visible terms and a blank', async ({ page }) => {
    await page.goto(practiceUrl('series-number', OPTS));
    await waitForQuiz(page);

    const item = expectedItem('series-number', OPTS.seed, 0, OPTS.difficulty);
    if (item.stimulus.kind !== 'sequence') throw new Error('unexpected stimulus');
    const shown = item.stimulus.terms.filter((t) => t !== null) as string[];

    const terms = page.locator('[data-stimulus="sequence"] > span');
    await expect(terms).toHaveCount(item.stimulus.terms.length);
    for (const value of shown) {
      await expect(page.locator(`[data-stimulus="sequence"] [data-term="${value}"]`)).toBeVisible();
    }
    await expect(page.locator('[data-stimulus="sequence"] [data-term="?"]')).toHaveCount(1);
  });

  test('syllogism shows exactly two premises and five conclusions', async ({ page }) => {
    await page.goto(practiceUrl('syllogism', OPTS));
    await waitForQuiz(page);
    await expect(page.locator('[data-stimulus="text"] li')).toHaveCount(2);
    await expect(page.getByTestId('options').locator('button')).toHaveCount(5);
    // Invented category names keep world knowledge out of it.
    await expect(page.locator('[data-premise="0"]')).toContainText(/All|No|Some/);
  });

  /**
   * The diagram has to show one frame per fold plus the punched result, and each fold
   * frame has to carry all three cues: the crease, the half that moves, and the direction
   * it travels. Without them the item measures "guess what the examiner meant" rather
   * than spatial visualisation.
   */
  test('paper folding shows every fold as its own step', async ({ page }) => {
    await page.goto(practiceUrl('paper-folding', OPTS));
    await waitForQuiz(page);

    const item = expectedItem('paper-folding', OPTS.seed, 0, OPTS.difficulty);
    if (item.stimulus.kind !== 'paper-folding') throw new Error('unexpected stimulus');
    const foldCount = item.stimulus.folds.length;

    // One frame per fold, plus the final punched sheet.
    await expect(page.locator('[data-stimulus="paper-folding"] svg[data-grid]')).toHaveCount(
      foldCount + 1,
    );
    await expect(page.locator('[data-fold]')).toHaveCount(foldCount);

    // Every fold frame marks the crease and the half that swings over.
    await expect(page.locator('[data-fold-line]')).toHaveCount(foldCount);
    await expect(page.locator('[data-moving-half]')).toHaveCount(foldCount);

    // Frames are tagged with the fold they depict, in order.
    const framed = await page
      .locator('[data-stimulus="paper-folding"] svg[data-fold-frame]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-fold-frame')));
    expect(framed).toEqual([...item.stimulus.folds, 'punched']);
  });

  test('paper folding halves the sheet at every fold', async ({ page }) => {
    await page.goto(practiceUrl('paper-folding', OPTS));
    await waitForQuiz(page);

    const item = expectedItem('paper-folding', OPTS.seed, 0, OPTS.difficulty);
    if (item.stimulus.kind !== 'paper-folding') throw new Error('unexpected stimulus');

    const sizes = await page
      .locator('[data-stimulus="paper-folding"] svg[data-fold-frame]')
      .evaluateAll((els) =>
        els.map((e) => ({
          rows: Number(e.getAttribute('data-rows')),
          cols: Number(e.getAttribute('data-cols')),
        })),
      );

    // The first frame is the whole sheet; each subsequent frame is half the area.
    expect(sizes[0]).toEqual({ rows: item.stimulus.size, cols: item.stimulus.size });
    for (let i = 1; i < sizes.length; i++) {
      const before = sizes[i - 1]!;
      const after = sizes[i]!;
      expect(after.rows * after.cols, `frame ${i}`).toBe((before.rows * before.cols) / 2);
    }

    // The final frame shows exactly the punches that were made.
    await expect(page.locator('[data-stimulus="paper-folding"] [data-hole]')).toHaveCount(
      item.stimulus.punches.length,
    );
  });

  test('mental rotation shows a target and five candidate shapes', async ({ page }) => {
    await page.goto(practiceUrl('rotation', OPTS));
    await waitForQuiz(page);
    await expect(page.locator('[data-stimulus="grid"] svg[data-grid]')).toHaveCount(1);
    await expect(page.getByTestId('options').locator('svg[data-grid]')).toHaveCount(5);
  });

  test('symbol search shows targets and a search group', async ({ page }) => {
    await page.goto(practiceUrl('symbol-search', OPTS));
    await waitForQuiz(page);
    await expect(page.locator('[data-symbol-row="targets"]')).toBeVisible();
    await expect(page.locator('[data-symbol-row="search"]')).toBeVisible();
    await expect(page.getByTestId('options').locator('button')).toHaveCount(2);
  });

  test('odd one out presents the figures as the options themselves', async ({ page }) => {
    await page.goto(practiceUrl('odd-one-out', OPTS));
    await waitForQuiz(page);

    const item = expectedItem('odd-one-out', OPTS.seed, 0, OPTS.difficulty);
    await expect(page.getByTestId('options').locator('svg[data-figure]')).toHaveCount(
      item.options.length,
    );
  });

  /**
   * The span task must actually hide the sequence before asking for it back. If the digits
   * stayed on screen it would be a reading task, not a memory one.
   */
  test('digit span hides the sequence before accepting an answer', async ({ page }) => {
    await page.goto(practiceUrl('span', OPTS));
    await waitForQuiz(page);

    const item = expectedItem('span', OPTS.seed, 0, OPTS.difficulty);
    if (item.stimulus.kind !== 'span') throw new Error('unexpected stimulus');

    // The input is locked while the sequence plays.
    await expect(page.getByTestId('span-input')).toBeDisabled();

    const player = page.locator('[data-stimulus="span"]');
    await expect(player).toHaveAttribute('data-span-finished', 'true', { timeout: 25_000 });
    await expect(page.locator('[data-span-prompt]')).toBeVisible();

    // No element of the sequence is still on screen.
    for (const element of new Set(item.stimulus.sequence)) {
      await expect(page.locator(`[data-span-element="${element}"]`)).toHaveCount(0);
    }
    await expect(page.getByTestId('span-input')).toBeEnabled();
  });

  test('digit span accepts an answer typed with spaces', async ({ page }) => {
    await page.goto(practiceUrl('span', OPTS));
    await waitForQuiz(page);

    const item = expectedItem('span', OPTS.seed, 0, OPTS.difficulty);
    const input = page.getByTestId('span-input');
    await expect(input).toBeEnabled({ timeout: 25_000 });
    await input.fill(item.answerText!.split('').join(' '));
    await page.getByTestId('submit-text').click();

    await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', 'true');
  });
});

test.describe('difficulty', () => {
  test('the requested level is honoured and shown', async ({ page }) => {
    for (const difficulty of [1, 5] as const) {
      await page.goto(practiceUrl('matrix', { ...OPTS, difficulty }));
      await waitForQuiz(page);
      await expect(page.getByTestId('quiz')).toHaveAttribute('data-difficulty', String(difficulty));
      await expect(page.getByTestId('difficulty-label')).toContainText(`Level ${difficulty}`);
    }
  });

  test('harder levels put more elements in each matrix cell', async ({ page }) => {
    const countShapes = async (difficulty: 1 | 5) => {
      await page.goto(practiceUrl('matrix', { ...OPTS, difficulty }));
      await waitForQuiz(page);
      return page.locator('.matrix-cell[data-blank="false"] svg[data-figure] [data-shape]').count();
    };
    expect(await countShapes(5)).toBeGreaterThan(await countShapes(1));
  });
});

test.describe('all types in one place', () => {
  test('every type is listed on the practice index', async ({ page }) => {
    await page.goto('en/practice/');
    for (const meta of ALL_META) {
      await expect(page.getByTestId(`practice-card-${meta.id}`), meta.id).toBeVisible();
    }
    await expect(page.locator('[data-testid^="practice-card-"]')).toHaveCount(ALL_META.length);
  });

  test('every type appears in the progress table', async ({ page }) => {
    await page.goto('en/progress/');
    for (const meta of ALL_META) {
      await expect(page.getByTestId(`type-row-${meta.id as ItemTypeId}`), meta.id).toBeVisible();
    }
  });
});
