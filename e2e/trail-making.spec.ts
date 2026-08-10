/**
 * The trail board — the site's only item answered by a sequence of clicks rather than one decision.
 *
 * The order is printed on the targets, so there is no answer to protect and these tests may walk the
 * path openly. What they check is the behaviour that makes it a *timed* task rather than an accuracy
 * one: a wrong click is counted and the run carries on, and the item completes only on the last
 * target.
 */
import { expect, test } from '@playwright/test';
import { expectedItem, practiceUrl } from './helpers';
import type { Difficulty } from '../src/lib/types';

const SEED = 'TME2E001';
const url = (d: Difficulty) => practiceUrl('trail-making', { seed: SEED, difficulty: d, length: 1 });

/**
 * The path, in order, for the item the page will actually show.
 *
 * Via `expectedItem` rather than `generateItem` directly, because the app does not hand a session
 * seed straight to the generator — it derives a per-item seed from it. Passing the raw seed here
 * produced a *different, valid* board whose labels simply did not exist on screen.
 */
function labelsFor(difficulty: Difficulty): string[] {
  const item = expectedItem('trail-making', SEED, 0, difficulty);
  if (item.stimulus.kind !== 'trail') throw new Error('unexpected stimulus');
  return item.stimulus.nodes.map((n) => n.label);
}

test.describe('trail making', () => {
  test('draws every target and marks the one to click next', async ({ page }) => {
    await page.goto(url(1));
    await expect(page.getByTestId('quiz')).toHaveAttribute('data-hydrated', 'true');

    const labels = labelsFor(1);
    await expect(page.locator('.trail-node')).toHaveCount(labels.length);
    for (const label of labels) {
      await expect(page.getByTestId(`trail-node-${label}`), label).toBeVisible();
    }
    // The first target is the one marked, and it is named in text rather than only ringed.
    await expect(page.getByTestId('trail-next')).toContainText(labels[0]!);
    await expect(page.getByTestId(`trail-node-${labels[0]}`)).toHaveAttribute('data-trail-state', 'next');
  });

  test('no target overlaps another, in real pixels', async ({ page }) => {
    // The generator guarantees separation in board-width units; this checks it survives layout.
    await page.goto(url(5));
    await expect(page.getByTestId('quiz')).toHaveAttribute('data-hydrated', 'true');
    const boxes = await page.locator('.trail-node').evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height };
      }),
    );
    expect(boxes.length).toBeGreaterThan(1);
    // Square, or the percentage sizing has resolved against two different axes.
    for (const box of boxes) expect(Math.abs(box.w - box.h)).toBeLessThan(2);
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const gap = Math.hypot(boxes[i]!.x - boxes[j]!.x, boxes[i]!.y - boxes[j]!.y) - (boxes[i]!.w + boxes[j]!.w) / 2;
        expect(gap, `targets ${i} and ${j} overlap by ${(-gap).toFixed(1)}px`).toBeGreaterThan(0);
      }
    }
  });

  /**
   * The defining behaviour. The real task lets the examiner say "no, that one" and the participant
   * carries on — the score is the time, which the correction is already inside. Ending the item on a
   * mistake would turn a timed task into a single-shot accuracy task.
   */
  test('counts a wrong click and carries on', async ({ page }) => {
    await page.goto(url(1));
    await expect(page.getByTestId('quiz')).toHaveAttribute('data-hydrated', 'true');
    const labels = labelsFor(1);

    // Click the last target first: wrong, and about as wrong as possible.
    await page.getByTestId(`trail-node-${labels.at(-1)}`).click();
    await expect(page.getByTestId('trail-board')).toHaveAttribute('data-trail-misses', '1');
    await expect(page.getByTestId('trail-misses')).toBeVisible();
    // The run has not ended and the target has not changed.
    await expect(page.getByTestId('feedback')).toHaveCount(0);
    await expect(page.getByTestId('trail-next')).toContainText(labels[0]!);
    await expect(page.getByTestId('trail-board')).toHaveAttribute('data-trail-progress', '0');
  });

  test('completes on the last target and is scored on the run, not an option', async ({ page }) => {
    await page.goto(url(1));
    await expect(page.getByTestId('quiz')).toHaveAttribute('data-hydrated', 'true');
    const labels = labelsFor(1);

    for (const [i, label] of labels.entries()) {
      // Not finished until the last one.
      if (i > 0) await expect(page.getByTestId('feedback')).toHaveCount(0);
      await page.getByTestId(`trail-node-${label}`).click();
    }

    await expect(page.getByTestId('feedback')).toBeVisible();
    // A clean run is scored correct; the copy is explicit that time is the real measure.
    await expect(page.getByTestId('verdict')).toHaveText('Correct');
    // The finished board stays on screen: the shape of the path is the informative part.
    await expect(page.locator('.trail-node[data-trail-state="joined"]')).toHaveCount(labels.length);

    await page.getByTestId('next').click();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('iq:v1:sessions') ?? '[]'));
    const response = stored.at(-1).responses.at(-1);
    expect(response.type).toBe('trail-making');
    expect(response.correct).toBe(true);
    // No option was chosen, because there were none to choose.
    expect(response.chosenIndex).toBeNull();
    expect(response.latencyMs).toBeGreaterThan(0);
  });

  test('a run with a wrong click is not scored clean', async ({ page }) => {
    await page.goto(url(1));
    await expect(page.getByTestId('quiz')).toHaveAttribute('data-hydrated', 'true');
    const labels = labelsFor(1);
    await page.getByTestId(`trail-node-${labels.at(-1)}`).click();
    for (const label of labels) await page.getByTestId(`trail-node-${label}`).click();
    await expect(page.getByTestId('verdict')).toHaveText('Not quite');
  });

  /**
   * The tab order must not walk the path.
   *
   * The board is rendered in a shuffled order for exactly this reason: a DOM order that followed the
   * sequence would hand the whole task to anyone pressing Tab repeatedly.
   */
  test('does not lay the answer out in tab order', async ({ page }) => {
    await page.goto(url(3));
    await expect(page.getByTestId('quiz')).toHaveAttribute('data-hydrated', 'true');
    const domOrder = await page.locator('.trail-node').allTextContents();
    expect(domOrder).not.toEqual(labelsFor(3));
  });
  /*
   * Not covered here: the switch-cost read-out end to end.
   *
   * An attempt to play ten boards and read the contrast off the progress page kept desynchronising —
   * the loop has to know each board's path in advance, which means predicting the item index the
   * runner is on, and that prediction and the page drifted apart in ways that had nothing to do with
   * the measurement. What it would have checked is covered instead by `tests/sprints.test.ts`, which
   * asserts the contrast, its threshold, and that it re-derives form from the seed; the board's own
   * behaviour is covered above; and the identical architecture — a contrast rebuilt from regenerated
   * items rather than a stored field — is verified end to end for the interference score in
   * `interference.spec.ts`. Recorded rather than left as an unexplained gap.
   */
});
