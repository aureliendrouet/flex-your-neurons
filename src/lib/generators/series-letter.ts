/**
 * Letter series — continue an alphabetic sequence.
 *
 * Letters are mapped to positions 0-25 and the numeric series solver is reused for the
 * unambiguity guard. Sequences are constrained to stay inside A-Z rather than wrapping:
 * wrap-around would make the underlying arithmetic modular, and a modular sequence
 * genuinely admits several defensible continuations.
 */
import { createRng, type Rng } from '../rng';
import { isUnambiguous, solveSeries } from '../solvers/series';
import { dict, type Locale } from '../i18n';
import type { Difficulty, ErrorType, Generator, Item, ItemTypeMeta, Option } from '../types';

type T = ReturnType<typeof dict>['gen']['seriesLetter'];

const A = 'A'.charCodeAt(0);
const ALPHABET_SIZE = 26;

function toLetter(code: number): string {
  return String.fromCharCode(A + code);
}

const VISIBLE_TERMS = 6;

interface Built {
  codes: number[];
  answer: number;
  rule: string;
}

function inRange(codes: number[]): boolean {
  return codes.every((c) => Number.isInteger(c) && c >= 0 && c < ALPHABET_SIZE);
}

/** One stream with a constant step. */
function buildConstantStep(rng: Rng, t: T): Built | null {
  const step = rng.pick([1, 2, 3, 4, 5, -2, -3, -4]);
  const span = step * VISIBLE_TERMS;
  const lo = Math.max(0, -span);
  const hi = Math.min(ALPHABET_SIZE - 1, ALPHABET_SIZE - 1 - span);
  if (hi < lo) return null;
  const start = rng.int(lo, hi);
  const codes = Array.from({ length: VISIBLE_TERMS + 1 }, (_, i) => start + i * step);
  if (!inRange(codes)) return null;
  return {
    codes: codes.slice(0, VISIBLE_TERMS),
    answer: codes[VISIBLE_TERMS]!,
    rule: t.step(step),
  };
}

/** Two interleaved streams — the letter analogue of ANSIG Parallel Sequences. */
function buildInterleaved(rng: Rng, t: T): Built | null {
  const aStep = rng.pick([1, 2, 3, 4, -2, -3]);
  const bStep = rng.pick([1, 2, 3, 4, -2, -3]);
  if (aStep === bStep) return null;
  const aStart = rng.int(0, ALPHABET_SIZE - 1);
  const bStart = rng.int(0, ALPHABET_SIZE - 1);
  const codes: number[] = [];
  for (let i = 0; i <= VISIBLE_TERMS; i++) {
    codes.push(i % 2 === 0 ? aStart + (i / 2) * aStep : bStart + ((i - 1) / 2) * bStep);
  }
  if (!inRange(codes)) return null;
  return {
    codes: codes.slice(0, VISIBLE_TERMS),
    answer: codes[VISIBLE_TERMS]!,
    rule: t.alternating(aStep, bStep),
  };
}

/** A step that itself grows — the letter analogue of NPCP. */
function buildGrowingStep(rng: Rng, t: T): Built | null {
  const d0 = rng.int(1, 3);
  const dd = rng.pick([1, 2]);
  const start = rng.int(0, 3);
  const codes: number[] = [start];
  let d = d0;
  for (let i = 1; i <= VISIBLE_TERMS; i++) {
    codes.push(codes[i - 1]! + d);
    d += dd;
  }
  if (!inRange(codes)) return null;
  return {
    codes: codes.slice(0, VISIBLE_TERMS),
    answer: codes[VISIBLE_TERMS]!,
    rule: t.growingStep(d0, dd),
  };
}

function buildFor(difficulty: Difficulty, rng: Rng, t: T): Built | null {
  switch (difficulty) {
    case 1:
    case 2:
      return buildConstantStep(rng, t);
    case 3:
      return rng.bool() ? buildInterleaved(rng, t) : buildConstantStep(rng, t);
    case 4:
      return buildInterleaved(rng, t);
    case 5:
      return rng.bool(0.6) ? buildGrowingStep(rng, t) : buildInterleaved(rng, t);
  }
}

function buildOptions(
  built: Built,
  rng: Rng,
): { options: Option[]; answerIndex: number; errorTypes: ErrorType[] } | null {
  const { codes, answer } = built;
  const last = codes[codes.length - 1]!;
  const lastStep = last - codes[codes.length - 2]!;

  const pool: { value: number; errorType: ErrorType }[] = [
    { value: answer + 1, errorType: 'off-by-one' },
    { value: answer - 1, errorType: 'off-by-one' },
    { value: last + lastStep, errorType: 'wrong-rule' },
    { value: last - lastStep, errorType: 'wrong-rule' },
    { value: answer + 2, errorType: 'plausible' },
    { value: answer - 2, errorType: 'plausible' },
    { value: answer + 3, errorType: 'plausible' },
    { value: answer - 3, errorType: 'plausible' },
  ];

  const seen = new Set<number>([answer]);
  const usable = rng.shuffle(pool).filter((c) => {
    if (c.value < 0 || c.value >= ALPHABET_SIZE) return false;
    if (seen.has(c.value)) return false;
    seen.add(c.value);
    return true;
  });

  const below = usable.filter((c) => c.value < answer);
  const above = usable.filter((c) => c.value > answer);
  const feasible = [0, 1, 2, 3, 4].filter((r) => below.length >= r && above.length >= 4 - r);
  if (feasible.length === 0) return null;
  const rank = rng.pick(feasible);

  const chosen = [
    ...rng.shuffle(below).slice(0, rank),
    ...rng.shuffle(above).slice(0, 4 - rank),
  ];
  if (chosen.length !== 4) return null;

  const all = [...chosen, { value: answer, errorType: 'correct' as ErrorType }].sort(
    (a, b) => a.value - b.value,
  );

  return {
    options: all.map((c) => ({ kind: 'text', text: toLetter(c.value) })),
    answerIndex: all.findIndex((c) => c.errorType === 'correct'),
    errorTypes: all.map((c) => c.errorType),
  };
}

const meta: ItemTypeMeta = {
  id: 'series-letter',
  domain: 'Gf',
  icon: 'A→',
  sprintable: false,
};

const MAX_ATTEMPTS = 200;

function generate(seed: string, difficulty: Difficulty, locale: Locale): Item {
  const t = dict(locale).gen.seriesLetter;
  const rng = createRng(`series-letter:${seed}:${difficulty}`);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const built = buildFor(difficulty, rng, t);
    if (!built) continue;
    if (new Set(built.codes).size !== built.codes.length) continue;

    // Guard 1, reusing the numeric solver over alphabet positions.
    if (!isUnambiguous(built.codes)) continue;
    if (solveSeries(built.codes).predictions[0] !== built.answer) continue;

    const opts = buildOptions(built, rng);
    if (!opts) continue;

    const letters = built.codes.map(toLetter);
    return {
      type: 'series-letter',
      seed,
      difficulty,
      prompt: t.prompt,
      stimulus: { kind: 'sequence', terms: [...letters, null] },
      responseMode: 'choice',
      options: opts.options,
      answerIndex: opts.answerIndex,
      errorTypes: opts.errorTypes,
      explanation: {
        summary: t.summary(toLetter(built.answer)),
        rules: [
          built.rule,
          t.sequence([...letters, toLetter(built.answer)].join(', ')),
          t.positions([...built.codes, built.answer].map((c) => c + 1).join(', ')),
        ],
      },
      suggestedSeconds: 25 + difficulty * 8,
    };
  }

  throw new Error(
    `series-letter generator exhausted ${MAX_ATTEMPTS} attempts for seed "${seed}" d${difficulty}`,
  );
}

export const letterSeriesGenerator: Generator = { meta, generate };
