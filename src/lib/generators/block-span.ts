/**
 * Block span — watch a scatter of blocks light one after another, then tap them back in order.
 *
 * Corsi's block-tapping task (1972), and the spatial counterpart of digit span: the same
 * "hold a list and reproduce it" demand with the list made of *places* rather than of characters.
 * The two dissociate — spatial and verbal span load differently, and someone strong at one is not
 * reliably strong at the other — which is the whole reason for adding a second span format instead
 * of another difficulty level on the first.
 *
 * ## Why the board never changes
 *
 * Every item uses the same nine positions. That is not laziness about generation, it is the
 * measurement: if the layout were redrawn per item, a reader would have to *find* the blocks before
 * they could remember an order among them, and the search would be mixed into the span. Holding the
 * board fixed makes the sequence the only thing that varies, and a familiar board is what the
 * physical apparatus gives you too — the examiner does not rearrange it between trials.
 *
 * It is the same argument as the fixed keypad in the interference format, arrived at from the other
 * direction: there, a moving option list would have added a search to a latency measurement; here, a
 * moving board would add one to a span measurement.
 *
 * ## Why difficulty is length and nothing else
 *
 * Three temptations were all refused, and each one would have made level 5 measure a different
 * construct from level 1 rather than more of the same one:
 *
 * - **Presentation rate.** Flashing faster at the high levels would trade a storage demand for an
 *   encoding-speed demand, so a longer sequence and a shorter look would be confounded.
 * - **Backward recall.** A backward spatial span is a genuinely harder task, not a longer one. Mixed
 *   into the ladder it would make accuracy at a level bimodal — the same number recalled forwards or
 *   backwards are not the same item — and unlike trail making's two forms there is no timed contrast
 *   to redeem the variance, because this format is scored right or wrong.
 * - **Block count.** Nine blocks with a five-long sequence and five blocks with a five-long sequence
 *   differ in how much of the board is irrelevant, which is a selection demand rather than a span.
 *
 * So `planFor` sets one number. See docs/GENERATABILITY.md §2 (row 20).
 */
import { createRng, type Rng } from '../rng';
import { dict, type Locale } from '../i18n';
import type {
  BlockPosition,
  Difficulty,
  Generator,
  Item,
  ItemTypeMeta,
} from '../types';

/**
 * Block radius as a share of the board's width, matched in `CorsiBoard`.
 *
 * Larger than the trail board's targets — nine blocks rather than sixteen leaves room, and this
 * format asks for a deliberate tap from memory rather than a fast one under a clock, so the target
 * should not be the difficulty. `tests/solvers.test.ts` checks the separation against the diameter.
 */
export const BLOCK_RADIUS = 0.07;

/**
 * The board. Nine irregularly-placed blocks in the unit box, on a square board.
 *
 * Written out rather than generated, because "fixed layout" is the property that matters and a
 * literal is the only way of stating it that cannot come apart. It is irregular by hand rather
 * than copied from the physical apparatus: the real board's coordinates are not something to
 * invent provenance for, and what the task needs is only that the arrangement be irregular enough
 * that positions are remembered as places rather than as rows and columns.
 *
 * The guarantee the geometry has to keep is that no two blocks are closer than a diameter apart,
 * and that none is clipped by the edge. The closest pair here is 0.283 apart against a diameter of
 * 0.14 — a factor of two — and every centre is at least one radius inside the box. Both are
 * asserted in the solver suite, so a "small tidy-up" of these numbers cannot quietly produce
 * overlapping targets.
 */
export const BLOCKS: readonly BlockPosition[] = [
  { x: 0.14, y: 0.18 },
  { x: 0.45, y: 0.1 },
  { x: 0.8, y: 0.22 },
  { x: 0.24, y: 0.46 },
  { x: 0.6, y: 0.42 },
  { x: 0.9, y: 0.55 },
  { x: 0.15, y: 0.78 },
  { x: 0.5, y: 0.74 },
  { x: 0.74, y: 0.88 },
];

/**
 * A tapped sequence is encoded one character per block, so it fits `answerText` and stays readable
 * in stored history. That only works while there are fewer than ten blocks — with a tenth, "1" then
 * "0" and "10" would be the same string — so the constraint is asserted rather than remembered.
 */
if (BLOCKS.length > 9) throw new Error('block-span: the tap encoding assumes at most 9 blocks');

/**
 * How long each block stays lit, and the blank between them. Fixed at every level, deliberately:
 * see the note above on why difficulty is length alone.
 */
const STEP_MS = 650;
const GAP_MS = 350;

interface Plan {
  /** How many blocks light, and therefore how many taps are required. */
  length: number;
}

/**
 * Three to seven. Lower than digit span's four to seven at the same levels, because spatial span
 * runs about a block shorter than digit span in every published comparison — starting both at the
 * same length would make this format's level 1 harder than the other's.
 */
function planFor(difficulty: Difficulty): Plan {
  switch (difficulty) {
    case 1:
      return { length: 3 };
    case 2:
      return { length: 4 };
    case 3:
      return { length: 5 };
    case 4:
      return { length: 6 };
    case 5:
      return { length: 7 };
  }
}

/** The tapped-sequence encoding: one digit per block, 1-based, in tap order. */
export function encodeTaps(sequence: readonly number[]): string {
  return sequence.map((index) => String(index + 1)).join('');
}

/**
 * Cosine of the sharpest turn still counted as "carrying straight on".
 *
 * Above this the three blocks are near enough to collinear, in near enough the same direction, to
 * be encoded as one movement.
 */
const STRAIGHT_ENOUGH = 0.94;

/**
 * Whether any three consecutive blocks lie in a straight line travelled in one direction.
 *
 * Such a run chunks: three positions that read as "along this line" cost about as much to hold as
 * one, so a sequence containing them is shorter than its length claims. It is the same defect
 * `span` avoids by refusing runs like 4-5-6, and it matters more here, because a straight line
 * across a board is a stronger gestalt than three consecutive digits.
 *
 * Exported so the property test can assert the guard bites rather than trusting that it ran.
 */
export function hasStraightRun(
  sequence: readonly number[],
  blocks: readonly BlockPosition[] = BLOCKS,
): boolean {
  for (let i = 2; i < sequence.length; i++) {
    const a = blocks[sequence[i - 2]!]!;
    const b = blocks[sequence[i - 1]!]!;
    const c = blocks[sequence[i]!]!;
    const first = { x: b.x - a.x, y: b.y - a.y };
    const second = { x: c.x - b.x, y: c.y - b.y };
    const lengths = Math.hypot(first.x, first.y) * Math.hypot(second.x, second.y);
    if (lengths === 0) continue;
    const cosine = (first.x * second.x + first.y * second.y) / lengths;
    if (cosine > STRAIGHT_ENOUGH) return true;
  }
  return false;
}

/**
 * Draws a sequence with no straight run in it.
 *
 * Rejection sampling with a bounded number of attempts, and it falls back to the last draw rather
 * than throwing. A generator that can fail is a generator that fails on someone's item: with nine
 * blocks and at most seven of them used, a clean draw is overwhelmingly likely, so the fallback is
 * a safety net rather than a routine path — but "unlikely" is not "impossible", and the item still
 * has to exist. A sequence with one straight run is a slightly easier item, not a broken one.
 */
const ATTEMPTS = 40;

function drawSequence(length: number, rng: Rng): number[] {
  const indices = BLOCKS.map((_, i) => i);
  let last: number[] = [];
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    last = rng.sample(indices, length);
    if (!hasStraightRun(last)) return last;
  }
  return last;
}

const meta: ItemTypeMeta = {
  id: 'block-span',
  /*
   * Gwm rather than Gv. What is drawn is spatial, but what is measured is span: the item is hard
   * because the sequence has to be held, not because anything about the layout has to be worked
   * out. A rotation item is Gv; this is digit span with places instead of digits.
   */
  domain: 'Gwm',
  icon: '⁂',
  // Plays itself before it can be answered, so a sprint would be spent watching.
  sprintable: false,
};

function generate(seed: string, difficulty: Difficulty, locale: Locale): Item {
  const t = dict(locale).gen.blockSpan;
  const rng = createRng(`block-span:${seed}:${difficulty}`);
  const plan = planFor(difficulty);

  const sequence = drawSequence(plan.length, rng);

  return {
    type: 'block-span',
    seed,
    difficulty,
    prompt: t.prompt(plan.length),
    stimulus: { kind: 'block-span', blocks: [...BLOCKS], sequence },
    responseMode: 'tap',
    options: [],
    answerIndex: -1,
    answerText: encodeTaps(sequence),
    errorTypes: [],
    explanation: {
      /*
       * The summary names the length and points at the board rather than spelling the order out.
       * There is no way to say "block 4 then block 8" that means anything — the blocks have no
       * names — so the order is shown where it happened: the board stays on screen after
       * answering, with the sequence numbered on it.
       */
      summary: t.summary(plan.length),
      rules: [t.ruleOrder, t.ruleExact, t.ruleBoard, t.ruleSpatial],
    },
    // Playback is about a second per block, and then the taps: generous, and it is not timed.
    suggestedSeconds: Math.round(8 + plan.length * 2.5),
    presentation: { stepMs: STEP_MS, gapMs: GAP_MS },
  };
}

export const blockSpanGenerator: Generator = { meta, generate };
