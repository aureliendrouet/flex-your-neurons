/**
 * Interference — count the digits, do not read them.
 *
 * A Stroop task (Stroop 1935, open literature), and the point of one is *inhibition*: a fast
 * automatic process has to be held back while a slower deliberate one answers. Reading a digit is
 * automatic; counting how many there are is not. So `4 4 4` pulls hard towards "4" when the answer
 * is 3, and the cost of resisting that pull is the measurement.
 *
 * ## Why this is not the colour Stroop
 *
 * The famous version prints the word "RED" in blue ink and asks for the ink. This site cannot do
 * that. Hue is not an information channel here — every figure is texture and shading only, because
 * roughly one man in twelve would otherwise be answering a different question (`DESIGN-PLAN.md`
 * §3.1). A colour Stroop would make colour vision a prerequisite for the format rather than an
 * accessibility detail, and no palette fixes that: achromatopsia leaves the task undoable.
 *
 * The counting Stroop (Bush et al.) is the same construct on a different dimension, and it is
 * better suited here for a second reason: digits are language-neutral. A word-based Stroop would
 * make the interference depend on how quickly the reader reads *that* language, so the English and
 * French versions of an item would not be the same item — which breaks the promise that a shared
 * seed is the same test in either language.
 *
 * ## Why the option positions never move
 *
 * Options are the whole count range, in ascending order, every time. Shuffling them would add a
 * visual search to a task whose entire measurement is a few hundred milliseconds of inhibition —
 * the search would swamp the effect being measured. A fixed keypad is also what the real task does:
 * the response mapping is learned once, and then the only variable left is the interference.
 *
 * ## Why the incongruent share is the only difficulty dial
 *
 * The load is the inhibition, so the dial is how often inhibition is required. Level 1 is half
 * congruent trials, where the automatic answer is usually right and can be leaned on; level 5 is
 * almost all incongruent, where it cannot. Nothing else changes between levels — see `COUNTS` for
 * why widening the count range with difficulty was a mistake rather than a second dial.
 */
import { createRng } from '../rng';
import { dict, type Locale } from '../i18n';
import type { Difficulty, ErrorType, Generator, Item, ItemTypeMeta, Option } from '../types';

/**
 * How many glyphs may be shown, and therefore how many options there are. Fixed across every
 * difficulty, which took a failing test to get right.
 *
 * The first version widened the range with difficulty — one to three at level 1, up to six at level
 * 5 — and that is wrong twice over. It changes the guessing baseline from one level to the next (a
 * third down to a sixth), so accuracy at level 1 and level 5 are not the same quantity and a
 * "harder" level can come out easier by chance. And it changes the size of the response set, which
 * adds a visual-search component that grows with difficulty — in a task whose entire measurement is
 * a few hundred milliseconds of inhibition, that confound is larger than the effect.
 *
 * Five is also the ceiling on purpose: counting past about four stops being immediate and starts
 * being counting, and counting speed is not the construct.
 */
const COUNTS: [min: number, max: number] = [1, 5];

interface Plan {
  /** Probability that the digit shown equals the number of them. */
  congruentShare: number;
}

/**
 * Difficulty is *only* how often inhibition is required, which is the honest dial for a Stroop
 * task: the load is the conflict, not the counting. Level 1 is half congruent, where the automatic
 * answer is usually right and can be leaned on; level 5 is mostly incongruent, where it cannot.
 */
function planFor(difficulty: Difficulty): Plan {
  switch (difficulty) {
    case 1:
      return { congruentShare: 0.5 };
    case 2:
      return { congruentShare: 0.4 };
    case 3:
      return { congruentShare: 0.3 };
    case 4:
      return { congruentShare: 0.2 };
    case 5:
      return { congruentShare: 0.12 };
  }
}

/**
 * Whether the digit shown agrees with how many of them there are.
 *
 * Derived from the glyphs rather than stored on the stimulus, so there is exactly one source of
 * truth. This is what the interference read-out partitions on: the contrast between incongruent and
 * congruent median latency *is* the Stroop effect, and it is recoverable from history because every
 * item regenerates from its seed — no per-response field had to be added to store it.
 */
export function isCongruent(glyphs: string[]): boolean {
  return glyphs.length === Number(glyphs[0]);
}

const meta: ItemTypeMeta = {
  id: 'interference',
  domain: 'Gs',
  // "the count is not the digit" — the whole task in one glyph.
  icon: '≠',
  sprintable: true,
};

const MAX_ATTEMPTS = 50;

function generate(seed: string, difficulty: Difficulty, locale: Locale): Item {
  const t = dict(locale).gen.interference;
  const rng = createRng(`interference:${seed}:${difficulty}`);
  const plan = planFor(difficulty);
  const [min, max] = COUNTS;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const count = rng.int(min, max);
    const congruent = rng.bool(plan.congruentShare);

    /*
     * The digit is drawn from the option range, not from all ten. A digit outside the range is not
     * a lure — nobody is tempted to answer 9 when the options stop at 6 — so it would produce a
     * trial that looks incongruent and interferes with nothing.
     */
    const pool = Array.from({ length: max - min + 1 }, (_, i) => min + i).filter(
      (d) => (congruent ? d === count : d !== count),
    );
    if (pool.length === 0) continue;
    const digit = rng.pick(pool);

    const glyphs = Array.from({ length: count }, () => String(digit));
    // The independent check: the count is the array the renderer will draw, not a separate number.
    if (glyphs.length !== count || isCongruent(glyphs) !== congruent) continue;

    const values = Array.from({ length: max - min + 1 }, (_, i) => min + i);
    const options: Option[] = values.map((v) => ({ kind: 'text', text: String(v) }));
    const errorTypes: ErrorType[] = values.map((v) =>
      v === count
        ? 'correct'
        : /*
           * The digit's own value, when it is not the answer, is *the* diagnostic distractor: it is
           * the automatic response that inhibition is supposed to suppress. Choosing it is not
           * carelessness, it is the effect the format measures.
           */
          v === digit
          ? 'wrong-attribute'
          : Math.abs(v - count) === 1
            ? 'off-by-one'
            : 'plausible',
    );

    return {
      type: 'interference',
      seed,
      difficulty,
      prompt: t.prompt,
      stimulus: { kind: 'interference', glyphs },
      responseMode: 'choice',
      options,
      answerIndex: values.indexOf(count),
      errorTypes,
      explanation: {
        summary: t.summary(count, String(digit)),
        rules: [
          congruent ? t.ruleCongruent : t.ruleIncongruent(String(digit), count),
          t.ruleInhibition,
          t.ruleScoring,
        ],
      },
      // Short: the whole measurement is a few hundred milliseconds of inhibition.
      suggestedSeconds: 4,
    };
  }

  throw new Error(
    `interference generator exhausted ${MAX_ATTEMPTS} attempts for seed "${seed}" d${difficulty}`,
  );
}

export const interferenceGenerator: Generator = { meta, generate };
