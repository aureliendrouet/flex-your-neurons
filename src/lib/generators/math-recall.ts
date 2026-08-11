/**
 * Math recall — the numbers go past, and only then are you asked to add them.
 *
 * The fourth working-memory format, and it is the one where the held material is *operated on*
 * rather than reproduced. Span gives a list back unchanged. Block span gives positions back
 * unchanged. Head count holds a single running value and rewrites it. This one holds several
 * independent values while they are still arriving and then computes over them once they are gone —
 * storage and processing at the same time, which is the distinction between short-term memory and
 * working memory proper (Baddeley; Daneman & Carpenter's operation-span line of work).
 *
 * ## Why the terms are shown one at a time rather than all at once and then hidden
 *
 * Flashing the whole sum and taking it away measures how much of a picture is captured in one look,
 * which is a visual span. Presenting term by term means the first number has to survive the arrival
 * of the second — there is no moment at which the reader can see the problem — and that is the load
 * the format is for.
 *
 * ## Why it is addition, and why the running sum is not the task
 *
 * Addition is commutative and associative, so the order the terms arrived in does not have to be
 * held as well as the terms; the item measures retention, not sequencing, which `span` already does.
 * And nothing on screen says how many terms are still coming, so a reader who adds as they go has
 * not cheated — they have solved it a different way, and both routes load the same thing. What the
 * format rules out is the third route: waiting to see the whole sum, which never appears.
 *
 * ## Why the answer is picked rather than typed
 *
 * The same reason as `arithmetic`: typing puts keyboard speed inside a measurement that is not about
 * it. The option set is a rectangle around the answer, which closes the units-digit shortcut — with
 * the terms gone, an option list where only one value could end in the right digit would be
 * answerable from a fragment of what was seen.
 */
import { createRng, type Rng } from '../rng';
import { dict, type Locale } from '../i18n';
import { rectangleOptions } from './distractors';
import type { Difficulty, ErrorType, Generator, Item, ItemTypeMeta, Option } from '../types';

interface Plan {
  /** How many numbers go past. */
  terms: number;
  /** The range each term is drawn from. */
  range: [min: number, max: number];
  /** Milliseconds each term is shown. */
  stepMs: number;
}

/**
 * Two dials, and they are the two halves of the load: how much has to be held, and how long there
 * is to encode it. The magnitudes grow too, but only as far as two digits — three-digit addition is
 * a different task, and it would be arithmetic difficulty wearing a memory format's clothes.
 */
function planFor(difficulty: Difficulty): Plan {
  switch (difficulty) {
    case 1:
      return { terms: 2, range: [3, 19], stepMs: 1400 };
    case 2:
      return { terms: 2, range: [8, 49], stepMs: 1200 };
    case 3:
      return { terms: 3, range: [6, 39], stepMs: 1100 };
    case 4:
      return { terms: 3, range: [11, 59], stepMs: 950 };
    case 5:
      return { terms: 4, range: [11, 59], stepMs: 850 };
  }
}

/** Adds the terms the reader was actually shown — the independent check. */
export function sumOf(terms: number[]): number {
  return terms.reduce((a, b) => a + b, 0);
}

const meta: ItemTypeMeta = {
  id: 'math-recall',
  domain: 'Gwm',
  icon: '∑',
  // Gated: the stream has to play before anything can be answered.
  sprintable: false,
};

const MAX_ATTEMPTS = 100;

function generate(seed: string, difficulty: Difficulty, locale: Locale): Item {
  const t = dict(locale).gen.mathRecall;
  const rng = createRng(`math-recall:${seed}:${difficulty}`);
  const plan = planFor(difficulty);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const terms = Array.from({ length: plan.terms }, () =>
      rng.int(plan.range[0], plan.range[1]),
    );
    /*
     * Repeats are turned away, and not for tidiness. A term that arrives twice can be held once and
     * doubled, so the item quietly asks for one fewer thing to be remembered than it appears to.
     */
    if (new Set(terms).size !== terms.length) continue;
    /*
     * At least one pair must carry into the next column. Without a carry anywhere the sum can be
     * assembled a digit at a time, which is a way of never holding the numbers as numbers.
     */
    if (!terms.some((a, i) => terms.some((b, j) => j > i && (a % 10) + (b % 10) >= 10))) continue;

    const answer = sumOf(terms);
    const set = optionsFor(rng, answer);
    if (!set) continue;

    const shuffled = rng.shuffle(set.values);
    const options: Option[] = shuffled.map((v) => ({ kind: 'text', text: String(v) }));

    return {
      type: 'math-recall',
      seed,
      difficulty,
      prompt: t.prompt,
      stimulus: { kind: 'math-recall', terms },
      responseMode: 'choice',
      options,
      answerIndex: shuffled.indexOf(answer),
      errorTypes: shuffled.map((v) => set.errors.get(v) ?? 'plausible'),
      explanation: {
        summary: t.summary(terms.join(' + '), answer),
        rules: [t.ruleHold, t.ruleCarry(answer % 10), t.ruleNoReplay],
      },
      suggestedSeconds: 10 + plan.terms * 3,
      /*
       * The gap is wider than the other streams'. A term here is a two-digit number that has to be
       * committed rather than a glyph that has to be noticed, and running the next one straight into
       * it measures how fast the reader encodes rather than how much they can hold.
       */
      presentation: { stepMs: plan.stepMs, gapMs: 350 },
    };
  }

  throw new Error(
    `math-recall generator exhausted ${MAX_ATTEMPTS} attempts for seed "${seed}" d${difficulty}`,
  );
}

/**
 * The rectangle: a carry slip on one axis and a small miscount on the other.
 *
 * Ten is the diagnostic step here — the units digit right and a higher place wrong is what a dropped
 * carry looks like, and it is the commonest way an addition held in the head comes out wrong.
 */
function optionsFor(rng: Rng, answer: number) {
  const diagnose = (value: number): ErrorType => {
    if (Math.abs(value - answer) % 10 === 0) return 'carry';
    return Math.abs(value - answer) === 1 ? 'off-by-one' : 'plausible';
  };
  return rectangleOptions(rng, answer, [10, 20], [1, 2, 3], diagnose, Math.max(14, answer * 0.4), 1);
}

export const mathRecallGenerator: Generator = { meta, generate };
