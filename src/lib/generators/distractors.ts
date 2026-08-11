/**
 * Assembling an option set without telling the reader which option is the answer.
 *
 * Every format here builds its distractors by perturbing the answer — that is the whole point, since
 * a distractor has to embody a *specific* misreading to be worth diagnosing. The trap is that a
 * perturbation with a fixed shape leaves a fixed footprint: if the two keyed mistakes always land
 * above the answer, the answer is always the second-smallest number offered, and a reader who
 * notices never has to look at the stimulus again.
 *
 * That is not a hypothetical. It was true of `head-count` in every item it ever generated, and a
 * stimulus-blind solver scored 100% on it. The same shape, in different clothes, was the largest
 * defect in half the formats on the site — see `tests/leakage.test.ts`, which is the regression.
 *
 * The fix is to stop letting the distractor construction decide where the answer lands. Draw the
 * answer's **rank** within the sorted option set first, uniformly, and then choose which candidates
 * to spend on realising it. The mistakes offered are still the diagnostic ones; what changes is that
 * their arrangement carries no information.
 */
import type { Rng } from '../rng';
import type { ErrorType } from '../types';

export interface Distractor {
  value: number;
  errorType: ErrorType;
}

export interface OptionSet {
  /** The answer first, then the chosen distractors. Shuffle before presenting. */
  values: number[];
  errors: Map<number, ErrorType>;
}

/**
 * Build a numeric option set of `total` values whose answer sits at a uniformly drawn rank.
 *
 * `below` and `above` are candidate distractors on each side of the answer, **in the caller's order
 * of preference** — the diagnostic near-misses first, generic filler after — so that a rank is
 * realised with the most informative wrong answers available for that side. Duplicates and values
 * already used are dropped, keeping the first occurrence.
 *
 * Returns `null` when no rank is reachable, which is the caller's signal to redraw the item rather
 * than ship a set that is short or lopsided.
 */
export function numericOptions(
  rng: Rng,
  answer: number,
  below: Distractor[],
  above: Distractor[],
  total: number,
): OptionSet | null {
  const seen = new Set<number>([answer]);
  const dedupe = (ds: Distractor[]): Distractor[] => {
    const out: Distractor[] = [];
    for (const d of ds) {
      if (!Number.isFinite(d.value) || seen.has(d.value)) continue;
      seen.add(d.value);
      out.push(d);
    }
    return out;
  };

  const lo = dedupe(below);
  const hi = dedupe(above);
  const need = total - 1;

  /*
   * Every rank the candidate pools can actually support. Picking uniformly from *this* rather than
   * from 0..need matters: a format whose answer is near a floor (a head count cannot go below one)
   * genuinely cannot put three options underneath it, and pretending otherwise would only move the
   * bias somewhere less visible.
   */
  const ranks: number[] = [];
  for (let r = 0; r <= need; r++) {
    if (lo.length >= r && hi.length >= need - r) ranks.push(r);
  }
  if (ranks.length === 0) return null;

  const rank = rng.pick(ranks);
  const chosen = [...lo.slice(0, rank), ...hi.slice(0, need - rank)];
  if (chosen.length !== need) return null;

  const errors = new Map<number, ErrorType>([[answer, 'correct']]);
  for (const d of chosen) errors.set(d.value, d.errorType);
  return { values: [answer, ...chosen.map((d) => d.value)], errors };
}

/**
 * A run of consecutive integers containing the answer at a uniformly drawn rank.
 *
 * Rank alone is not enough to make an option set uninformative, which is worth spelling out because
 * it is a subtle second helping of the same bug. Distractors built as *answer ± something* are all
 * close to the answer but not necessarily close to each other, so the answer sits at the centre of
 * mass of the set — pick the option nearest the mean of the others and you have it, whatever rank it
 * was placed at. It is the I-RAVEN "attribute-wise mode" attack, in one dimension.
 *
 * A contiguous window has no centre to find: the geometry is fixed before the answer is placed in
 * it, so every position in the set looks alike, and only the values move. `diagnose` then names each
 * offered value for what it would mean if a reader arrived at it, so the review screen keeps its
 * diagnoses — they are read off the window rather than deciding it.
 */
export function windowOptions(
  rng: Rng,
  answer: number,
  total: number,
  diagnose: (value: number) => ErrorType,
  floor = -Infinity,
): OptionSet | null {
  const need = total - 1;
  const ranks: number[] = [];
  for (let r = 0; r <= need; r++) {
    if (answer - r >= floor) ranks.push(r);
  }
  if (ranks.length === 0) return null;

  const rank = rng.pick(ranks);
  const start = answer - rank;
  const values: number[] = [];
  for (let i = 0; i < total; i++) values.push(start + i);

  const errors = new Map<number, ErrorType>([[answer, 'correct']]);
  for (const v of values) {
    if (v === answer) continue;
    errors.set(v, diagnose(v));
  }
  return { values: [answer, ...values.filter((v) => v !== answer)], errors };
}

/** Filler near-misses at ±1, ±2, … — used when the keyed mistakes cannot fill a side. */
export function nearMisses(answer: number, side: 1 | -1, span = 6, floor = -Infinity): Distractor[] {
  const out: Distractor[] = [];
  for (let k = 1; k <= span; k++) {
    const value = answer + side * k;
    if (value < floor) break;
    out.push({ value, errorType: k === 1 ? 'off-by-one' : 'plausible' });
  }
  return out;
}
