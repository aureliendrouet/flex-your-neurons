import { expect, test } from '@playwright/test';
import { ALL_META, getItemText } from '../src/lib/generators';
import {
  answerCorrectly,
  answerIncorrectly,
  expectedItem,
  practiceUrl,
  startSpanIfGated,
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
        await startSpanIfGated(page);
        await expect(page.getByTestId('span-input')).toBeEnabled({ timeout: 20_000 });
      } else if (item.responseMode === 'fill') {
        // One input per blank, and the board says how many it is waiting for.
        const blanks = item.answerText!.split(',').length;
        await expect(page.getByTestId('pyramid-board')).toHaveAttribute(
          'data-pyramid-blanks',
          String(blanks),
        );
        await expect(page.locator('[data-testid^="pyramid-input-"]')).toHaveCount(blanks);
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

  test('figure weights draws its premises and one pan to fill', async ({ page }) => {
    await page.goto(practiceUrl('figure-weights', { ...OPTS, difficulty: 5 }));
    await waitForQuiz(page);

    const item = expectedItem('figure-weights', OPTS.seed, 0, 5);
    if (item.stimulus.kind !== 'figure-weights') throw new Error('unexpected stimulus');

    // One scale per premise, plus the target scale.
    await expect(page.locator('[data-weights-scale]')).toHaveCount(
      item.stimulus.premises.length + 1,
    );
    // Exactly one pan is blank, and it is a right-hand pan.
    await expect(page.locator('[data-weights-pan][data-blank="true"]')).toHaveCount(1);
    await expect(page.locator('[data-weights-pan="right"][data-blank="true"]')).toHaveCount(1);
    // Every premise scale is complete: a blank there would make the item unsolvable.
    await expect(page.locator('[data-weights-pan="left"][data-blank="true"]')).toHaveCount(0);

    await expect(page.getByTestId('options').locator('svg[data-figure]')).toHaveCount(
      item.options.length,
    );
  });

  /**
   * N-back is the first choice-response format with a transient stimulus, so it is the first
   * that could be answered before it has been seen. Both routes in are checked: clicking an
   * option, and the number-key shortcut — the latter matters more, because it bypasses the
   * button's own `disabled` and would also record a latency measured from the wrong moment.
   */
  test('n-back locks its options until the stream has played', async ({ page }) => {
    await page.goto(practiceUrl('n-back', OPTS));
    await waitForQuiz(page);

    const stream = page.locator('[data-stimulus="n-back"]');
    const firstOption = page.getByTestId('option-0');

    await expect(stream).toHaveAttribute('data-span-started', 'false');
    await expect(firstOption).toBeDisabled();

    await page.getByTestId('span-start').click();
    await expect(stream).toHaveAttribute('data-span-started', 'true');
    await expect(firstOption).toBeDisabled();

    // The keyboard route must be shut too, not just the button.
    await page.keyboard.press('1');
    await expect(page.getByTestId('feedback')).toHaveCount(0);

    await expect(stream).toHaveAttribute('data-span-finished', 'true', { timeout: 30_000 });
    await expect(firstOption).toBeEnabled();

    // And now the same keypress does answer.
    await page.keyboard.press('1');
    await expect(page.getByTestId('feedback')).toBeVisible();
  });

  /**
   * Coding is only a speed task if the key has to be read. Two ways it could stop being
   * one, both checked here: the probed column being visually marked (then the answer is
   * "the highlighted one"), and the options containing symbols from outside the key (then
   * the answer is reachable by elimination without reading the pairing at all).
   */
  test('digit-symbol coding shows a key that has to actually be read', async ({ page }) => {
    await page.goto(practiceUrl('coding', { ...OPTS, difficulty: 5 }));
    await waitForQuiz(page);

    const item = expectedItem('coding', OPTS.seed, 0, 5);
    if (item.stimulus.kind !== 'coding') throw new Error('unexpected stimulus');

    await expect(page.locator('[data-coding-key] .coding-pair')).toHaveCount(
      item.stimulus.pairs.length,
    );
    await expect(page.locator('[data-coding-probe-digit]')).toHaveText(item.stimulus.probe);

    // The probed column exists in the markup but carries no visual weight of its own.
    const probed = page.locator('[data-coding-probe="true"]');
    await expect(probed).toHaveCount(1);
    const plain = page.locator('[data-coding-probe="false"]').first();
    for (const prop of ['outlineStyle', 'backgroundColor', 'borderTopWidth'] as const) {
      const read = (loc: typeof probed) =>
        loc.evaluate((el, p) => getComputedStyle(el)[p as never] as string, prop);
      expect(await read(probed), `probed column differs on ${prop}`).toBe(await read(plain));
    }

    /*
     * Every option is a symbol that appears in the key.
     *
     * Compared on the drawn geometry rather than on innerHTML: each figure mints its own
     * pattern id (`useId`), so two identical symbols have different markup. Shape, shading
     * and the point list are the symbol's actual identity — the points encode rotation.
     */
    const signatures = (scope: ReturnType<typeof page.locator>) =>
      scope.evaluateAll((els) =>
        els.map((el) => {
          const drawn = el.querySelector('polygon, circle')!;
          return [
            drawn.getAttribute('data-shape'),
            drawn.getAttribute('data-color'),
            drawn.getAttribute('points') ?? drawn.getAttribute('r'),
          ].join('|');
        }),
      );

    const keySymbols = await signatures(page.locator('[data-coding-key] .coding-symbol svg'));
    const optionSymbols = await signatures(
      page.getByTestId('options').locator('svg[data-figure]'),
    );
    expect(optionSymbols).toHaveLength(item.options.length);
    for (const option of optionSymbols) expect(keySymbols).toContain(option);
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
   * The span task is the only item that plays itself, so it is the only one that can be
   * lost by not looking — and there is deliberately no replay. It must therefore wait to be
   * started rather than beginning on its own a moment after the page appears.
   */
  test('digit span waits to be started, and does not play until it is', async ({ page }) => {
    await page.goto(practiceUrl('span', OPTS));
    await waitForQuiz(page);

    const item = expectedItem('span', OPTS.seed, 0, OPTS.difficulty);
    if (item.stimulus.kind !== 'span') throw new Error('unexpected stimulus');

    const player = page.locator('[data-stimulus="span"]');
    await expect(player).toHaveAttribute('data-span-started', 'false');
    await expect(page.getByTestId('span-start')).toBeVisible();

    /*
     * Well past the 400ms settle the old auto-play used, and past the whole sequence: with
     * a gate, waiting must leave the item exactly where it was rather than silently
     * consuming it.
     */
    await page.waitForTimeout(3000);
    await expect(player).toHaveAttribute('data-span-started', 'false');
    await expect(player).toHaveAttribute('data-span-finished', 'false');
    for (const element of new Set(item.stimulus.sequence)) {
      await expect(page.locator(`[data-span-element="${element}"]`)).toHaveCount(0);
    }

    await page.getByTestId('span-start').click();
    await expect(player).toHaveAttribute('data-span-started', 'true');
    await expect(page.getByTestId('span-start')).toHaveCount(0);
    await expect(player).toHaveAttribute('data-span-finished', 'true', { timeout: 25_000 });
  });

  /** A span drill has to stay on the keyboard like every other format. */
  test('digit span can be started with Enter, without focusing the button', async ({ page }) => {
    await page.goto(practiceUrl('span', OPTS));
    await waitForQuiz(page);

    const player = page.locator('[data-stimulus="span"]');
    await expect(player).toHaveAttribute('data-span-started', 'false');

    // Deliberately not focusing the button first — that case works for free.
    await page.keyboard.press('Enter');
    await expect(player).toHaveAttribute('data-span-started', 'true');
    await expect(player).toHaveAttribute('data-span-finished', 'true', { timeout: 25_000 });
    await expect(page.getByTestId('span-input')).toBeEnabled();
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

    // The input is locked before the sequence has been played, and while it plays.
    await expect(page.getByTestId('span-input')).toBeDisabled();

    const player = page.locator('[data-stimulus="span"]');
    await startSpanIfGated(page);
    await expect(page.getByTestId('span-input')).toBeDisabled();
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
    await startSpanIfGated(page);
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

test.describe('head count', () => {
  const HC: DrillOptions = { seed: 'HCE2E001', difficulty: 3, length: 1 };

  test('locks its options until the stream has played', async ({ page }) => {
    await page.goto(practiceUrl('head-count', HC));
    await waitForQuiz(page);

    const stream = page.locator('[data-stimulus="head-count"]');
    const firstOption = page.getByTestId('option-0');

    await expect(stream).toHaveAttribute('data-span-started', 'false');
    await expect(firstOption).toBeDisabled();

    await page.getByTestId('span-start').click();
    await expect(firstOption).toBeDisabled();

    // The keyboard route bypasses `disabled`, so it is checked separately.
    await page.keyboard.press('1');
    await expect(page.getByTestId('feedback')).toHaveCount(0);

    await expect(stream).toHaveAttribute('data-span-finished', 'true', { timeout: 30_000 });
    await expect(firstOption).toBeEnabled();
  });

  /**
   * Arrivals and departures must differ on a channel that is not position.
   *
   * This is a regression test for a real defect. The first version drew an arrow beside the
   * group — pointing right to arrive, left to leave — with the row reversed for departures. On
   * screen both came out as an arrow pointing *at* the figures, differing only in which side of
   * them it sat on. For a frame shown for under a second that is no distinction at all, and
   * mistaking one for the other is a perception failure rather than the memory failure this
   * format is for. What the test pins is the property, not the glyph: the two directions must
   * differ in their sign *and* in how the figures are painted.
   */
  test('distinguishes arrivals from departures without relying on position', async ({ page }) => {
    await page.goto(practiceUrl('head-count', HC));
    await waitForQuiz(page);

    const item = expectedItem('head-count', HC.seed, 0, HC.difficulty);
    if (item.stimulus.kind !== 'head-count') throw new Error('expected a head-count stimulus');
    // The chosen seed has to exercise both directions or the test proves nothing.
    expect(item.stimulus.events.some((d) => d > 0), 'seed has no arrivals').toBe(true);
    expect(item.stimulus.events.some((d) => d < 0), 'seed has no departures').toBe(true);

    await page.getByTestId('span-start').click();

    const seen = new Map<string, { sign: string; fill: string; figures: number; count: string }>();
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline && seen.size < 2) {
      const movement = page.locator('.movement');
      if ((await movement.count()) > 0) {
        const observed = await movement.first().evaluate((el) => {
          const figure = el.querySelector('.movement-figure');
          return {
            direction: el.getAttribute('data-movement') ?? '',
            count: el.getAttribute('data-movement-count') ?? '',
            sign: el.querySelector('.movement-sign')?.textContent?.trim() ?? '',
            fill: figure ? getComputedStyle(figure).fill : '',
            figures: el.querySelectorAll('.movement-figure').length,
          };
        });
        if (observed.direction && !seen.has(observed.direction)) {
          seen.set(observed.direction, observed);
        }
      }
      await page.waitForTimeout(40);
    }

    expect([...seen.keys()].sort(), 'both directions were drawn').toEqual(['in', 'out']);
    const arriving = seen.get('in')!;
    const leaving = seen.get('out')!;

    // The sign is the primary channel.
    expect(arriving.sign).toBe('+');
    expect(leaving.sign).toBe('\u2212');
    // And the fill is the redundant one, so a reader who misses the sign still has a cue.
    expect(leaving.fill, 'departing figures are painted the same as arriving ones').not.toBe(
      arriving.fill,
    );
    expect(arriving.fill).not.toBe('none');
    expect(leaving.fill).toBe('none');

    // The magnitude has to be readable from the drawing, not only from the sign.
    expect(arriving.figures).toBe(Number(arriving.count));
    expect(leaving.figures).toBe(Number(leaving.count));
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
