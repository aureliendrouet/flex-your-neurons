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
  /**
   * The spacing of the run. One for a count, where the neighbouring value is the neighbouring
   * answer; five for a clock, where it is not — a minute hand sits on a tick, so the option one
   * *minute* away is not a reading anybody arrives at, and offering it would mark the run as
   * decoration around a single credible value.
   */
  step = 1,
): OptionSet | null {
  const need = total - 1;
  const ranks: number[] = [];
  for (let r = 0; r <= need; r++) {
    if (answer - r * step >= floor) ranks.push(r);
  }
  if (ranks.length === 0) return null;

  const rank = rng.pick(ranks);
  const start = answer - rank * step;
  const values: number[] = [];
  for (let i = 0; i < total; i++) values.push(start + i * step);

  const errors = new Map<number, ErrorType>([[answer, 'correct']]);
  for (const v of values) {
    if (v === answer) continue;
    errors.set(v, diagnose(v));
  }
  return { values: [answer, ...values.filter((v) => v !== answer)], errors };
}

/**
 * Four values arranged as a rectangle: `{v, v+d, v+j, v+j+d}` for a large step `d` and a small one
 * `j`, each drawn with either sign.
 *
 * The construction is what makes the set uninformative. Every value has exactly one partner `d`
 * away and exactly one `j` away, so no option is distinguished by its neighbours, its rank, or its
 * distance from the others' mean — the three things the blind solver in `tests/leakage.test.ts`
 * actually looks at. What decides where the answer sorts is the pair of signs, and those are drawn
 * by *rank* rather than by picking a rectangle, because the constraints below are not symmetric: a
 * small answer loses its downward steps and would otherwise sit at the bottom of the set far too
 * often. Which of the two steps is the larger does not matter: whichever it is, the four sign
 * combinations map one-to-one onto the four ranks, so drawing a combination uniformly draws a rank
 * uniformly.
 *
 * Both steps are the caller's diagnostic slips — a dropped carry, one subtraction too many — so the
 * set names a real mistake on both axes while it closes the shortcut.
 *
 * `arithmetic.ts` grew this same construction inline before it was worth sharing, and is
 * deliberately left as it is: rewriting it in terms of this helper would change what every
 * `(seed, difficulty)` produces there, which costs an `ITEM_VERSION` bump and buys nothing.
 */
export function rectangleOptions(
  rng: Rng,
  answer: number,
  /** Candidates for one axis of the rectangle, unsigned. Both signs of each are tried. */
  steps: number[],
  /** Candidates for the other axis, unsigned. Both signs of each are tried. */
  offsets: number[],
  diagnose: (value: number, offsets: { d: number; j: number }) => ErrorType,
  /** How far from the answer an option may sit before it can be dismissed on sight. */
  band: number,
  floor = 0,
): OptionSet | null {
  const byRank = new Map<number, { d: number; j: number }[]>();
  for (const magnitude of steps) {
    for (const d of [magnitude, -magnitude]) {
      for (const small of offsets) {
        for (const j of [small, -small]) {
          const others = [answer + d, answer + j, answer + j + d];
          if (others.some((v) => v < floor)) continue;
          if (others.some((v) => Math.abs(v - answer) > band)) continue;
          if (new Set([answer, ...others]).size !== 4) continue;
          const rank = (d < 0 ? 2 : 0) + (j < 0 ? 1 : 0);
          const bucket = byRank.get(rank);
          if (bucket) bucket.push({ d, j });
          else byRank.set(rank, [{ d, j }]);
        }
      }
    }
  }
  // Every rank must be reachable, or the drawn rank is not uniform over the set the reader sees.
  if (byRank.size !== 4) return null;

  const { d, j } = rng.pick(byRank.get(rng.int(0, 3))!);
  const values = [answer, answer + d, answer + j, answer + j + d];
  const errors = new Map<number, ErrorType>([[answer, 'correct']]);
  for (const value of values.slice(1)) errors.set(value, diagnose(value, { d, j }));
  return { values, errors };
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
