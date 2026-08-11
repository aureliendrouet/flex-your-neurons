/**
 * High number — which numeral is worth more, when the drawing disagrees with the arithmetic.
 *
 * Two numbers are printed at unrelated sizes and the reader names the one with the larger *value*.
 * When a 3 is drawn twice the height of an 8, reading the value and reading the ink pull in opposite
 * directions, and the cost of settling that conflict is the measurement. This is the size-congruity
 * effect (Henik & Tzelgov 1982): a numeral's magnitude is processed whether or not the task asks for
 * it, so physical and numerical size interfere in both directions.
 *
 * ## Why two candidates and not four
 *
 * Brain Age shows a handful of numbers and has you touch the largest. That version cannot be built
 * here without breaking Guard 2, and the reason is worth stating because it looks at first like a
 * presentation detail. If the candidates are the options, then the option set *contains* the answer
 * by definition — "pick the largest of these four numbers" is answerable by a solver that never sees
 * the stimulus, because the numbers are the stimulus. Any repair that keeps four candidates has to
 * put something other than the numbers in the option list, and every such mapping (positions,
 * labels) inserts a lookup between deciding and answering, in a task measured in a few hundred
 * milliseconds.
 *
 * Two candidates and a left/right response is what the psychophysics literature actually does, and
 * the option set carries nothing: both options are present on every item, in the same order, so
 * "which side" is decided entirely by the stimulus.
 *
 * ## Why both numerals always have the same number of digits
 *
 * A two-digit numeral is physically wider than a one-digit numeral however large either is drawn, so
 * an item mixing the two would confound the size channel with the digit count — the manipulation
 * this format exists to make would be partly out of the generator's hands. Both candidates are drawn
 * from the same pool, and the pool is a difficulty dial rather than a source of variety.
 *
 * ## The two dials
 *
 * How often the conflict fires (`congruentShare`, as in the counting Stroop), and how far apart the
 * two values are. The second is the distance effect: comparing 2 with 8 is nearly immediate, and
 * comparing 6 with 7 is not, so a small gap leaves the comparison slow enough for the size channel
 * to interfere with it.
 */
import { createRng } from '../rng';
import { dict, type Locale } from '../i18n';
import type {
  Difficulty,
  ErrorType,
  Generator,
  Item,
  ItemTypeMeta,
  Option,
  SizeLevel,
} from '../types';

interface Plan {
  /** How many digits both numerals have. */
  digits: 1 | 2;
  /** Smallest and largest numerical distance between the two candidates. */
  gap: [min: number, max: number];
  /** Probability that the larger value is also the larger drawing. */
  congruentShare: number;
}

function planFor(difficulty: Difficulty): Plan {
  switch (difficulty) {
    case 1:
      return { digits: 1, gap: [4, 8], congruentShare: 0.5 };
    case 2:
      return { digits: 1, gap: [3, 7], congruentShare: 0.4 };
    case 3:
      return { digits: 1, gap: [1, 4], congruentShare: 0.3 };
    case 4:
      return { digits: 2, gap: [2, 9], congruentShare: 0.2 };
    case 5:
      return { digits: 2, gap: [1, 5], congruentShare: 0.12 };
  }
}

/**
 * The two sizes a pair of numerals may be drawn at, as `[smaller, larger]`.
 *
 * Held two levels apart at least, because the conflict has to be visible to exist: a numeral drawn
 * one step larger than its neighbour is a difference the reader has to look for, and a difference
 * that has to be looked for cannot be the automatic reading that interferes.
 */
const SCALE_PAIRS: [SizeLevel, SizeLevel][] = [
  [1, 3],
  [1, 4],
  [1, 5],
  [2, 4],
  [2, 5],
  [3, 5],
];

/**
 * Whether the larger value is also the larger drawing — the trial's condition.
 *
 * Derived from the candidates rather than stored beside them, for the reason `isCongruent` is
 * derived in `interference.ts`: the condition is a fact about what was drawn, and a copy of it on
 * the stimulus is a second place for it to be wrong.
 */
export function isSizeCongruent(candidates: { value: number; scale: SizeLevel }[]): boolean {
  const [a, b] = candidates;
  if (!a || !b) return false;
  return a.value > b.value === a.scale > b.scale;
}

const meta: ItemTypeMeta = {
  id: 'high-number',
  domain: 'Gs',
  // A comparison, which is the whole question — and unlike '>' it does not read as a stray bracket.
  icon: '≷',
  sprintable: true,
};

const MAX_ATTEMPTS = 50;

function generate(seed: string, difficulty: Difficulty, locale: Locale): Item {
  const t = dict(locale).gen.highNumber;
  const rng = createRng(`high-number:${seed}:${difficulty}`);
  const plan = planFor(difficulty);
  const [lo, hi] = plan.digits === 1 ? [1, 9] : [10, 99];

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const gap = rng.int(plan.gap[0], plan.gap[1]);
    const small = rng.int(lo, hi - gap);
    const large = small + gap;
    if (large > hi) continue;

    const congruent = rng.bool(plan.congruentShare);
    const [smallScale, largeScale] = rng.pick(SCALE_PAIRS);
    // The scales go with the values when the trial is congruent, and against them when it is not.
    const candidates = [
      { value: large, scale: congruent ? largeScale : smallScale },
      { value: small, scale: congruent ? smallScale : largeScale },
    ];
    // Which side the larger value lands on, drawn rather than fixed: the answer is a side.
    const larger = rng.int(0, 1);
    if (larger === 1) candidates.reverse();

    // The independent check: the condition read back off the drawing must be the one asked for.
    if (isSizeCongruent(candidates) !== congruent) continue;

    /*
     * Both sides are offered on every item, in the same order, every time.
     *
     * The same reasoning as the interference keypad: shuffling would add a visual search to a task
     * whose measurement is a few hundred milliseconds of conflict, and the search would be larger
     * than the effect. A fixed mapping is also what the paradigm does — it is learned once, and
     * then the only variable left is the interference.
     */
    const options: Option[] = [
      { kind: 'text', text: t.left },
      { kind: 'text', text: t.right },
    ];
    const errorTypes: ErrorType[] = [0, 1].map((side) =>
      side === larger
        ? 'correct'
        : /*
           * On an incongruent trial the other side is the *bigger drawing*, which is the answer the
           * eye offers and the one inhibition is supposed to refuse. On a congruent trial there is
           * nothing to refuse, so the wrong side is just the wrong side.
           */
          congruent
          ? 'plausible'
          : 'wrong-attribute',
    );

    const drawnLarger = candidates[0]!.scale > candidates[1]!.scale ? t.sides.left : t.sides.right;
    return {
      type: 'high-number',
      seed,
      difficulty,
      prompt: t.prompt,
      stimulus: { kind: 'high-number', candidates },
      responseMode: 'choice',
      options,
      answerIndex: larger,
      errorTypes,
      explanation: {
        summary: t.summary(large, larger === 0 ? t.sides.left : t.sides.right),
        rules: [
          congruent ? t.ruleCongruent : t.ruleIncongruent(small, drawnLarger),
          t.ruleDistance(gap),
          t.ruleScoring,
        ],
      },
      // Short, like the other conflict format: the measurement is the delay, not the comparison.
      suggestedSeconds: 4,
    };
  }

  throw new Error(
    `high-number generator exhausted ${MAX_ATTEMPTS} attempts for seed "${seed}" d${difficulty}`,
  );
}

export const highNumberGenerator: Generator = { meta, generate };
