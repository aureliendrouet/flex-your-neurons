/**
 * Block span — the board that plays itself and is then tapped back.
 *
 * Unlike the trail board, the answer here is a secret: the order is shown once and taken away. So
 * these tests compute the sequence in Node from the seed rather than reading it off the page, and
 * two of them check things that are only visible as *absences* — no mark on a tapped block, no
 * verdict during recall. Those are the behaviours that would quietly turn a recall task into a
 * recognition task, and nothing about the page would look broken if they regressed.
 */
import { expect, test } from '@playwright/test';
import { expectedItem, practiceUrl } from './helpers';
import type { Difficulty } from '../src/lib/types';

const SEED = 'BSE2E001';
const url = (d: Difficulty, n = 1) =>
  practiceUrl('block-span', { seed: SEED, difficulty: d, length: n });

/**
 * The order the page will actually light, for the item at a given index.
 *
 * Via `expectedItem` rather than `generateItem`: the app derives a per-item seed from the session
 * seed, so handing the raw seed to the generator produces a different, valid sequence that has
 * nothing to do with what is on screen.
 */
function sequenceFor(difficulty: Difficulty, index = 0): number[] {
  const item = expectedItem('block-span', SEED, index, difficulty);
  if (item.stimulus.kind !== 'block-span') throw new Error('unexpected stimulus');
  return item.stimulus.sequence;
}

/** Block test ids are 1-based, so the sequence indices have to be shifted. */
const blockId = (index: number) => `block-${index + 1}`;

async function playAndWaitForRecall(page: import('@playwright/test').Page) {
  await page.getByTestId('span-start').click();
  await expect(page.getByTestId('block-span-board')).toHaveAttribute(
    'data-block-phase',
    'recall',
    { timeout: 30_000 },
  );
}

test.describe('block span', () => {
  test('waits to be started, then plays the sequence before accepting a tap', async ({ page }) => {
    await page.goto(url(1));
    await expect(page.getByTestId('quiz')).toHaveAttribute('data-hydrated', 'true');

    // The gate is up and the board is inert: nothing has played, so nothing can be answered.
    const board = page.getByTestId('block-span-board');
    await expect(board).toHaveAttribute('data-block-phase', 'gate');
    await expect(page.getByTestId(blockId(0))).toBeDisabled();
    // All nine blocks are on the board from the start — the layout is not a secret, the order is.
    await expect(page.locator('.blocks-block')).toHaveCount(9);

    await page.getByTestId('span-start').click();
    await expect(board).toHaveAttribute('data-block-phase', 'watch');
    // Still inert while it plays: a tap now would be counted against a sequence not yet finished.
    await expect(page.getByTestId(blockId(0))).toBeDisabled();

    await expect(board).toHaveAttribute('data-block-phase', 'recall', { timeout: 30_000 });
    await expect(page.getByTestId(blockId(0))).toBeEnabled();
  });

  test('accepts the sequence in order and scores it correct', async ({ page }) => {
    await page.goto(url(1));
    await expect(page.getByTestId('quiz')).toHaveAttribute('data-hydrated', 'true');
    await playAndWaitForRecall(page);

    const sequence = sequenceFor(1);
    for (const [i, index] of sequence.entries()) {
      // Not finished until the last tap.
      if (i > 0) await expect(page.getByTestId('feedback')).toHaveCount(0);
      await page.getByTestId(blockId(index)).click();
    }

    await expect(page.getByTestId('feedback')).toBeVisible();
    await expect(page.getByTestId('verdict')).toHaveText('Correct');
    // The reveal is the order drawn on the board it happened on.
    await expect(page.locator('.blocks-block[data-block-order]')).toHaveCount(sequence.length);

    await page.getByTestId('next').click();
    const stored = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('iq:v1:sessions') ?? '[]'),
    );
    const response = stored.at(-1).responses.at(-1);
    expect(response.type).toBe('block-span');
    expect(response.correct).toBe(true);
    // No option was chosen, because there were none; the tapped sequence is the response.
    expect(response.chosenIndex).toBeNull();
    expect(response.chosenText).toBe(sequence.map((i: number) => i + 1).join(''));
  });

  /**
   * The absence that matters most.
   *
   * A block never repeats within a sequence, so leaving tapped blocks marked would tell the reader
   * which ones are still available — narrowing the choice at every step, and most at the end, where
   * the memory load is highest. Only the counter may persist.
   */
  test('leaves no trace of which blocks have been tapped', async ({ page }) => {
    await page.goto(url(3));
    await expect(page.getByTestId('quiz')).toHaveAttribute('data-hydrated', 'true');
    await playAndWaitForRecall(page);

    const sequence = sequenceFor(3);
    await page.getByTestId(blockId(sequence[0]!)).click();
    await page.getByTestId(blockId(sequence[1]!)).click();

    await expect(page.getByTestId('block-span-board')).toHaveAttribute('data-block-taps', '2');
    await expect(page.getByTestId('block-span-count')).toContainText('2 of 5');
    // Nothing on the board distinguishes a tapped block from an untapped one.
    await expect(page.locator('.blocks-block[data-block-order]')).toHaveCount(0);
    // And no verdict has been given: being told would make this recognition, not recall.
    await expect(page.getByTestId('feedback')).toHaveCount(0);
  });

  /**
   * Undo leaks nothing, because nothing has been judged. It exists so that a slip of the finger on a
   * phone is not recorded as a memory failure.
   */
  test('lets the last tap be taken back', async ({ page }) => {
    await page.goto(url(2));
    await expect(page.getByTestId('quiz')).toHaveAttribute('data-hydrated', 'true');
    await playAndWaitForRecall(page);

    const board = page.getByTestId('block-span-board');
    const sequence = sequenceFor(2);
    await expect(page.getByTestId('block-span-undo')).toBeDisabled();

    // Tap the wrong block first, take it back, then answer properly.
    const wrong = [0, 1, 2, 3, 4, 5, 6, 7, 8].find((i) => i !== sequence[0])!;
    await page.getByTestId(blockId(wrong)).click();
    await expect(board).toHaveAttribute('data-block-taps', '1');
    await page.getByTestId('block-span-undo').click();
    await expect(board).toHaveAttribute('data-block-taps', '0');

    for (const index of sequence) await page.getByTestId(blockId(index)).click();
    await expect(page.getByTestId('verdict')).toHaveText('Correct');
  });

  /**
   * The diagnosis this format exists to be able to give.
   *
   * Every other format looks its diagnosis up from the distractor that was chosen. A tapped sequence
   * has no distractors, so the name is computed from what the reader did — and "you had the blocks
   * and lost the order" is a different, more useful thing to be told than "wrong".
   */
  test('names a reversed sequence rather than just marking it wrong', async ({ page }) => {
    await page.goto(url(2));
    await expect(page.getByTestId('quiz')).toHaveAttribute('data-hydrated', 'true');
    await playAndWaitForRecall(page);

    for (const index of [...sequenceFor(2)].reverse()) {
      await page.getByTestId(blockId(index)).click();
    }

    await expect(page.getByTestId('verdict')).toHaveText('Not quite');
    await expect(page.getByTestId('diagnosis-tag')).toHaveText('wrong direction');
    // Both paths are drawn on the frozen board: the order that lit, and the order that was tapped.
    await expect(page.locator('[data-block-tapped-path]')).toBeVisible();
  });

  test('reports the order lost when the right blocks come back scrambled', async ({ page }) => {
    await page.goto(url(4));
    await expect(page.getByTestId('quiz')).toHaveAttribute('data-hydrated', 'true');
    await playAndWaitForRecall(page);

    // Swap the first two taps: same blocks, wrong arrangement, and not a reversal.
    const sequence = sequenceFor(4);
    const scrambled = [sequence[1]!, sequence[0]!, ...sequence.slice(2)];
    for (const index of scrambled) await page.getByTestId(blockId(index)).click();

    await expect(page.getByTestId('diagnosis-tag')).toHaveText('order lost');
  });

  /**
   * The response clock starts when the last block goes dark, not when the item painted.
   *
   * Playback is about a second per block and grows with difficulty, so timing from the mount would
   * record "the harder the item, the longer you thought" — a property of the animation rather than
   * of the reader. A level-5 sequence takes roughly seven seconds to play; the latency recorded for
   * a fast answer must be a fraction of that.
   */
  test('does not count the time spent watching as thinking time', async ({ page }) => {
    await page.goto(url(5));
    await expect(page.getByTestId('quiz')).toHaveAttribute('data-hydrated', 'true');

    const startedAt = Date.now();
    await playAndWaitForRecall(page);
    const playbackMs = Date.now() - startedAt;
    // The premise of the test: playback really did take several seconds.
    expect(playbackMs, `playback took ${playbackMs}ms`).toBeGreaterThan(5_000);

    for (const index of sequenceFor(5)) await page.getByTestId(blockId(index)).click();
    await page.getByTestId('next').click();

    const stored = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('iq:v1:sessions') ?? '[]'),
    );
    const response = stored.at(-1).responses.at(-1);
    expect(response.latencyMs).toBeGreaterThan(0);
    expect(
      response.latencyMs,
      `latency ${response.latencyMs}ms against ${playbackMs}ms of playback`,
    ).toBeLessThan(playbackMs);
  });

  /**
   * The whole board has to be on screen while it is playing.
   *
   * Under the drill height lock the answer tray is a scroller, and the board is square — so a
   * width-driven board overflows it and the top row of blocks is cut off. On any other format that
   * is a scroll; here it is a flash the reader never sees, in a task that does not replay, which
   * makes it a silently wrong measurement rather than a layout blemish. It shipped that way in the
   * first version: 512px of board inside a 465px tray on a 1280x720 window.
   *
   * Three heights, because the fix is a hand-tuned budget subtracted from the viewport and the
   * failure is at the short end.
   */
  for (const height of [600, 720, 900]) {
    test(`keeps every block inside the visible tray at ${height}px tall`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height });
      await page.goto(url(5));
      await expect(page.getByTestId('quiz')).toHaveAttribute('data-hydrated', 'true');
      await playAndWaitForRecall(page);

      const overflow = await page.evaluate(() => {
        const tray = document.querySelector('.quiz-answer')!.getBoundingClientRect();
        return [...document.querySelectorAll('.blocks-block')]
          .map((el, i) => {
            const r = el.getBoundingClientRect();
            return { block: i + 1, above: tray.top - r.top, below: r.bottom - tray.bottom };
          })
          .filter((x) => x.above > 0.5 || x.below > 0.5);
      });
      expect(overflow, `blocks outside the tray: ${JSON.stringify(overflow)}`).toEqual([]);
    });
  }

  /** The blocks must be square and separated in real pixels, not only in the generator's unit box. */
  test('draws nine square, non-overlapping blocks', async ({ page }) => {
    await page.goto(url(5));
    await expect(page.getByTestId('quiz')).toHaveAttribute('data-hydrated', 'true');

    const boxes = await page.locator('.blocks-block').evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height };
      }),
    );
    expect(boxes).toHaveLength(9);
    for (const box of boxes) {
      // Square, or the sizing has resolved against two different axes.
      expect(Math.abs(box.w - box.h)).toBeLessThan(2);
      // The full touch-target guideline, which this board has the room for.
      expect(box.w, `block is ${box.w.toFixed(0)}px`).toBeGreaterThanOrEqual(44);
    }
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const gap =
          Math.hypot(boxes[i]!.x - boxes[j]!.x, boxes[i]!.y - boxes[j]!.y) -
          (boxes[i]!.w + boxes[j]!.w) / 2;
        expect(gap, `blocks ${i + 1} and ${j + 1} overlap by ${(-gap).toFixed(1)}px`).toBeGreaterThan(0);
      }
    }
  });
});
