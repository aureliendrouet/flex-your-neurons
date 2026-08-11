/**
 * Guard 2, enforced for every format at once.
 *
 * `docs/GENERATABILITY.md` §4 promises that the answer is never recoverable from the option set
 * alone — the I-RAVEN flaw, where distractors made by perturbing the answer leave the answer as the
 * attribute-wise mode of the candidates, and a solver that never reads the stimulus scores well.
 *
 * The promise was previously checked per format, by hand, in a handful of places. That failed in the
 * way hand-written guards fail: each one tested the attack its author had in mind, and several
 * tested an attack the design already precluded while a different one ran wide open. The matrix
 * guard scored options by shared-value count — which the balanced cube makes uniform by
 * construction — and reported chance against a real leak of three times chance.
 *
 * So this file does not ask "is the attack I thought of defeated?". It runs a *family* of
 * stimulus-blind strategies over generic features of the option list, takes the best one, and holds
 * every format to it. A strategy here may only look at `item.options`. It never sees the stimulus,
 * the prompt, the explanation, or the error types.
 *
 * Ties are scored honestly: a strategy that cannot separate k options gets 1/k credit rather than
 * being counted right or wrong on the coin-flip, so "guess among the two it narrowed to" is
 * measured as what it is.
 */
import { describe, expect, it } from 'vitest';
import { generateItem, getGenerator, ITEM_TYPE_IDS } from '@/lib/generators';
import { canonicalRotation, shapeSignature } from '@/lib/geometry';
import { DIFFICULTIES } from '@/lib/types';
import type { Difficulty, Item, ItemTypeId, Option } from '@/lib/types';

/*
 * Enough seeds that a per-difficulty figure is a measurement rather than a sample.
 *
 * At 150 the standard error on a 25%-chance format is ~3.5 points, which is a third of the margin
 * this file allows — so a clean format could fail on noise and a mild leak could pass on it. At 500
 * it is ~1.9 points, and the whole sweep still runs in a couple of seconds.
 */
const SEEDS = Array.from({ length: 500 }, (_, i) => `LEAK${i}`);

/**
 * How far above the *calibrated* baseline a blind strategy may score.
 *
 * Raw chance is the wrong bar, and the reason is worth stating because it nearly produced a test
 * that failed honest formats and passed a leaky one. Two effects lift the best strategy above
 * 1/n even on a perfectly fair option set:
 *
 *  - **Plausibility itself.** A distractor has to sit near the answer or it can be dismissed on
 *    sight. Near-misses on both sides leave the answer near the middle of the set about half the
 *    time, so "closest to the others' mean" scores above 1/n against any set built this way.
 *  - **Taking the maximum of fifty strategies.** Each is an unbiased estimator of chance; the
 *    largest of fifty noisy estimates is not.
 *
 * So the baseline is measured rather than assumed: the same strategy family is run against the same
 * option sets with the answer position *replaced by an arbitrary one*. Whatever the family scores
 * there is what its structure and its multiplicity are worth, and a clean format should score no
 * better on the real answers than on the invented ones.
 */
const MAX_RATIO = 1.25;

/**
 * Formats allowed a wider margin at a named difficulty, with the reason recorded.
 *
 * An allowance is a debt, not a dispensation: it says the leak is understood, bounded, and smaller
 * than the value written here. Anything that drifts past it fails, so the number is a ratchet.
 *
 * Empty, and worth keeping empty. It held one entry — `analogy-figural` at difficulty 5, at 1.6 —
 * on the reading that three simultaneous transformations leave too few attributes varying to spread.
 * That reading was wrong about the cause. The leak was not scarcity, it was an unchecked assumption
 * in the bisect: it spread an attribute only where more than one distractor still carried the
 * answer's value, so the case where exactly one did — leaving the answer's value as the only one
 * held twice, a coin flip between two options — was skipped as though it were already balanced. The
 * generator now verifies the class sizes it was aiming for, and the format sits inside the ordinary
 * margin at every level. The debt was payable; it just had to be read correctly first.
 */
const ALLOWANCES: Partial<Record<ItemTypeId, { difficulty: Difficulty; ratio: number }>> = {};

// ---------------------------------------------------------------------------
// Features — the only thing a strategy is allowed to see.
// ---------------------------------------------------------------------------

/**
 * A numeric description of one option.
 *
 * Deliberately generic. The point is not to model any format's semantics but to expose the kinds of
 * regularity that leak: magnitude, count, extent, shape identity, symmetry.
 */
function features(o: Option): number[] {
  switch (o.kind) {
    case 'text': {
      const n = Number(o.text);
      return Number.isFinite(n) ? [n] : [o.text.length, o.text.charCodeAt(0) || 0];
    }
    case 'grid': {
      const filled = o.grid.cells.filter(Boolean).length;
      const { rows, cols, cells } = o.grid;
      let symH = 0;
      let symV = 0;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (cells[r * cols + c] === cells[r * cols + (cols - 1 - c)]) symH++;
          if (cells[r * cols + c] === cells[(rows - 1 - r) * cols + c]) symV++;
        }
      }
      return [filled, rows, cols, symH, symV];
    }
    case 'figure': {
      const shapes = o.figure.shapes;
      const n = shapes.length;
      const sum = (f: (s: (typeof shapes)[number]) => number) =>
        shapes.reduce((acc, s) => acc + f(s), 0);
      return [
        n,
        n === 0 ? 0 : sum((s) => s.size) / n,
        n === 0 ? 0 : sum((s) => s.color) / n,
        n === 0 ? 0 : sum((s) => canonicalRotation(s.type, s.rotation)) / n,
        n === 0 ? 0 : sum((s) => s.x) / n,
        n === 0 ? 0 : sum((s) => s.y) / n,
      ];
    }
  }
}

/** A coarse identity, for "is this option the odd one out among the options?" strategies. */
function classKey(o: Option): string {
  switch (o.kind) {
    case 'text':
      return `t:${o.text}`;
    case 'grid':
      return `g:${o.grid.cells.filter(Boolean).length}`;
    case 'figure':
      return `f:${o.figure.shapes.map(shapeSignature).sort().join(';')}`;
  }
}

// ---------------------------------------------------------------------------
// Strategies — each returns the set of option indices it would choose between.
// ---------------------------------------------------------------------------

type Strategy = { name: string; pick: (options: Option[]) => number[] };

/** Every index whose score ties for the extreme. */
function argExtreme(values: number[], want: 'min' | 'max'): number[] {
  const best = want === 'min' ? Math.min(...values) : Math.max(...values);
  const out: number[] = [];
  for (let i = 0; i < values.length; i++) if (values[i] === best) out.push(i);
  return out;
}

function buildStrategies(featureCount: number): Strategy[] {
  const out: Strategy[] = [];

  for (let f = 0; f < featureCount; f++) {
    const at = (o: Option) => features(o)[f] ?? 0;

    out.push({ name: `feature ${f}: smallest`, pick: (os) => argExtreme(os.map(at), 'min') });
    out.push({ name: `feature ${f}: largest`, pick: (os) => argExtreme(os.map(at), 'max') });

    // Rank-based: the review found answers pinned to the 2nd-smallest slot and to the middle.
    out.push({
      name: `feature ${f}: second smallest`,
      pick: (os) => {
        const sorted = os.map((o, i) => [at(o), i] as const).sort((a, b) => a[0] - b[0]);
        return sorted.length > 1 ? [sorted[1]![1]] : [0];
      },
    });
    out.push({
      name: `feature ${f}: second largest`,
      pick: (os) => {
        const sorted = os.map((o, i) => [at(o), i] as const).sort((a, b) => b[0] - a[0]);
        return sorted.length > 1 ? [sorted[1]![1]] : [0];
      },
    });
    out.push({
      name: `feature ${f}: not extreme`,
      pick: (os) => {
        const vs = os.map(at);
        const lo = Math.min(...vs);
        const hi = Math.max(...vs);
        const mid = vs.map((v, i) => (v !== lo && v !== hi ? i : -1)).filter((i) => i >= 0);
        return mid.length > 0 ? mid : os.map((_, i) => i);
      },
    });

    // Cluster centre: distractors built as answer ± delta leave the answer surrounded.
    out.push({
      name: `feature ${f}: closest to the others' mean`,
      pick: (os) => {
        const vs = os.map(at);
        const dist = vs.map((v, i) => {
          const others = vs.filter((_, j) => j !== i);
          const mean = others.reduce((a, b) => a + b, 0) / Math.max(1, others.length);
          return Math.abs(v - mean);
        });
        return argExtreme(dist, 'min');
      },
    });
    out.push({
      name: `feature ${f}: smallest nearest-neighbour gap`,
      pick: (os) => {
        const vs = os.map(at);
        const gap = vs.map((v, i) =>
          Math.min(...vs.filter((_, j) => j !== i).map((w) => Math.abs(v - w))),
        );
        return argExtreme(gap, 'min');
      },
    });
    out.push({
      name: `feature ${f}: largest nearest-neighbour gap`,
      pick: (os) => {
        const vs = os.map(at);
        const gap = vs.map((v, i) =>
          Math.min(...vs.filter((_, j) => j !== i).map((w) => Math.abs(v - w))),
        );
        return argExtreme(gap, 'max');
      },
    });

    // The arithmetic leak in its general form: an option paired at a fixed offset with exactly one
    // other, where the pair itself is unique in the set.
    for (const offset of [1, 2, 10]) {
      out.push({
        name: `feature ${f}: in the unique pair ${offset} apart, nearer a neighbour`,
        pick: (os) => {
          const vs = os.map(at);
          const pairs: [number, number][] = [];
          for (let i = 0; i < vs.length; i++) {
            for (let j = i + 1; j < vs.length; j++) {
              if (Math.abs(vs[i]! - vs[j]!) === offset) pairs.push([i, j]);
            }
          }
          if (pairs.length !== 1) return os.map((_, i) => i);
          const [i, j] = pairs[0]!;
          const near = (k: number) =>
            Math.min(...vs.filter((_, m) => m !== k).map((w) => Math.abs(vs[k]! - w)));
          return near(i) === near(j) ? [i, j] : near(i) < near(j) ? [i] : [j];
        },
      });
    }
  }

  // Attribute-wise mode across all features at once — the RAVEN attack proper.
  out.push({
    name: 'attribute-wise mode',
    pick: (os) => {
      const fs = os.map(features);
      const width = Math.max(...fs.map((f) => f.length));
      const score = fs.map((f, i) => {
        let s = 0;
        for (let k = 0; k < width; k++) {
          for (let j = 0; j < fs.length; j++) {
            if (j !== i && fs[j]![k] === f[k]) s++;
          }
        }
        return s;
      });
      return argExtreme(score, 'max');
    },
  });

  out.push({
    name: 'nearest to the centroid of the others',
    pick: (os) => {
      const fs = os.map(features);
      const width = Math.max(...fs.map((f) => f.length));
      const dist = fs.map((f, i) => {
        const others = fs.filter((_, j) => j !== i);
        let d = 0;
        for (let k = 0; k < width; k++) {
          const mean =
            others.reduce((a, b) => a + (b[k] ?? 0), 0) / Math.max(1, others.length);
          d += Math.abs((f[k] ?? 0) - mean);
        }
        return d;
      });
      return argExtreme(dist, 'min');
    },
  });

  // Class-based: the rotation leak was "the answer is the only option of its equivalence class".
  out.push({
    name: 'the only option of its class',
    pick: (os) => {
      const keys = os.map(classKey);
      const counts = new Map<string, number>();
      for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1);
      const singles = keys.map((k, i) => (counts.get(k) === 1 ? i : -1)).filter((i) => i >= 0);
      return singles.length > 0 ? singles : os.map((_, i) => i);
    },
  });
  out.push({
    name: 'shares a class with another option',
    pick: (os) => {
      const keys = os.map(classKey);
      const counts = new Map<string, number>();
      for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1);
      const shared = keys.map((k, i) => ((counts.get(k) ?? 0) > 1 ? i : -1)).filter((i) => i >= 0);
      return shared.length > 0 ? shared : os.map((_, i) => i);
    },
  });

  return out;
}

// ---------------------------------------------------------------------------

interface Report {
  best: string;
  accuracy: number;
  baseline: number;
  chance: number;
}

/** A deterministic stand-in answer position, uncorrelated with the real one. */
function decoyIndex(item: Item, salt: number): number {
  let h = 0x811c9dc5 ^ salt;
  for (const ch of `${item.seed}:${item.difficulty}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % item.options.length;
}

function attack(id: ItemTypeId, difficulty: Difficulty | 'all'): Report | null {
  const items: Item[] = [];
  const ds = difficulty === 'all' ? DIFFICULTIES : [difficulty];
  for (const d of ds) {
    for (const seed of SEEDS) {
      const item = generateItem(id, seed, d);
      if (item.responseMode === 'choice' && item.options.length > 1) items.push(item);
    }
  }
  if (items.length === 0) return null;

  const width = Math.max(...items.map((i) => Math.max(...i.options.map((o) => features(o).length))));
  const strategies = buildStrategies(width);

  // Pre-compute each strategy's choice once; it is the expensive part and does not depend on which
  // index we are scoring against.
  const picks = strategies.map((s) => items.map((item) => s.pick(item.options)));

  const scoreAgainst = (target: (item: Item, i: number) => number): number => {
    let best = 0;
    for (const chosenPerItem of picks) {
      let score = 0;
      for (let i = 0; i < items.length; i++) {
        const chosen = chosenPerItem[i]!;
        if (chosen.includes(target(items[i]!, i))) score += 1 / chosen.length;
      }
      if (score > best) best = score;
    }
    return best / items.length;
  };

  let bestName = 'none';
  let bestScore = 0;
  for (let s = 0; s < strategies.length; s++) {
    let score = 0;
    for (let i = 0; i < items.length; i++) {
      const chosen = picks[s]![i]!;
      if (chosen.includes(items[i]!.answerIndex)) score += 1 / chosen.length;
    }
    if (score > bestScore) {
      bestScore = score;
      bestName = strategies[s]!.name;
    }
  }

  /*
   * The baseline: the same family, scored against answer positions it cannot possibly know. Taken
   * as the mean over several independent decoy assignments, so the baseline is itself a stable
   * estimate rather than one more noisy draw.
   */
  const salts = [1, 2, 3, 4, 5];
  const baseline =
    salts.reduce((acc, salt) => acc + scoreAgainst((item) => decoyIndex(item, salt)), 0) /
    salts.length;

  const chance = items.reduce((acc, i) => acc + 1 / i.options.length, 0) / items.length;
  return { best: bestName, accuracy: bestScore / items.length, baseline, chance };
}

/**
 * `odd-one-out` is excluded, and the exclusion is a statement about the format rather than a
 * concession about its quality.
 *
 * Guard 2 asks whether the answer can be recovered *without the stimulus*. In every other format the
 * stimulus and the options are different things — a matrix and eight candidate cells, a stream and
 * four counts — so the question is meaningful. Here the figures on offer **are** the stimulus:
 * `Stimulus` is `{ kind: 'none' }`, and the task is precisely to find the one option that does not
 * belong among the others. A solver that reads only the options has not bypassed the item, it has
 * done it. Scoring that as leakage would be measuring the format for existing.
 *
 * What that format does have to answer for is unambiguity — that exactly one figure is defensibly
 * odd — which is a different property, tested against the generator's own guard in
 * `tests/generators.test.ts` rather than here.
 */
const STIMULUS_IS_THE_OPTIONS: ItemTypeId[] = ['odd-one-out'];

const CHOICE_FORMATS = ITEM_TYPE_IDS.filter((id) => {
  if (STIMULUS_IS_THE_OPTIONS.includes(id)) return false;
  const item = generateItem(id, 'PROBE', 3);
  return item.responseMode === 'choice' && item.options.length > 1;
});

describe('no format leaks its answer through the option set', () => {
  it('covers every multiple-choice format', () => {
    // If a format stops being covered, it is because it stopped being multiple-choice — which is a
    // change worth noticing here rather than silently shrinking the sweep.
    const uncovered = ITEM_TYPE_IDS.filter(
      (id) => !CHOICE_FORMATS.includes(id) && getGenerator(id).meta.id === id,
    );
    /*
     * The formats with no option set to leak through. Three produce the response themselves — a
     * typed sequence, a tapped board, a walked path — and `triangle-math` is the fourth: its answer
     * is several numbers written into a diagram, so there is nothing to choose between. `odd-one-out`
     * is the odd case out, and the block comment above says why.
     */
    expect(uncovered.sort()).toEqual([
      'block-span',
      'odd-one-out',
      'span',
      'trail-making',
      'triangle-math',
    ]);
  });

  for (const id of CHOICE_FORMATS) {
    it(`${id}: a stimulus-blind solver stays near chance`, () => {
      const pooled = attack(id, 'all')!;
      expect(
        pooled.accuracy,
        `${id} pooled: "${pooled.best}" scores ${(pooled.accuracy * 100).toFixed(1)}% ` +
          `against a ${(pooled.baseline * 100).toFixed(1)}% calibrated baseline ` +
          `(${(pooled.chance * 100).toFixed(1)}% chance)`,
      ).toBeLessThanOrEqual(pooled.baseline * MAX_RATIO);

      /*
       * Per difficulty as well as pooled. Pooling hides a leak that only opens at one level — the
       * n-back option set was fully solvable at difficulty 5 and merely poor below it, and the
       * matrix direction bias roughly doubled from difficulty 1 to 5.
       */
      for (const d of DIFFICULTIES) {
        const r = attack(id, d)!;
        const allowance = ALLOWANCES[id];
        const ratio = allowance && allowance.difficulty === d ? allowance.ratio : MAX_RATIO;
        expect(
          r.accuracy,
          `${id} d${d}: "${r.best}" scores ${(r.accuracy * 100).toFixed(1)}% ` +
            `against a ${(r.baseline * 100).toFixed(1)}% calibrated baseline ` +
            `(${(r.chance * 100).toFixed(1)}% chance)`,
        ).toBeLessThanOrEqual(r.baseline * ratio);
      }
    });
  }
});
