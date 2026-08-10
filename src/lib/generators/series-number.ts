/**
 * Number series — complete the sequence.
 *
 * Difficulty follows the ANSIG cognitive operators, which explain ~77% of item-difficulty
 * variance under a Linear Logistic Test Model (docs/IQ-TESTS.md §5.2):
 *   AOS < PS < CF < NPCP < PCP.
 *
 * Every candidate item is checked by an independent solver before being emitted, so a
 * sequence like `2, 4, 8, ?` — which admits both x2 and +2/+4/+6 — is never shown.
 */
import { createRng, type Rng } from '../rng';
import { isUnambiguous, solveSeries } from '../solvers/series';
import { dict, type Locale } from '../i18n';
import type { Difficulty, ErrorType, Generator, Item, ItemTypeMeta, Option } from '../types';

/** The number-series slice of a dictionary, threaded into the builders. */
type T = ReturnType<typeof dict>['gen']['seriesNumber'];

/** ANSIG cognitive operators, in ascending difficulty. */
type Operator = 'AOS' | 'PS' | 'CF' | 'NPCP' | 'PCP';

const OPERATOR_BY_DIFFICULTY: Record<Difficulty, Operator[]> = {
  1: ['AOS'],
  2: ['AOS'],
  3: ['PS', 'CF'],
  4: ['NPCP', 'CF'],
  5: ['PCP', 'NPCP'],
};

/** Number of terms shown before the blank. More terms means less under-determination. */
const VISIBLE_TERMS = 6;

interface Built {
  terms: number[];
  answer: number;
  rule: string;
}

function buildAos(rng: Rng, difficulty: Difficulty, t: T): Built | null {
  // Difficulty 1 is a plain constant difference; difficulty 2 adds a multiplier.
  const useMultiplier = difficulty >= 2 && rng.bool(0.55);
  const start = rng.int(1, 20);
  if (!useMultiplier) {
    const d = rng.pick([2, 3, 4, 5, 6, 7, 8, 9, 11, 12, -3, -4, -5, -6, -7]);
    const terms = Array.from({ length: VISIBLE_TERMS + 1 }, (_, i) => start + i * d);
    return finish(terms, t.plusMinus(d));
  }
  const m = rng.pick([2, 3, -2]);
  const c = rng.pick([0, 0, 1, -1, 2, 3, -3]);
  const terms: number[] = [start];
  for (let i = 1; i <= VISIBLE_TERMS; i++) terms.push(terms[i - 1]! * m + c);
  return finish(terms, c === 0 ? t.times(m) : t.timesPlus(m, c));
}

function buildPs(rng: Rng, t: T): Built | null {
  // Two interleaved series: the ANSIG Parallel Sequences operator.
  const aStart = rng.int(2, 30);
  const bStart = rng.int(2, 30);
  const aStep = rng.pick([2, 3, 4, 5, 6, 7, -3, -4, -5]);
  const bStep = rng.pick([2, 3, 4, 5, 6, 7, -3, -4, -5]);
  if (aStep === bStep) return null; // degenerates into one arithmetic series
  const terms: number[] = [];
  for (let i = 0; i <= VISIBLE_TERMS; i++) {
    terms.push(i % 2 === 0 ? aStart + (i / 2) * aStep : bStart + ((i - 1) / 2) * bStep);
  }
  return finish(terms, t.alternating(aStep, bStep));
}

function buildCf(rng: Rng, t: T): Built | null {
  // Cluster Formation: repeating blocks, each shifted by a constant.
  const size = rng.pick([2, 3]);
  const step = rng.pick([3, 4, 5, 6, 7, 10, -4, -5]);
  const block = Array.from({ length: size }, () => rng.int(1, 20));
  if (new Set(block).size !== block.length) return null;
  const terms: number[] = [];
  for (let i = 0; i <= VISIBLE_TERMS; i++) {
    terms.push(block[i % size]! + Math.floor(i / size) * step);
  }
  return finish(terms, t.blocks(size, step));
}

function buildNpcp(rng: Rng, t: T): Built | null {
  // Non-Progressive Coefficient Pattern: constant second difference.
  const start = rng.int(1, 15);
  const d0 = rng.int(1, 8);
  const dd = rng.pick([1, 2, 3, 4, -2, -3]);
  const terms: number[] = [start];
  let d = d0;
  for (let i = 1; i <= VISIBLE_TERMS; i++) {
    terms.push(terms[i - 1]! + d);
    d += dd;
  }
  return finish(terms, t.growingGap(d0, d0 + dd, d0 + 2 * dd, dd));
}

function buildPcp(rng: Rng, t: T): Built | null {
  // Progressive Coefficient Pattern — the hardest ANSIG operator — or Fibonacci.
  if (rng.bool(0.4)) {
    const a = rng.int(1, 6);
    const b = rng.int(a + 1, 12);
    const terms: number[] = [a, b];
    for (let i = 2; i <= VISIBLE_TERMS; i++) terms.push(terms[i - 1]! + terms[i - 2]!);
    return finish(terms, t.fibonacci);
  }
  const start = rng.int(1, 4);
  const r0 = rng.pick([2, 3]);
  const dr = rng.pick([1, 2]);
  const terms: number[] = [start];
  let r = r0;
  for (let i = 1; i <= VISIBLE_TERMS; i++) {
    terms.push(terms[i - 1]! * r);
    r += dr;
  }
  return finish(terms, t.growingFactor(r0, r0 + dr, r0 + 2 * dr));
}

const MAX_TERM = 500_000;

function finish(terms: number[], rule: string): Built | null {
  if (terms.length !== VISIBLE_TERMS + 1) return null;
  if (terms.some((t) => !Number.isInteger(t) || Math.abs(t) > MAX_TERM)) return null;
  // A sequence that repeats a value is usually a sign of a degenerate rule.
  const visible = terms.slice(0, VISIBLE_TERMS);
  if (new Set(visible).size !== visible.length) return null;
  return { terms: visible, answer: terms[VISIBLE_TERMS]!, rule };
}

function buildFor(operator: Operator, rng: Rng, difficulty: Difficulty, t: T): Built | null {
  switch (operator) {
    case 'AOS':
      return buildAos(rng, difficulty, t);
    case 'PS':
      return buildPs(rng, t);
    case 'CF':
      return buildCf(rng, t);
    case 'NPCP':
      return buildNpcp(rng, t);
    case 'PCP':
      return buildPcp(rng, t);
  }
}

/**
 * Distractors are near-misses drawn from real reasoning slips, then chosen so the
 * correct answer lands at a seeded rank in the sorted option list. Without that, the
 * answer would sit at an extreme far too often and be guessable from the options alone.
 */
function buildOptions(
  built: Built,
  rng: Rng,
): { options: Option[]; answerIndex: number; errorTypes: ErrorType[] } | null {
  const { terms, answer } = built;
  const last = terms[terms.length - 1]!;
  const lastDiff = last - terms[terms.length - 2]!;

  const pool: { value: number; errorType: ErrorType }[] = [
    { value: answer + 1, errorType: 'off-by-one' },
    { value: answer - 1, errorType: 'off-by-one' },
    { value: last + lastDiff, errorType: 'wrong-rule' },
    { value: last - lastDiff, errorType: 'wrong-rule' },
    { value: answer + lastDiff, errorType: 'off-by-one' },
    { value: answer - lastDiff, errorType: 'off-by-one' },
    { value: last * 2, errorType: 'wrong-rule' },
    { value: answer + 2, errorType: 'plausible' },
    { value: answer - 2, errorType: 'plausible' },
    { value: answer + Math.max(3, Math.round(Math.abs(lastDiff) / 2)), errorType: 'plausible' },
    { value: answer - Math.max(3, Math.round(Math.abs(lastDiff) / 2)), errorType: 'plausible' },
  ];

  const seen = new Set<number>([answer, ...terms]);
  const usable: { value: number; errorType: ErrorType }[] = [];
  for (const c of rng.shuffle(pool)) {
    if (seen.has(c.value)) continue;
    if (!Number.isInteger(c.value) || Math.abs(c.value) > MAX_TERM * 4) continue;
    seen.add(c.value);
    usable.push(c);
  }

  const below = usable.filter((c) => c.value < answer);
  const above = usable.filter((c) => c.value > answer);

  // Target rank for the correct answer, so it is not systematically the largest.
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
    options: all.map((c) => ({ kind: 'text', text: String(c.value) })),
    answerIndex: all.findIndex((c) => c.errorType === 'correct'),
    errorTypes: all.map((c) => c.errorType),
  };
}

const meta: ItemTypeMeta = {
  id: 'series-number',
  domain: 'Gf',
  icon: '∑',
  sprintable: false,
};

const MAX_ATTEMPTS = 200;

function generate(seed: string, difficulty: Difficulty, locale: Locale): Item {
  const t = dict(locale).gen.seriesNumber;
  const rng = createRng(`series-number:${seed}:${difficulty}`);
  const operators = OPERATOR_BY_DIFFICULTY[difficulty];

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const operator = rng.pick(operators);
    const built = buildFor(operator, rng, difficulty, t);
    if (!built) continue;

    // Guard 1: reject anything a second rule could legitimately continue differently.
    if (!isUnambiguous(built.terms)) continue;
    const solved = solveSeries(built.terms);
    if (solved.predictions[0] !== built.answer) continue;

    const opts = buildOptions(built, rng);
    if (!opts) continue;

    return {
      type: 'series-number',
      seed,
      difficulty,
      prompt: t.prompt,
      stimulus: { kind: 'sequence', terms: [...built.terms.map(String), null] },
      responseMode: 'choice',
      options: opts.options,
      answerIndex: opts.answerIndex,
      errorTypes: opts.errorTypes,
      explanation: {
        summary: t.summary(built.answer),
        rules: [built.rule, t.sequence([...built.terms, built.answer].join(', '))],
      },
      suggestedSeconds: 25 + difficulty * 10,
    };
  }

  throw new Error(
    `series-number generator exhausted ${MAX_ATTEMPTS} attempts for seed "${seed}" d${difficulty}`,
  );
}

export const numberSeriesGenerator: Generator = { meta, generate };
