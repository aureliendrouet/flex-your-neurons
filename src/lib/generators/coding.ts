/**
 * Digit–symbol coding — read a key, then say which symbol a digit is paired with.
 *
 * A processing-speed (Gs) task, and the other half of the WAIS Processing Speed index
 * alongside symbol search. On the real battery this is a written sprint: a key across the
 * top of the page, then rows of digits to fill in, scored on how many you complete in 120
 * seconds. Nothing about *one* substitution is difficult; the construct is the rate at
 * which you can do a trivial thing without losing your place.
 *
 * One item here is therefore one substitution, scored on latency — the same accommodation
 * symbol search makes, for the same reason, and it is recorded in `GENERATABILITY.md` §3:
 * this measures substitution speed, not the sustained-output component a timed page adds.
 *
 * Two properties matter for validity, and both are enforced below:
 *
 * - **The key must have to be read.** Every option is a symbol *from the key*, never an
 *   unrelated one. If distractors came from outside the key, the answer would be
 *   recoverable by elimination without reading the pairing at all — the leakage failure
 *   that I-RAVEN was built to fix (`GENERATABILITY.md` §1).
 * - **Losing your place is the interesting error.** The symbols paired with the digits
 *   either side of the probe are always among the distractors, so the commonest real
 *   mistake — reading one column off — is diagnosable as `off-by-one` rather than
 *   disappearing into `plausible`.
 */
import { createRng, type Rng } from '../rng';
import { dict, type Locale } from '../i18n';
import { confusableWith, randomSymbol, symbolKey, toFigure, type Symbol } from './symbols';
import type { Difficulty, ErrorType, Generator, Item, ItemTypeMeta, Option } from '../types';

/** 1–9. Zero is excluded: it reads as "no answer" in a key of single characters. */
const DIGITS = '123456789'.split('');

const OPTION_COUNT = 4;

interface Plan {
  /** Pairs in the key. Longer keys mean more scanning per substitution. */
  keySize: number;
  /**
   * Whether the key contains symbols one dimension apart. With a confusable key you must
   * check all three dimensions of a symbol rather than its silhouette alone.
   */
  confusable: boolean;
}

function planFor(difficulty: Difficulty): Plan {
  switch (difficulty) {
    case 1:
      return { keySize: 4, confusable: false };
    case 2:
      return { keySize: 5, confusable: false };
    case 3:
      return { keySize: 6, confusable: false };
    case 4:
      return { keySize: 7, confusable: true };
    case 5:
      return { keySize: 9, confusable: true };
  }
}

/**
 * A key of distinct symbols, or `null` if this seed could not produce one.
 *
 * At `confusable`, most entries are built one dimension away from an entry already in the
 * key — but only after the first, and never as a duplicate, so the key stays a function.
 */
function buildKey(plan: Plan, rng: Rng): Symbol[] | null {
  const symbols: Symbol[] = [];
  const seen = new Set<string>();

  while (symbols.length < plan.keySize) {
    let candidate: Symbol | null = null;
    for (let tries = 0; tries < 60; tries++) {
      const s =
        plan.confusable && symbols.length > 0 && rng.bool(0.7)
          ? confusableWith(rng.pick(symbols), rng)
          : randomSymbol(rng);
      if (seen.has(symbolKey(s))) continue;
      candidate = s;
      break;
    }
    if (!candidate) return null;
    seen.add(symbolKey(candidate));
    symbols.push(candidate);
  }
  return symbols;
}

const meta: ItemTypeMeta = {
  id: 'coding',
  domain: 'Gs',
  icon: '🔑',
  sprintable: true,
};

const MAX_ATTEMPTS = 100;

function generate(seed: string, difficulty: Difficulty, locale: Locale): Item {
  const t = dict(locale).gen.coding;
  const rng = createRng(`coding:${seed}:${difficulty}`);
  const plan = planFor(difficulty);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const symbols = buildKey(plan, rng);
    if (!symbols) continue;

    const digits = rng.shuffle(DIGITS).slice(0, plan.keySize);
    const probeIndex = rng.int(0, plan.keySize - 1);
    const probeDigit = digits[probeIndex]!;

    /*
     * Neighbours by *position in the key*, not by numeric value: the key is displayed in
     * its own order, and losing your place means landing on the column beside the right
     * one. The digits themselves are shuffled, so numeric adjacency means nothing here.
     */
    const neighbours = [probeIndex - 1, probeIndex + 1].filter(
      (i) => i >= 0 && i < plan.keySize,
    );
    const others = symbols
      .map((_, i) => i)
      .filter((i) => i !== probeIndex && !neighbours.includes(i));

    const distractorIndices = [
      ...rng.shuffle(neighbours),
      ...rng.shuffle(others),
    ].slice(0, OPTION_COUNT - 1);
    if (distractorIndices.length < OPTION_COUNT - 1) continue;

    const picks = rng.shuffle([probeIndex, ...distractorIndices]);
    const options: Option[] = picks.map((i) => ({ kind: 'figure', figure: toFigure(symbols[i]!) }));
    const answerIndex = picks.indexOf(probeIndex);

    const errorTypes: ErrorType[] = picks.map((i) =>
      i === probeIndex ? 'correct' : neighbours.includes(i) ? 'off-by-one' : 'plausible',
    );

    /*
     * The independent check. `answerIndex` was derived by construction above, so this
     * re-derives it the other way round — by looking the probe up in the key the reader is
     * actually shown — and refuses the item if the two disagree.
     */
    const shown = symbols.map((s, i) => ({ digit: digits[i]!, key: symbolKey(s) }));
    const looked = shown.find((p) => p.digit === probeDigit);
    if (!looked || looked.key !== symbolKey(symbols[probeIndex]!)) continue;
    if (symbolKey(symbols[picks[answerIndex]!]!) !== looked.key) continue;

    return {
      type: 'coding',
      seed,
      difficulty,
      prompt: t.prompt(probeDigit),
      stimulus: {
        kind: 'coding',
        pairs: symbols.map((s, i) => ({ digit: digits[i]!, figure: toFigure(s) })),
        probe: probeDigit,
      },
      responseMode: 'choice',
      options,
      answerIndex,
      errorTypes,
      explanation: {
        summary: t.summary(probeDigit, probeIndex + 1),
        rules: [t.ruleLookup, t.ruleColumn, t.ruleSpeed],
      },
      // Deliberately short: a substitution the reader dwells on is not measuring the thing
      // the format exists to measure. Grows only with the scanning the key forces.
      suggestedSeconds: 5 + plan.keySize,
    };
  }

  throw new Error(
    `coding generator exhausted ${MAX_ATTEMPTS} attempts for seed "${seed}" d${difficulty}`,
  );
}

export const codingGenerator: Generator = { meta, generate };
