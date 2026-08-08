/**
 * The RAVEN / I-RAVEN rule algebra, over integer-valued attributes (docs/IQ-TESTS.md §5.1).
 *
 * Rules apply ROW-WISE across a 3x3 matrix. Each rule can both *generate* a consistent
 * matrix and, independently, *check and predict* one — the latter is what the solver uses
 * to prove an item has exactly one defensible answer.
 */
import type { Rng } from './rng';
import { dict } from './i18n';
import type { Locale } from './i18n';

export type RuleName = 'constant' | 'progression' | 'arithmetic' | 'distribute-three';

export interface Rule {
  name: RuleName;
  /** progression: the step. arithmetic: +1 (add) or -1 (subtract). Otherwise 0. */
  param: number;
}

/** A 3x3 attribute matrix. `m[2][2]` is the hidden answer cell. */
export type Matrix3 = [number, number, number][] & { length: 3 };

export const PROGRESSION_STEPS = [-2, -1, 1, 2] as const;
/** Steps the solver will consider — wider than the generator uses, on purpose. */
const SOLVER_STEPS = [-4, -3, -2, -1, 1, 2, 3, 4] as const;

export function ruleLabel(rule: Rule, attribute: string, locale: Locale): string {
  const r = dict(locale).gen.rules;
  switch (rule.name) {
    case 'constant':
      return r.constant(attribute);
    case 'progression':
      return r.progression(attribute, rule.param);
    case 'arithmetic':
      return rule.param > 0 ? r.arithmeticAdd(attribute) : r.arithmeticSub(attribute);
    case 'distribute-three':
      return r.distributeThree(attribute);
  }
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

/**
 * Builds a 3x3 matrix of integers in `[min, max]` satisfying `rule` row-wise.
 * Returns `null` when the domain is too narrow for the rule (the caller retries with
 * a different rule rather than silently emitting a degenerate item).
 */
export function generateMatrix(rule: Rule, min: number, max: number, rng: Rng): Matrix3 | null {
  switch (rule.name) {
    case 'constant': {
      // Rows must differ, else the attribute is globally constant and carries no rule.
      if (max - min + 1 < 3) return null;
      const vals = rng.sample(range(min, max), 3);
      return vals.map((v) => [v, v, v]) as Matrix3;
    }

    case 'progression': {
      const s = rule.param;
      const lo = Math.max(min, min - 2 * s);
      const hi = Math.min(max, max - 2 * s);
      if (hi < lo) return null;
      const bases = range(lo, hi);
      if (bases.length < 3) return null;
      const picked = rng.sample(bases, 3);
      return picked.map((b) => [b, b + s, b + 2 * s]) as Matrix3;
    }

    case 'arithmetic': {
      const sign = rule.param;
      const rows: [number, number, number][] = [];
      const seen = new Set<string>();
      // Rejection-sample three distinct rows; bounded so a hostile domain cannot hang.
      for (let attempt = 0; attempt < 400 && rows.length < 3; attempt++) {
        const a = rng.int(min, max);
        const b = rng.int(min, max);
        const c = a + sign * b;
        if (c < min || c > max) continue;
        // Degenerate rows leak nothing and look like "constant"; skip them.
        if (b === 0 || a === b || b === c) continue;
        const key = `${a},${b},${c}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push([a, b, c]);
      }
      return rows.length === 3 ? (rows as Matrix3) : null;
    }

    case 'distribute-three': {
      if (max - min + 1 < 3) return null;
      const [v0, v1, v2] = rng.sample(range(min, max), 3) as [number, number, number];
      const set: [number, number, number] = [v0, v1, v2];
      const dir = rule.param >= 0 ? 1 : 2; // shift left by 1 or 2 each row
      return [0, 1, 2].map((r) => {
        const shift = (r * dir) % 3;
        return [set[shift % 3], set[(shift + 1) % 3], set[(shift + 2) % 3]];
      }) as Matrix3;
    }
  }
}

// ---------------------------------------------------------------------------
// Checking & prediction — used by the independent solver
// ---------------------------------------------------------------------------

/** The observable part of a matrix: eight cells, with the ninth hidden. */
export interface Observed {
  rows: [number[], number[], number[]];
}

export function toObserved(m: Matrix3): Observed {
  return { rows: [[...m[0]!], [...m[1]!], [m[2]![0], m[2]![1]]] };
}

/**
 * If `rule` is consistent with every visible cell, returns its prediction for the hidden
 * cell; otherwise `null`.
 */
export function predict(rule: Rule, obs: Observed): number | null {
  const [r0, r1, r2] = obs.rows;
  if (r0.length !== 3 || r1.length !== 3 || r2.length !== 2) return null;

  switch (rule.name) {
    case 'constant': {
      for (const row of [r0, r1]) {
        if (row[0] !== row[1] || row[1] !== row[2]) return null;
      }
      if (r2[0] !== r2[1]) return null;
      return r2[0]!;
    }

    case 'progression': {
      const s = rule.param;
      for (const row of [r0, r1]) {
        if (row[1]! - row[0]! !== s || row[2]! - row[1]! !== s) return null;
      }
      if (r2[1]! - r2[0]! !== s) return null;
      return r2[1]! + s;
    }

    case 'arithmetic': {
      const sign = rule.param;
      for (const row of [r0, r1]) {
        if (row[2] !== row[0]! + sign * row[1]!) return null;
      }
      return r2[0]! + sign * r2[1]!;
    }

    case 'distribute-three': {
      const set0 = [...r0].sort((a, b) => a - b);
      const set1 = [...r1].sort((a, b) => a - b);
      if (new Set(set0).size !== 3) return null;
      if (set0.join(',') !== set1.join(',')) return null;
      const remaining = [...set0];
      for (const v of r2) {
        const i = remaining.indexOf(v);
        if (i < 0) return null; // row 2 uses a value outside the set
        remaining.splice(i, 1);
      }
      return remaining.length === 1 ? remaining[0]! : null;
    }
  }
}

/** Every rule the solver will consider. Deliberately broader than what the generator emits. */
export function allCandidateRules(): Rule[] {
  const out: Rule[] = [{ name: 'constant', param: 0 }];
  for (const s of SOLVER_STEPS) out.push({ name: 'progression', param: s });
  out.push({ name: 'arithmetic', param: 1 }, { name: 'arithmetic', param: -1 });
  out.push({ name: 'distribute-three', param: 1 });
  return out;
}

export interface SolveResult {
  /** Every distinct value predicted by some consistent rule. */
  predictions: number[];
  /** Rules that fit all visible cells. */
  fitting: Rule[];
}

/**
 * Solves one attribute independently of how it was generated. This is the guard against
 * under-determination: if two consistent rules predict different values, the item is
 * ambiguous and must be regenerated (docs/GENERATABILITY.md §4, Guard 1).
 */
export function solveAttribute(obs: Observed): SolveResult {
  const predictions = new Set<number>();
  const fitting: Rule[] = [];
  for (const rule of allCandidateRules()) {
    const p = predict(rule, obs);
    if (p === null) continue;
    fitting.push(rule);
    predictions.add(p);
  }
  return { predictions: [...predictions].sort((a, b) => a - b), fitting };
}

export function range(min: number, max: number): number[] {
  const out: number[] = [];
  for (let v = min; v <= max; v++) out.push(v);
  return out;
}
