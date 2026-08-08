/**
 * An independent solver for integer sequences.
 *
 * This is deliberately NOT shared with the generator. Verifying an item with the code
 * that produced it proves nothing; the point is to re-derive the rule from the visible
 * terms alone, exactly as a test-taker would, and reject the item if two different rules
 * both fit and disagree about the next term (docs/GENERATABILITY.md §4, Guard 1).
 *
 * This is what makes `2, 4, 8, ?` impossible to emit: x2 predicts 16 and the
 * second-difference rule predicts 14, so the item is under-determined and regenerated.
 */

export interface Hypothesis {
  /** Human-readable rule, used in the explanation when it is the intended one. */
  label: string;
  next: number;
}

const MAX_ABS = 1e7;

function ok(n: number): boolean {
  return Number.isFinite(n) && Number.isInteger(n) && Math.abs(n) <= MAX_ABS;
}

function diffs(xs: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < xs.length; i++) out.push(xs[i]! - xs[i - 1]!);
  return out;
}

function allEqual(xs: number[]): boolean {
  return xs.length > 0 && xs.every((x) => x === xs[0]);
}

/** a[i+1] = m * a[i] + c. Covers arithmetic (m=1) and geometric (c=0) in one family. */
function linearRecurrence(xs: number[]): Hypothesis[] {
  const out: Hypothesis[] = [];
  if (xs.length < 3) return out;
  for (let m = -3; m <= 5; m++) {
    for (let c = -30; c <= 30; c++) {
      let fits = true;
      for (let i = 1; i < xs.length; i++) {
        if (xs[i] !== m * xs[i - 1]! + c) {
          fits = false;
          break;
        }
      }
      if (!fits) continue;
      const next = m * xs[xs.length - 1]! + c;
      if (!ok(next)) continue;
      const label =
        m === 1
          ? `Each term is the previous one ${c >= 0 ? `plus ${c}` : `minus ${-c}`}.`
          : c === 0
            ? `Each term is the previous one multiplied by ${m}.`
            : `Each term is the previous one times ${m}, ${c >= 0 ? `plus ${c}` : `minus ${-c}`}.`;
      out.push({ label, next });
    }
  }
  return out;
}

/**
 * Constant k-th difference — the NPCP / polynomial family.
 *
 * The length guard is `order + 1`, the minimum needed to *compute* the k-th difference,
 * not `order + 2`, which would be the minimum needed to see it repeat. That is deliberate:
 * this solver exists to reject ambiguous items, so it must consider every hypothesis a
 * test-taker might reasonably entertain — including one supported by a single observation.
 * Being permissive here makes the guard stricter.
 */
function polynomial(xs: number[], order: number): Hypothesis[] {
  if (xs.length < order + 1) return [];
  let level = xs;
  const lasts: number[] = [];
  for (let k = 0; k < order; k++) {
    lasts.push(level[level.length - 1]!);
    level = diffs(level);
  }
  if (!allEqual(level)) return [];
  // Rebuild upward from the constant level.
  let carry = level[0]!;
  for (let k = order - 1; k >= 0; k--) {
    carry = lasts[k]! + carry;
  }
  if (!ok(carry)) return [];
  const label =
    order === 1
      ? `The differences between terms are constant (${level[0]}).`
      : order === 2
        ? `The differences grow by a constant amount (${level[0]}) each step.`
        : `The ${order}rd differences between terms are constant.`;
  return [{ label, next: carry }];
}

/** a[i] = a[i-1] + a[i-2] — the Fibonacci family. */
function fibonacci(xs: number[]): Hypothesis[] {
  if (xs.length < 4) return [];
  for (let i = 2; i < xs.length; i++) {
    if (xs[i] !== xs[i - 1]! + xs[i - 2]!) return [];
  }
  const next = xs[xs.length - 1]! + xs[xs.length - 2]!;
  if (!ok(next)) return [];
  return [{ label: 'Each term is the sum of the two before it.', next }];
}

/** Two independent series interleaved — the ANSIG Parallel Sequences operator. */
function interleaved(xs: number[]): Hypothesis[] {
  if (xs.length < 5) return [];
  const even = xs.filter((_, i) => i % 2 === 0);
  const odd = xs.filter((_, i) => i % 2 === 1);
  if (even.length < 2 || odd.length < 2) return [];

  const solveSub = (sub: number[]): Hypothesis[] => {
    const out: Hypothesis[] = [];
    const d = diffs(sub);
    if (allEqual(d)) {
      const next = sub[sub.length - 1]! + d[0]!;
      if (ok(next)) out.push({ label: `+${d[0]}`, next });
    }
    if (sub.every((v) => v !== 0)) {
      const r = sub[1]! / sub[0]!;
      if (Number.isInteger(r) && Math.abs(r) >= 2) {
        let fits = true;
        for (let i = 1; i < sub.length; i++) {
          if (sub[i] !== sub[i - 1]! * r) fits = false;
        }
        const next = sub[sub.length - 1]! * r;
        if (fits && ok(next)) out.push({ label: `x${r}`, next });
      }
    }
    return out;
  };

  // The next term continues whichever sub-series is due.
  const dueEven = xs.length % 2 === 0;
  const target = dueEven ? even : odd;
  const other = dueEven ? odd : even;
  const targetSol = solveSub(target);
  const otherSol = solveSub(other);
  if (targetSol.length === 0 || otherSol.length === 0) return [];

  const out: Hypothesis[] = [];
  for (const t of targetSol) {
    for (const o of otherSol) {
      out.push({
        label: `Two sequences alternate: every other term goes ${t.label}, the ones between go ${o.label}.`,
        next: t.next,
      });
    }
  }
  return out;
}

/** a[i+1] = a[i] * k where k itself increases — the ANSIG PCP operator. */
function progressiveCoefficient(xs: number[]): Hypothesis[] {
  if (xs.length < 4) return [];
  if (xs.some((v) => v === 0)) return [];
  const ratios: number[] = [];
  for (let i = 1; i < xs.length; i++) {
    const r = xs[i]! / xs[i - 1]!;
    if (!Number.isInteger(r)) return [];
    ratios.push(r);
  }
  const rd = diffs(ratios);
  if (!allEqual(rd) || rd[0] === 0) return [];
  const nextRatio = ratios[ratios.length - 1]! + rd[0]!;
  const next = xs[xs.length - 1]! * nextRatio;
  if (!ok(next)) return [];
  return [
    {
      label: `Each term is multiplied by a factor that grows by ${rd[0]} each step (x${ratios[0]}, x${ratios[1]}, ...).`,
      next,
    },
  ];
}

/** Repeating blocks — the ANSIG Cluster Formation operator. */
function clustered(xs: number[]): Hypothesis[] {
  if (xs.length < 4) return [];
  const out: Hypothesis[] = [];
  for (const size of [2, 3]) {
    // Blocks of `size` where each block is the previous block shifted by a constant.
    if (xs.length < size * 2) continue;
    const blockCount = Math.floor(xs.length / size);
    if (blockCount < 2) continue;
    const step = xs[size]! - xs[0]!;
    let fits = true;
    for (let i = size; i < xs.length; i++) {
      if (xs[i] !== xs[i - size]! + step) {
        fits = false;
        break;
      }
    }
    if (!fits) continue;
    const next = xs[xs.length - size]! + step;
    if (!ok(next)) continue;
    out.push({
      label: `The sequence repeats in blocks of ${size}, each block ${step >= 0 ? `${step} higher` : `${-step} lower`} than the last.`,
      next,
    });
  }
  return out;
}

export interface SeriesSolution {
  hypotheses: Hypothesis[];
  /** Distinct predicted next terms, sorted. */
  predictions: number[];
}

export function solveSeries(terms: number[]): SeriesSolution {
  const hypotheses = [
    ...linearRecurrence(terms),
    ...polynomial(terms, 1),
    ...polynomial(terms, 2),
    ...polynomial(terms, 3),
    ...fibonacci(terms),
    ...interleaved(terms),
    ...progressiveCoefficient(terms),
    ...clustered(terms),
  ];
  const predictions = [...new Set(hypotheses.map((h) => h.next))].sort((a, b) => a - b);
  return { hypotheses, predictions };
}

/** True when every rule that fits the visible terms agrees on the next one. */
export function isUnambiguous(terms: number[]): boolean {
  return solveSeries(terms).predictions.length === 1;
}
