/**
 * Triangle math — a pyramid where every cell is the sum of the two beneath it.
 *
 * The base row is given and everything above it is blank. Each blank is one addition, but the
 * additions are not independent: the second row has to be finished before the third can start, and a
 * cell you got wrong propagates upward into every cell above it. That is the format's whole point —
 * it measures a *chain of dependent steps*, where `arithmetic` measures one step and
 * `serial-subtraction` measures a chain whose every step is the same operation on a single running
 * value. Here the value branches, and the reader has to hold two intermediate results at once.
 *
 * ## Why every blank is answered rather than only the apex
 *
 * Asking only for the top would be an item with a single number for an answer, which the option
 * machinery could carry — and it would throw away what the format knows. The apex alone cannot tell
 * a reader *where* the chain broke, and "you got 47 instead of 45" is unactionable when three
 * additions went into it. With every cell answered, a wrong item shows exactly which addition
 * failed and how the error travelled, which is the same reason `head-count` replays its running
 * total in the explanation.
 *
 * It also required a fourth response mode, `fill`, which is the honest cost. The alternative — one
 * item per cell — would have made three items whose answers are not independent, and pooled them
 * into per-format statistics as though they were.
 *
 * ## Why it is addition only, and why the base never repeats a number
 *
 * Subtraction upward would make some cells negative and the rest a sign-tracking exercise, which is
 * a different task (`arithmetic` says the same thing about why its subtraction never goes below
 * zero). And a base with two equal numbers produces two equal cells above it, which lets a reader
 * fill one blank by copying its neighbour rather than by adding.
 */
import { createRng, type Rng } from '../rng';
import { dict, type Locale } from '../i18n';
import type { Difficulty, Generator, Item, ItemTypeMeta } from '../types';

interface Plan {
  /** How many numbers the given row holds. The pyramid has that many rows. */
  base: number;
  /** The range each base number is drawn from. */
  range: [min: number, max: number];
}

/**
 * Two dials, and the first is much the stronger: a base of four is six blanks rather than three, and
 * the top of it is a four-term sum. Magnitude is the second, and it stops well short of three digits
 * — this is a format about a dependent chain, not about carrying.
 */
function planFor(difficulty: Difficulty): Plan {
  switch (difficulty) {
    case 1:
      return { base: 3, range: [1, 9] };
    case 2:
      return { base: 3, range: [3, 19] };
    case 3:
      return { base: 3, range: [6, 39] };
    case 4:
      return { base: 4, range: [2, 14] };
    case 5:
      return { base: 4, range: [4, 24] };
  }
}

/**
 * Builds the whole pyramid from its base, bottom row first — the independent check.
 *
 * Returns the rows in the order they are drawn, so `rows[0]` is the given base and each subsequent
 * row is one shorter. The generator does not "know" the answer separately: the answer *is* this,
 * with the base dropped.
 */
export function buildPyramid(base: number[]): number[][] {
  const rows = [base];
  while (rows[rows.length - 1]!.length > 1) {
    const below = rows[rows.length - 1]!;
    rows.push(below.slice(0, -1).map((value, i) => value + below[i + 1]!));
  }
  return rows;
}

/**
 * The blanks, bottom-left to top — the order the reader fills them and the order they are graded in.
 *
 * A single flat list rather than a nested one, because the response is a flat list of numbers and
 * the two have to line up exactly; the renderer re-derives the shape from the base width, which it
 * has anyway.
 */
export function blanksOf(base: number[]): number[] {
  return buildPyramid(base).slice(1).flat();
}

/** The expected answer string: the blanks in order, comma-separated. */
export function encodeBlanks(values: number[]): string {
  return values.join(',');
}

const meta: ItemTypeMeta = {
  id: 'triangle-math',
  domain: 'Gq',
  icon: '△',
  /*
   * Never sprintable, and not because of a presentation — this is the first format kept out of the
   * block for the plain reason that one item is several answers. A sixty-second block would hold
   * three or four of them, which measures the length of the pyramid rather than sustained output.
   */
  sprintable: false,
};

const MAX_ATTEMPTS = 100;

function generate(seed: string, difficulty: Difficulty, locale: Locale): Item {
  const t = dict(locale).gen.triangleMath;
  const rng = createRng(`triangle-math:${seed}:${difficulty}`);
  const plan = planFor(difficulty);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const base = Array.from({ length: plan.base }, () => rng.int(plan.range[0], plan.range[1]));
    // No repeats: two equal numbers side by side make the cells above them copyable rather than
    // calculable, and two anywhere in the base make one addition a repeat of another.
    if (new Set(base).size !== base.length) continue;

    const rows = buildPyramid(base);
    const blanks = blanksOf(base);
    // The independent check: the flat answer must be exactly the pyramid above the base.
    if (blanks.length !== rows.slice(1).reduce((n, row) => n + row.length, 0)) continue;
    /*
     * At least one addition has to carry. Without a carry anywhere the whole pyramid is column
     * arithmetic on single digits, and a reader can run it without ever holding a two-digit number.
     */
    if (!rows.some((row) => row.some((value, i) => i > 0 && (value % 10) + (row[i - 1]! % 10) >= 10))) {
      continue;
    }

    return {
      type: 'triangle-math',
      seed,
      difficulty,
      prompt: t.prompt,
      stimulus: { kind: 'pyramid', base },
      responseMode: 'fill',
      options: [],
      answerIndex: -1,
      answerText: encodeBlanks(blanks),
      errorTypes: [],
      explanation: {
        summary: t.summary(rows[rows.length - 1]![0]!),
        rules: [
          t.ruleSum,
          t.ruleRows(rows.slice(1).map((row) => row.join(', ')).join(' → ')),
          t.rulePropagates,
        ],
      },
      // Roughly four seconds a blank, plus reading the base.
      suggestedSeconds: 8 + blanks.length * 4,
    };
  }

  throw new Error(
    `triangle-math generator exhausted ${MAX_ATTEMPTS} attempts for seed "${seed}" d${difficulty}`,
  );
}

export const triangleMathGenerator: Generator = { meta, generate };
