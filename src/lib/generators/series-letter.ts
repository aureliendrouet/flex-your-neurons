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

/**
 * How many terms are shown before the blank.
 *
 * A range rather than a constant, and the reason is bank size. The alphabet is only twenty-six
 * letters long, so a constant-step family with a fixed length has very few members — six steps of
 * four already spans most of it — and difficulties 1 and 2 drew every item from 67 sequences, which
 * a reader meets again within a single sitting. Letting the length vary multiplies the bank without
 * touching what the item asks.
 */
const VISIBLE_TERM_CHOICES = [5, 6];

interface Built {
  codes: number[];
  answer: number;
  rule: string;
}

function inRange(codes: number[]): boolean {
  return codes.every((c) => Number.isInteger(c) && c >= 0 && c < ALPHABET_SIZE);
}

/**
 * One stream with a constant step.
 *
 * The step pool is symmetric and holds no unreachable entries. It used to offer `5`, which cannot
 * fit — six steps of five span thirty letters and the alphabet has twenty-six — and to omit `-1`,
 * so single-step sequences only ever ran forwards. Both cost variety in a family that has little to
 * spare: this builder supplied every item at difficulties 1 and 2, out of a bank of 67 sequences.
 */
function buildConstantStep(rng: Rng, t: T, steps: number[], visible: number): Built | null {
  const step = rng.pick(steps);
  const span = step * visible;
  const lo = Math.max(0, -span);
  const hi = Math.min(ALPHABET_SIZE - 1, ALPHABET_SIZE - 1 - span);
  if (hi < lo) return null;
  const start = rng.int(lo, hi);
  const codes = Array.from({ length: visible + 1 }, (_, i) => start + i * step);
  if (!inRange(codes)) return null;
  return {
    codes: codes.slice(0, visible),
    answer: codes[visible]!,
    rule: t.step(step),
  };
}

/** Two interleaved streams — the letter analogue of ANSIG Parallel Sequences. */
function buildInterleaved(rng: Rng, t: T, visible: number): Built | null {
  const aStep = rng.pick([1, 2, 3, 4, -2, -3]);
  const bStep = rng.pick([1, 2, 3, 4, -2, -3]);
  if (aStep === bStep) return null;
  const aStart = rng.int(0, ALPHABET_SIZE - 1);
  const bStart = rng.int(0, ALPHABET_SIZE - 1);
  const codes: number[] = [];
  for (let i = 0; i <= visible; i++) {
    codes.push(i % 2 === 0 ? aStart + (i / 2) * aStep : bStart + ((i - 1) / 2) * bStep);
  }
  if (!inRange(codes)) return null;
  return {
    codes: codes.slice(0, visible),
    answer: codes[visible]!,
    rule: t.alternating(aStep, bStep),
  };
}

/**
 * A step that itself grows — the letter analogue of NPCP.
 *
 * Running downward as well as upward is what makes this family more than a handful of sequences.
 * Ascending, the range check `start + 6·d0 + 15·dd ≤ 25` is satisfiable only by `d0 = dd = 1` with a
 * start in 0..3 — four sequences in total, which were 46% of every difficulty-5 item, so the answer
 * at that level was always one of V, W, X, Y. Mirroring the family doubles it, and starting anywhere
 * the range allows rather than in the first four letters does the rest.
 */
function buildGrowingStep(rng: Rng, t: T, visible: number): Built | null {
  const direction = rng.bool() ? 1 : -1;
  const d0 = rng.int(1, 3) * direction;
  const dd = rng.pick([1, 2]) * direction;
  // The total travel over the visible terms plus the answer, so a start can be chosen to fit it.
  let travel = 0;
  let d = d0;
  for (let i = 1; i <= visible; i++) {
    travel += d;
    d += dd;
  }
  const lo = Math.max(0, -travel);
  const hi = Math.min(ALPHABET_SIZE - 1, ALPHABET_SIZE - 1 - travel);
  if (hi < lo) return null;
  const start = rng.int(lo, hi);

  const codes: number[] = [start];
  d = d0;
  for (let i = 1; i <= visible; i++) {
    codes.push(codes[i - 1]! + d);
    d += dd;
  }
  if (!inRange(codes)) return null;
  return {
    codes: codes.slice(0, visible),
    answer: codes[visible]!,
    rule: t.growingStep(d0, dd),
  };
}

/*
 * Difficulties 1 and 2 were the same builder called with the same parameters, differing only in the
 * seconds suggested for them — the documented dial, "step size; # interleaved streams", moved at
 * neither. They now split the step pool: a single letter's move is a different reading task from a
 * jump of four, which is the smallest honest thing the first rung can scale.
 */
function buildFor(difficulty: Difficulty, rng: Rng, t: T, visible: number): Built | null {
  switch (difficulty) {
    case 1:
      return buildConstantStep(rng, t, [1, -1, 2, -2], visible);
    case 2:
      return buildConstantStep(rng, t, [2, -2, 3, -3, 4, -4], visible);
    case 3:
      return rng.bool() ? buildInterleaved(rng, t, visible) : buildConstantStep(rng, t, [1, -1, 2, -2, 3, -3, 4, -4], visible);
    case 4:
      return buildInterleaved(rng, t, visible);
    case 5:
      return rng.bool(0.6) ? buildGrowingStep(rng, t, visible) : buildInterleaved(rng, t, visible);
  }
}

function buildOptions(
  built: Built,
  rng: Rng,
): { options: Option[]; answerIndex: number; errorTypes: ErrorType[] } | null {
  const { codes, answer } = built;
  const last = codes[codes.length - 1]!;
  const lastStep = last - codes[codes.length - 2]!;

  /*
   * Evenly spaced letters, with the answer's place among them drawn.
   *
   * The rank was already drawn here and it was not enough, for the same reason as in the number
   * series: the candidates clustered tightly around the answer (`answer ± 1`, `± 2`, `± 3`) while
   * the rule-derived ones sat further out, so the answer had the closest neighbours in the set and
   * "pick the letter most tightly surrounded" beat chance by half again. With a constant step
   * between options there is nothing to surround.
   *
   * The alphabet is a hard boundary at both ends, so the feasible ranks are collected first and the
   * draw is made among those — a window that would run off either end is simply not offered.
   */
  const diagnose = (v: number): ErrorType => {
    if (v === answer) return 'correct';
    /* `last - lastStep` is a letter already on screen for a constant-step series, which is a copy
       rather than a different rule; `last + lastStep` is the genuine one-step-too-far reading. */
    if (codes.includes(v)) return 'copy';
    if (v === last + lastStep) return 'wrong-rule';
    if (Math.abs(v - answer) === 1) return 'off-by-one';
    return 'plausible';
  };

  const byRank = new Map<number, number[][]>();
  for (const rank of [0, 1, 2, 3, 4]) {
    const windows: number[][] = [];
    for (const gap of [1, 2, 3]) {
      const values: number[] = [];
      for (let i = 0; i < 5; i++) values.push(answer + (i - rank) * gap);
      if (values.some((v) => v < 0 || v >= ALPHABET_SIZE)) continue;
      windows.push(values);
    }
    if (windows.length > 0) byRank.set(rank, windows);
  }
  if (byRank.size === 0) return null;

  const windows = byRank.get(rng.pick([...byRank.keys()].sort((a, b) => a - b)))!;
  const scored = windows
    .map((values) => ({
      values,
      named: values.filter((v) => v !== answer && diagnose(v) !== 'plausible').length,
    }))
    .sort((a, b) => b.named - a.named);
  const best = scored.filter((s) => s.named === scored[0]!.named);
  const all = rng.pick(best).values.map((value) => ({ value, errorType: diagnose(value) }));

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
    const built = buildFor(difficulty, rng, t, rng.pick(VISIBLE_TERM_CHOICES));
    if (!built) continue;
    if (new Set(built.codes).size !== built.codes.length) continue;
    /*
     * The answer must sit far enough from both ends of the alphabet for its option window to be
     * placeable at any rank. Otherwise the boundary decides the rank for us: an answer near Z can
     * only ever be offered with letters below it, so "pick the last letter in the list" started to
     * pay, which is the positional tell arriving through the alphabet rather than through the
     * distractor pool.
     */
    if (built.answer < 4 || built.answer > ALPHABET_SIZE - 5) continue;

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
