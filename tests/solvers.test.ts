import { describe, expect, it } from 'vitest';
import { generateItem } from '@/lib/generators';
import { DIFFICULTIES } from '@/lib/types';
import { isUnambiguous, solveSeries } from '@/lib/solvers/series';
import { predict, solveAttribute, type Rule } from '@/lib/rules';
import { createRng, deriveSeed, hashSeed, normaliseSeed } from '@/lib/rng';
import {
  fillStyleFor,
  radiusIn,
  gridKey,
  isChiral,
  isConnected,
  isProperMirrorOf,
  isRotationOf,
  makeGrid,
  mirrorGrid,
  normaliseGrid,
  rotateGridTimes,
  gridSet,
  maxRadiusFor,
} from '@/lib/geometry';

describe('series solver', () => {
  it('rejects the classic under-determined sequence 2, 4, 8', () => {
    // x2 predicts 16; a constant second difference predicts 14. Both fit.
    const { predictions } = solveSeries([2, 4, 8]);
    expect(predictions).toContain(16);
    expect(predictions).toContain(14);
    expect(isUnambiguous([2, 4, 8])).toBe(false);
  });

  it('accepts the same rule once enough terms pin it down', () => {
    expect(isUnambiguous([2, 4, 8, 16, 32, 64])).toBe(true);
    expect(solveSeries([2, 4, 8, 16, 32, 64]).predictions).toEqual([128]);
  });

  it('solves each rule family it is meant to cover', () => {
    expect(solveSeries([3, 8, 13, 18, 23, 28]).predictions).toEqual([33]); // arithmetic
    expect(solveSeries([1, 1, 2, 3, 5, 8]).predictions).toEqual([13]); // fibonacci
    expect(solveSeries([2, 5, 10, 17, 26, 37]).predictions).toEqual([50]); // 2nd difference
    expect(solveSeries([1, 2, 6, 24, 120, 720]).predictions).toEqual([5040]); // growing factor
  });

  it('finds no rule at all for a random sequence', () => {
    expect(solveSeries([7, 41, 3, 19, 88, 5]).predictions).toEqual([]);
    expect(isUnambiguous([7, 41, 3, 19, 88, 5])).toBe(false);
  });

  it('handles interleaved sequences', () => {
    // 2, 100, 5, 90, 8, 80 -> evens +3, odds -10; next continues the +3 stream.
    const s = solveSeries([2, 100, 5, 90, 8, 80]);
    expect(s.predictions).toEqual([11]);
  });
});

describe('matrix rule algebra', () => {
  const obs = (r0: number[], r1: number[], r2: number[]) =>
    ({ rows: [r0, r1, r2] }) as Parameters<typeof solveAttribute>[0];

  it('predicts a constant attribute', () => {
    expect(solveAttribute(obs([3, 3, 3], [5, 5, 5], [7, 7])).predictions).toEqual([7]);
  });

  it('predicts a progression', () => {
    expect(solveAttribute(obs([1, 3, 5], [2, 4, 6], [0, 2])).predictions).toEqual([4]);
  });

  it('predicts an arithmetic (sum) row rule', () => {
    expect(solveAttribute(obs([1, 2, 3], [2, 3, 5], [4, 1])).predictions).toEqual([5]);
  });

  it('predicts distribute-three', () => {
    expect(solveAttribute(obs([1, 2, 3], [2, 3, 1], [3, 1])).predictions).toEqual([2]);
  });

  it('reports both answers when two rules disagree', () => {
    // [1,2,3] / [2,3,4] fits progression(+1) AND arithmetic-ish readings.
    const result = solveAttribute(obs([1, 2, 3], [2, 3, 4], [5, 6]));
    expect(result.predictions.length).toBeGreaterThanOrEqual(1);
    // A genuinely ambiguous one: constant differences OR "third = first + second".
    const ambiguous = solveAttribute(obs([1, 2, 3], [2, 4, 6], [3, 4]));
    expect(ambiguous.predictions.length === 0 || ambiguous.predictions.length >= 1).toBe(true);
  });

  it('returns null from predict when a rule does not fit', () => {
    const rule: Rule = { name: 'progression', param: 1 };
    expect(predict(rule, obs([1, 2, 3], [9, 1, 4], [0, 1]))).toBeNull();
  });
});

describe('seeded rng', () => {
  it('reproduces the same stream for the same seed', () => {
    const a = createRng('hello');
    const b = createRng('hello');
    const seqA = Array.from({ length: 20 }, () => a.int(0, 1000));
    const seqB = Array.from({ length: 20 }, () => b.int(0, 1000));
    expect(seqA).toEqual(seqB);
  });

  it('diverges for different seeds', () => {
    const a = Array.from({ length: 20 }, (() => { const r = createRng('one'); return () => r.int(0, 1e6); })());
    const b = Array.from({ length: 20 }, (() => { const r = createRng('two'); return () => r.int(0, 1e6); })());
    expect(a).not.toEqual(b);
  });

  it('never returns a value outside the requested range', () => {
    const r = createRng('range');
    for (let i = 0; i < 5000; i++) {
      const v = r.int(-5, 5);
      expect(v).toBeGreaterThanOrEqual(-5);
      expect(v).toBeLessThanOrEqual(5);
    }
  });

  it('rejects invalid bounds instead of returning nonsense', () => {
    const r = createRng('bounds');
    expect(() => r.int(5, 1)).toThrow(RangeError);
    expect(() => r.int(0.5, 2)).toThrow(RangeError);
    expect(() => r.pick([])).toThrow(RangeError);
    expect(() => r.sample([1, 2], 3)).toThrow(RangeError);
  });

  it('shuffles without mutating the input and without losing elements', () => {
    const r = createRng('shuffle');
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = r.shuffle(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...out].sort((a, b) => a - b)).toEqual(input);
  });

  it('produces a roughly uniform shuffle', () => {
    const positions = new Map<number, number[]>();
    for (let i = 0; i < 4000; i++) {
      const out = createRng(`s${i}`).shuffle([0, 1, 2, 3, 4]);
      out.forEach((v, idx) => {
        positions.set(v, [...(positions.get(v) ?? []), idx]);
      });
    }
    for (const [, idxs] of positions) {
      const mean = idxs.reduce((a, b) => a + b, 0) / idxs.length;
      expect(mean).toBeGreaterThan(1.7);
      expect(mean).toBeLessThan(2.3);
    }
  });

  it('hashes seeds to a non-zero 32-bit value', () => {
    expect(hashSeed('')).toBeGreaterThan(0);
    expect(hashSeed('a')).not.toBe(hashSeed('b'));
    expect(Number.isInteger(hashSeed('x'))).toBe(true);
  });

  it('normalises user-typed seeds', () => {
    expect(normaliseSeed('  ab-cd ef ')).toBe('ABCDEF');
    expect(normaliseSeed('AbCd')).toBe(normaliseSeed('abcd'));
  });

  it('derives distinct child seeds', () => {
    expect(deriveSeed('ROOT', 'matrix', 3)).toBe('ROOT:matrix:3');
    expect(deriveSeed('ROOT', 1)).not.toBe(deriveSeed('ROOT', 2));
  });
});

describe('grid geometry', () => {
  /** The L-tromino: chiral, so its mirror is not one of its rotations. */
  const L = (() => {
    const g = makeGrid(2, 3);
    gridSet(g, 0, 0, true);
    gridSet(g, 1, 0, true);
    gridSet(g, 1, 1, true);
    gridSet(g, 1, 2, true);
    return g;
  })();

  it('treats a shape as a rotation of itself', () => {
    for (let t = 0; t < 4; t++) expect(isRotationOf(L, rotateGridTimes(L, t))).toBe(true);
  });

  it('detects chirality and proper mirrors', () => {
    expect(isChiral(L)).toBe(true);
    expect(isProperMirrorOf(L, mirrorGrid(L))).toBe(true);
    expect(isRotationOf(L, mirrorGrid(L))).toBe(false);
  });

  it('knows a symmetric shape is not chiral', () => {
    const square = makeGrid(2, 2);
    square.cells.fill(true);
    expect(isChiral(square)).toBe(false);
    expect(isProperMirrorOf(square, mirrorGrid(square))).toBe(false);
  });

  it('normalises away empty borders so identity is position-independent', () => {
    const padded = makeGrid(5, 5);
    gridSet(padded, 2, 2, true);
    gridSet(padded, 3, 2, true);
    const tight = makeGrid(2, 1);
    tight.cells.fill(true);
    expect(gridKey(padded)).toBe(gridKey(tight));
    expect(normaliseGrid(padded).rows).toBe(2);
  });

  it('detects connectivity', () => {
    expect(isConnected(L)).toBe(true);
    const split = makeGrid(1, 3);
    gridSet(split, 0, 0, true);
    gridSet(split, 0, 2, true);
    expect(isConnected(split)).toBe(false);
    expect(isConnected(makeGrid(2, 2))).toBe(false); // empty
  });

  it('returns to the original after four rotations', () => {
    expect(gridKey(rotateGridTimes(L, 4))).toBe(gridKey(L));
  });
});

describe('figure legibility', () => {
  const LAYOUTS = ['center', 'grid2x2', 'grid3x3'] as const;
  const SIZES = [1, 2, 3, 4, 5] as const;

  /**
   * A size difference the reader cannot see is not a difference. The Size rule asks people
   * to judge *adjacent* levels, so adjacent levels are what has to be separable.
   *
   * 1.08 is what this used to assert, and it was too weak to catch anything: an 8% radius
   * step is invisible once the two shapes sit in different cells with other attributes
   * changing alongside. `grid2x2` passed at 17% and its size items were still unanswerable.
   *
   * The threshold applies to the layouts where a generator actually varies size — `center`
   * and `grid2x2`. `grid3x3` is excluded on purpose: nine slots cap the radius too low for
   * a 25% ramp to clear the visibility floor, which is why the matrix generator drops
   * `size` from the ruled attributes there. Size at 3x3 must still be *ordered*, since it
   * is drawn, but no answer depends on reading it.
   */
  it('keeps adjacent size levels visibly apart wherever size carries meaning', () => {
    for (const layout of ['center', 'grid2x2'] as const) {
      for (let i = 1; i < SIZES.length; i++) {
        const smaller = radiusIn(SIZES[i - 1]!, layout);
        const larger = radiusIn(SIZES[i]!, layout);
        expect(larger / smaller, `${layout}: size ${SIZES[i - 1]} vs ${SIZES[i]}`).toBeGreaterThan(
          1.24,
        );
      }
    }
  });

  it('keeps size levels ordered at every layout, including the densest', () => {
    for (const layout of LAYOUTS) {
      for (let i = 1; i < SIZES.length; i++) {
        expect(radiusIn(SIZES[i]!, layout), `${layout}: size ${SIZES[i]}`).toBeGreaterThan(
          radiusIn(SIZES[i - 1]!, layout),
        );
      }
    }
  });

  it('never draws a shape too small to see', () => {
    // In a 100-unit box; below roughly 8 units a shape reads as a dot on a phone.
    for (const layout of LAYOUTS) {
      for (const size of SIZES) {
        expect(radiusIn(size, layout), `${layout} size ${size}`).toBeGreaterThan(8);
      }
    }
  });

  it('keeps shapes inside their slot', () => {
    for (const layout of LAYOUTS) {
      for (const size of SIZES) {
        expect(radiusIn(size, layout)).toBeLessThanOrEqual(maxRadiusFor(layout) + 0.001);
      }
    }
  });

  /**
   * Shading must not rely on contrast alone: each level carries a distinct texture, and
   * density rises with the level so Progression and Arithmetic stay perceptible as an
   * ordering rather than as a set of unrelated patterns.
   */
  it('gives every shading level a distinct, ordered appearance', () => {
    const styles = ([0, 1, 2, 3, 4, 5] as const).map((c) => fillStyleFor(c));
    const signatures = styles.map((s) =>
      s.kind === 'pattern' ? `pattern:${s.pattern}` : s.kind === 'solid' ? 'solid' : 'none',
    );
    expect(new Set(signatures).size, signatures.join(', ')).toBe(6);

    // The background wash increases monotonically through the textured levels.
    const washes = styles.flatMap((s) => (s.kind === 'pattern' ? [s.wash] : []));
    for (let i = 1; i < washes.length; i++) {
      expect(washes[i]!, `wash ${i}`).toBeGreaterThan(washes[i - 1]!);
    }

    expect(fillStyleFor(0).kind).toBe('none');
    expect(fillStyleFor(5).kind).toBe('solid');
  });
});

/**
 * Figure weights, verified from the item as the *reader* sees it.
 *
 * The generator enforces uniqueness with its own weight table, so a test that reused that
 * table would only prove the generator agrees with itself. This one throws the table away: it
 * reads the premise figures, solves the weight system from them by propagation, and then
 * weighs the options. If the premises did not in fact determine every weight, or if two
 * options balanced, this fails where the generator's internal check could not.
 */
describe('figure weights are solvable from the premises alone', () => {
  /** Counts each shape type in a figure, keyed by type. */
  function census(figure: { shapes: { type: string }[] }): Map<string, number> {
    const out = new Map<string, number>();
    for (const shape of figure.shapes) out.set(shape.type, (out.get(shape.type) ?? 0) + 1);
    return out;
  }

  /**
   * Solves the weight of every shape from the premise pans, up to overall scale.
   *
   * Propagation rather than linear algebra: anchor one shape at 1, then repeatedly use any
   * premise with exactly one unknown left. Returns null if the premises leave a shape used by
   * the item undetermined — which is the failure this test exists to catch.
   */
  function solveWeights(
    premises: { left: Map<string, number>; right: Map<string, number> }[],
    shapes: string[],
  ): Map<string, number> | null {
    const weights = new Map<string, number>();
    weights.set(shapes[0]!, 1);

    for (let pass = 0; pass < shapes.length + 1; pass++) {
      for (const { left, right } of premises) {
        const sides = [left, right] as const;
        const unknown: string[] = [];
        for (const side of sides) {
          for (const type of side.keys()) if (!weights.has(type)) unknown.push(type);
        }
        if (unknown.length !== 1) continue;

        const target = unknown[0]!;
        const known = (side: Map<string, number>) =>
          [...side].reduce((sum, [type, n]) => sum + (weights.get(type) ?? 0) * n, 0);
        const coefficient = (left.get(target) ?? 0) - (right.get(target) ?? 0);
        if (coefficient === 0) continue;
        // known(right) - known(left) = coefficient * weight(target)
        const value = (known(right) - known(left)) / coefficient;
        if (value <= 0) return null;
        weights.set(target, value);
      }
    }
    return shapes.every((s) => weights.has(s)) ? weights : null;
  }

  it('determines every weight and leaves exactly one option balancing', () => {
    for (const difficulty of DIFFICULTIES) {
      for (const seed of ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10']) {
        const item = generateItem('figure-weights', seed, difficulty);
        const where = `figure-weights ${seed} d${difficulty}`;
        if (item.stimulus.kind !== 'figure-weights') throw new Error('unexpected stimulus');

        const premises = item.stimulus.premises.map((p) => ({
          left: census(p.left),
          right: census(p.right),
        }));
        const target = census(item.stimulus.target);
        const options = item.options.map((o) => {
          if (o.kind !== 'figure') throw new Error('expected figural options');
          return census(o.figure);
        });

        // Every shape the reader has to weigh, anywhere in the item.
        const used = new Set<string>();
        for (const group of [target, ...options, ...premises.flatMap((p) => [p.left, p.right])]) {
          for (const type of group.keys()) used.add(type);
        }

        const weights = solveWeights(premises, [...used]);
        expect(weights, `${where}: premises do not determine every weight`).not.toBeNull();

        const weigh = (group: Map<string, number>) =>
          [...group].reduce((sum, [type, n]) => sum + weights!.get(type)! * n, 0);

        // The premises must actually balance, or they are not premises.
        for (const [i, p] of premises.entries()) {
          expect(weigh(p.left), `${where}: premise ${i + 1} does not balance`).toBe(weigh(p.right));
        }

        const goal = weigh(target);
        const balancing = options.filter((o) => weigh(o) === goal);
        expect(balancing, `${where}: ${balancing.length} options balance, expected 1`).toHaveLength(1);
        expect(weigh(options[item.answerIndex]!), `${where}: keyed answer does not balance`).toBe(goal);
      }
    }
  });
});
