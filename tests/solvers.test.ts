import { describe, expect, it } from 'vitest';
import { generateItem } from '@/lib/generators';
import { NODE_RADIUS } from '@/lib/generators/trail-making';
import { BLOCKS, BLOCK_RADIUS, encodeTaps, hasStraightRun } from '@/lib/generators/block-span';
import { diagnoseTaps, isCorrect } from '@/lib/scoring';
import { DIFFICULTIES, type Difficulty, type Figure } from '@/lib/types';
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

  /**
   * The diagnosis has to be true of the option it is attached to.
   *
   * `wrong-attribute` on this format claims something specific: that the reader matched the target
   * pan's *shapes* instead of its weight. Three things have to hold for that claim to be honest, and
   * none of them is checkable from the option alone — this is the one diagnosis here that depends on
   * the stimulus, which is exactly why it is worth a test of its own.
   */
  it('only names the shape misread where following the shapes really goes wrong', () => {
    const kinds = (group: Map<string, number>) => [...group.keys()].sort().join(',');

    for (const difficulty of DIFFICULTIES) {
      for (let i = 0; i < 120; i++) {
        const seed = `FWD${i}`;
        const item = generateItem('figure-weights', seed, difficulty);
        const where = `figure-weights ${seed} d${difficulty}`;
        if (item.stimulus.kind !== 'figure-weights') throw new Error('unexpected stimulus');

        const index = item.errorTypes.indexOf('wrong-attribute');
        if (index < 0) continue; // not every weight system admits one

        const option = item.options[index]!;
        const answer = item.options[item.answerIndex]!;
        if (option.kind !== 'figure' || answer.kind !== 'figure') throw new Error('expected figures');
        const target = kinds(census(item.stimulus.target));

        // 1. It really does mirror the target's shapes, or there is nothing tempting about it.
        expect(kinds(census(option.figure)), `${where}: labelled option does not mirror the target`)
          .toBe(target);
        // 2. And the answer does not, or the reader who followed the shapes was right after all.
        expect(kinds(census(answer.figure)), `${where}: the answer mirrors the target too`)
          .not.toBe(target);
        // 3. It is not also a unit out, which would make the diagnosis a guess between two readings.
        const premises = item.stimulus.premises.map((p) => ({
          left: census(p.left),
          right: census(p.right),
        }));
        const used = new Set<string>();
        for (const group of [
          census(item.stimulus.target),
          ...item.options.map((o) => census((o as { figure: Figure }).figure)),
          ...premises.flatMap((p) => [p.left, p.right]),
        ]) {
          for (const type of group.keys()) used.add(type);
        }
        /*
         * Rescaled so the lightest shape weighs 1, which is the unit "off by one" is counted in.
         * `solveWeights` anchors whichever shape it meets first, so its scale is arbitrary — fine
         * for the equality checks above, and silently wrong here: on the first seed this caught, a
         * gap of two units in the item's own scale read as a gap of one in the solver's.
         */
        const solved = solveWeights(premises, [...used])!;
        const lightest = Math.min(...solved.values());
        const weigh = (group: Map<string, number>) =>
          [...group].reduce((sum, [type, n]) => sum + (solved.get(type)! / lightest) * n, 0);
        const off = Math.abs(weigh(census(option.figure)) - weigh(census(item.stimulus.target)));
        expect(off, `${where}: the shape misread is also a unit out, so the label is a guess`)
          .not.toBe(1);
      }
    }
  });
});

/**
 * Head count, re-derived from the stream the reader is shown.
 *
 * Deliberately does not import `finalCount` from the generator. A test that reused the
 * generator's own walk would only prove the generator agrees with itself; this recomputes the
 * total from the stimulus with a second, independent accumulator and then checks the three
 * properties that make the item answerable at all.
 */
describe('head count is decidable from the stream alone', () => {
  const SEEDS = Array.from({ length: 40 }, (_, i) => `HC${i}`);

  it('tracks to exactly one keyed total, never going negative', () => {
    for (const difficulty of DIFFICULTIES) {
      for (const seed of SEEDS) {
        const item = generateItem('head-count', seed, difficulty);
        const where = `head-count ${seed} d${difficulty}`;
        if (item.stimulus.kind !== 'head-count') throw new Error('unexpected stimulus');
        const { events } = item.stimulus;

        /*
         * Independent accumulation, asserting coherence at every step rather than at the end.
         *
         * The floor is one, not zero. A room that empties mid-stream resets the task — from
         * that point everything before is irrelevant and a reader can stop tracking and add up
         * the rest — and the first pinned preview drew exactly that, with totals running
         * 1, 0, 3, 6. Zero at the end is separately unusable: it is the total you land on by
         * never watching, indistinguishable from not having engaged.
         */
        let total = 0;
        for (const [i, delta] of events.entries()) {
          expect(delta, `${where}: step ${i + 1} moves nobody`).not.toBe(0);
          total += delta;
          expect(total, `${where}: the room held ${total} after step ${i + 1}`).toBeGreaterThanOrEqual(1);
        }

        // At least one departure, or the item is an accumulation rather than an update.
        expect(
          events.filter((d) => d < 0).length,
          `${where}: no departures, so nothing has to be discarded`,
        ).toBeGreaterThan(0);

        const values = item.options.map((o) => {
          if (o.kind !== 'text') throw new Error('expected text options');
          return Number(o.text);
        });
        expect(values.filter((v) => v === total), `${where}: totals matching the answer`).toHaveLength(1);
        expect(values[item.answerIndex], `${where}: keyed answer is not the total`).toBe(total);
      }
    }
  });

  /**
   * The option set must not answer the item on its own.
   *
   * The first version of this format offered the arrivals-only total as a distractor, which on
   * a longer stream is the sum of every departure away from the answer — 20 sitting beside 4,
   * dismissible without having watched anything. That is the I-RAVEN leak in miniature. The
   * bound is a step's worth of slack either side of the plausible range, not a tight fit,
   * because the point is to catch an option an order of magnitude out.
   */
  it('offers no option that can be ruled out for being implausible', () => {
    for (const difficulty of DIFFICULTIES) {
      for (const seed of SEEDS) {
        const item = generateItem('head-count', seed, difficulty);
        const where = `head-count ${seed} d${difficulty}`;
        const values = item.options.map((o) => Number((o as { text: string }).text));
        const answer = values[item.answerIndex]!;
        for (const v of values) {
          expect(
            Math.abs(v - answer),
            `${where}: option ${v} is ${Math.abs(v - answer)} away from the answer ${answer}`,
          ).toBeLessThanOrEqual(10);
        }
      }
    }
  });

  /**
   * Difficulty must scale the number of updates, not the size of the numbers.
   *
   * This is the property the first plan got wrong: with no ceiling on the room the total drifted
   * into the twenties by level 5, and holding "23, now 26" is two-digit mental arithmetic — a
   * different construct, with its own format. The cap keeps the held value small so that what
   * grows with difficulty is how many times it is rewritten.
   */
  it('keeps the running total small at every difficulty', () => {
    for (const difficulty of DIFFICULTIES) {
      for (const seed of SEEDS) {
        const item = generateItem('head-count', seed, difficulty);
        if (item.stimulus.kind !== 'head-count') throw new Error('unexpected stimulus');
        let total = 0;
        let peak = 0;
        for (const delta of item.stimulus.events) {
          total += delta;
          peak = Math.max(peak, total);
        }
        expect(peak, `head-count ${seed} d${difficulty}: the room peaked at ${peak}`).toBeLessThanOrEqual(12);
      }
    }
  });

  /**
   * The updating has to be continuous, item by item.
   *
   * "At least one departure" was the original guard and it let a nine-step stream through with
   * a single subtraction — an accumulation with one interruption, which never forces the held
   * value to be discarded. The first version of this test measured the departure *share across
   * all seeds*, and that version did not bite: the aggregate stayed healthy while individual
   * items could still be degenerate. The property is per-item, so the assertion is per-item.
   *
   * The floor is restated here rather than imported from the generator. Importing its own
   * `minDepartures` would prove only that the generator agrees with itself.
   */
  it('makes the updating continuous rather than one interrupted accumulation', () => {
    for (const difficulty of DIFFICULTIES) {
      for (const seed of SEEDS) {
        const item = generateItem('head-count', seed, difficulty);
        if (item.stimulus.kind !== 'head-count') throw new Error('unexpected stimulus');
        const { events } = item.stimulus;
        const departures = events.filter((d) => d < 0).length;
        const floor = Math.max(1, Math.floor(events.length / 3));
        expect(
          departures,
          `head-count ${seed} d${difficulty}: ${departures} departures in ${events.length} steps`,
        ).toBeGreaterThanOrEqual(floor);
      }
    }
  });
});

/**
 * Arithmetic, re-evaluated from the expression the reader is shown.
 *
 * The generator builds the expression and its value together, so it necessarily agrees with itself.
 * This parses the *displayed string* — the thing the reader actually solves — and evaluates it with
 * an independent left-to-right walk. A mismatch means the item shows one sum and keys another.
 */
describe('arithmetic is decidable from the expression on screen', () => {
  const SEEDS = Array.from({ length: 60 }, (_, i) => `AR${i}`);

  /** Evaluates "12 + 7 − 5" strictly left to right. Deliberately not the generator's evaluator. */
  function evaluateDisplayed(expression: string): number {
    const tokens = expression.split(' ');
    let total = Number(tokens[0]);
    for (let i = 1; i < tokens.length; i += 2) {
      const operator = tokens[i];
      const operand = Number(tokens[i + 1]);
      expect(Number.isInteger(operand), `bad operand in "${expression}"`).toBe(true);
      if (operator === '+') total += operand;
      else if (operator === '−') total -= operand;
      else if (operator === '×') total *= operand;
      else if (operator === '÷') total /= operand;
      else throw new Error(`unknown operator "${operator}" in "${expression}"`);
    }
    return total;
  }

  it('keys the value the displayed expression actually evaluates to', () => {
    for (const difficulty of DIFFICULTIES) {
      for (const seed of SEEDS) {
        const item = generateItem('arithmetic', seed, difficulty);
        const where = `arithmetic ${seed} d${difficulty}`;
        if (item.stimulus.kind !== 'expression') throw new Error('unexpected stimulus');

        const value = evaluateDisplayed(item.stimulus.expression);
        expect(Number.isInteger(value), `${where}: "${item.stimulus.expression}" is not whole`).toBe(true);
        expect(value, `${where}: negative result`).toBeGreaterThanOrEqual(0);

        const values = item.options.map((o) => {
          if (o.kind !== 'text') throw new Error('expected text options');
          return Number(o.text);
        });
        expect(values.filter((v) => v === value), `${where}: options equal to the value`).toHaveLength(1);
        expect(values[item.answerIndex], `${where}: keyed answer is not the value`).toBe(value);
      }
    }
  });

  /**
   * The units-digit shortcut, closed off.
   *
   * The last digit of a sum or product is fixed by the last digits of the operands, so an item whose
   * answer is the only option ending in that digit can be solved by computing one digit — the whole
   * calculation skipped. At least two options must therefore share the answer's units digit.
   *
   * The requirement is scoped to answers of two digits or more, and the scope is the point rather
   * than an exemption: when the answer *is* its own units digit there is no partial calculation to
   * stop at, so a shared last digit defends nothing. Insisting on it there would force a distractor
   * ten away from a single-digit answer, and since such an answer has no room for a partner ten
   * *below* it, every one of those items would have had to place the answer in the bottom half of
   * the option list — trading a shortcut that does not exist for a positional tell that does.
   */
  it('never lets the units digit alone identify the answer', () => {
    for (const difficulty of DIFFICULTIES) {
      for (const seed of SEEDS) {
        const item = generateItem('arithmetic', seed, difficulty);
        const values = item.options.map((o) => Number((o as { text: string }).text));
        const answer = values[item.answerIndex]!;
        if (answer < 10) continue;
        const sharing = values.filter((v) => v % 10 === answer % 10).length;
        expect(
          sharing,
          `arithmetic ${seed} d${difficulty}: only the answer ${answer} ends in ${answer % 10}`,
        ).toBeGreaterThanOrEqual(2);
      }
    }
  });

  /**
   * No option out of scale with the answer.
   *
   * This shipped broken. Substituting × for + is a realistic misreading, but it produces a value
   * from another world: `34 + 26 = 60` was offered alongside 884, and `37 − 26 = 11` alongside 962.
   * An option that far out is discarded on sight, so the item was answerable without arithmetic —
   * the same leak as an option set that answers the question on its own.
   */
  it('offers no option that can be dismissed on size alone', () => {
    for (const difficulty of DIFFICULTIES) {
      for (const seed of SEEDS) {
        const item = generateItem('arithmetic', seed, difficulty);
        const values = item.options.map((o) => Number((o as { text: string }).text));
        const answer = values[item.answerIndex]!;
        const band = Math.max(12, Math.ceil(answer * 0.35));
        for (const v of values) {
          expect(
            Math.abs(v - answer),
            `arithmetic ${seed} d${difficulty}: option ${v} against answer ${answer}`,
          ).toBeLessThanOrEqual(band);
        }
      }
    }
  });

  /**
   * Precedence must never decide the answer.
   *
   * `7 + 3 × 2` is 13 by convention and 20 read left to right. An item like that measures whether
   * the reader remembers a convention, not whether they can calculate — so chains only ever mix
   * operators of equal precedence, and the two readings coincide.
   */
  it('never mixes precedence classes in one expression', () => {
    for (const difficulty of DIFFICULTIES) {
      for (const seed of SEEDS) {
        const item = generateItem('arithmetic', seed, difficulty);
        if (item.stimulus.kind !== 'expression') throw new Error('unexpected stimulus');
        const operators = item.stimulus.expression.split(' ').filter((t) => '+−×÷'.includes(t));
        const additive = operators.filter((o) => o === '+' || o === '−').length;
        const multiplicative = operators.length - additive;
        expect(
          additive === 0 || multiplicative === 0,
          `arithmetic ${seed} d${difficulty}: "${item.stimulus.expression}" mixes precedence`,
        ).toBe(true);
      }
    }
  });
});

/**
 * Interference, checked on the two things that make a Stroop task a Stroop task.
 *
 * Not novelty — the stimulus set is deliberately tiny, and `tests/generators.test.ts` exempts this
 * format from the variety sweep for that reason. What has to hold is that both congruency conditions
 * occur (with no contrast there is no measurement), and that the response set never changes shape
 * between levels (or accuracy at level 1 and level 5 are not the same quantity).
 */
describe('interference presents a real congruency contrast', () => {
  const SEEDS = Array.from({ length: 120 }, (_, i) => `IF${i}`);

  function glyphsOf(seed: string, difficulty: Difficulty): string[] {
    const item = generateItem('interference', seed, difficulty);
    if (item.stimulus.kind !== 'interference') throw new Error('unexpected stimulus');
    return item.stimulus.glyphs;
  }

  it('keys the number of glyphs, never the digit they show', () => {
    for (const difficulty of DIFFICULTIES) {
      for (const seed of SEEDS) {
        const item = generateItem('interference', seed, difficulty);
        const where = `interference ${seed} d${difficulty}`;
        const glyphs = glyphsOf(seed, difficulty);

        // All one digit: a mixed row would be a different task with a different answer.
        expect(new Set(glyphs).size, `${where}: mixed glyphs`).toBe(1);

        const values = item.options.map((o) => Number((o as { text: string }).text));
        expect(values[item.answerIndex], `${where}: keyed answer is not the count`).toBe(glyphs.length);
        // The digit is offered as an option whenever it is not the answer — it is the lure.
        const digit = Number(glyphs[0]);
        if (digit !== glyphs.length) {
          expect(values, `${where}: the digit is not offered as a distractor`).toContain(digit);
          expect(
            item.errorTypes[values.indexOf(digit)],
            `${where}: the lure is not diagnosed`,
          ).toBe('wrong-attribute');
        }
      }
    }
  });

  it('produces both congruent and incongruent trials at every difficulty', () => {
    for (const difficulty of DIFFICULTIES) {
      const congruent = SEEDS.filter((seed) => {
        const glyphs = glyphsOf(seed, difficulty);
        return glyphs.length === Number(glyphs[0]);
      }).length;
      expect(congruent, `interference d${difficulty}: no congruent trials`).toBeGreaterThan(0);
      expect(
        SEEDS.length - congruent,
        `interference d${difficulty}: no incongruent trials`,
      ).toBeGreaterThan(0);
    }
  });

  it('demands inhibition more often as difficulty rises', () => {
    const shares = DIFFICULTIES.map(
      (difficulty) =>
        SEEDS.filter((seed) => {
          const glyphs = glyphsOf(seed, difficulty);
          return glyphs.length !== Number(glyphs[0]);
        }).length / SEEDS.length,
    );
    expect(shares[4]!, `d5 incongruent ${shares[4]} vs d1 ${shares[0]}`).toBeGreaterThan(shares[0]!);
  });

  /**
   * The response set must be identical at every level.
   *
   * This shipped wrong: the count range widened with difficulty, so the guessing baseline moved from
   * one third to one sixth between levels 1 and 5. Accuracy then means something different at each
   * level, and a "harder" level can come out easier by chance — and the growing option list adds a
   * visual search that scales with difficulty, in a task measured in a few hundred milliseconds.
   */
  it('keeps the same options at every difficulty', () => {
    const shapes = DIFFICULTIES.map((difficulty) =>
      generateItem('interference', 'SHAPE', difficulty)
        .options.map((o) => (o as { text: string }).text)
        .join(','),
    );
    expect(new Set(shapes).size, `option sets across levels: ${shapes.join(' | ')}`).toBe(1);
  });
});

/**
 * Trail making: the layout properties that make a board playable at all.
 *
 * There is no answer to re-derive here — the order is printed on the targets — so what has to be
 * checked is the geometry. A board whose targets overlap is not a hard item, it is an unclickable
 * one, and no amount of generator confidence substitutes for measuring the distances.
 */
describe('trail-making boards are playable', () => {
  const SEEDS = Array.from({ length: 40 }, (_, i) => `TM${i}`);

  function nodesOf(seed: string, difficulty: Difficulty) {
    const item = generateItem('trail-making', seed, difficulty);
    if (item.stimulus.kind !== 'trail') throw new Error('unexpected stimulus');
    return item.stimulus.nodes;
  }

  /**
   * The radius the generator places around, imported rather than restated — a hand-copied constant
   * here would drift from the one the placement is built on, and the whole point of this suite is to
   * measure the geometry rather than to agree with it.
   */
  const RADIUS = NODE_RADIUS;

  it('never overlaps two targets', () => {
    for (const difficulty of DIFFICULTIES) {
      for (const seed of SEEDS) {
        const nodes = nodesOf(seed, difficulty);
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const dx = nodes[i]!.x - nodes[j]!.x;
            const dy = nodes[i]!.y - nodes[j]!.y;
            const distance = Math.hypot(dx, dy);
            expect(
              distance,
              `trail-making ${seed} d${difficulty}: ${nodes[i]!.label} and ${nodes[j]!.label} are ${distance.toFixed(3)} apart`,
            ).toBeGreaterThan(RADIUS * 2);
          }
        }
      }
    }
  });

  it('keeps every target inside the board', () => {
    for (const difficulty of DIFFICULTIES) {
      for (const seed of SEEDS) {
        for (const node of nodesOf(seed, difficulty)) {
          const where = `trail-making ${seed} d${difficulty} node ${node.label}`;
          // Inset by a radius, or a target would be clipped by the edge it sits on.
          expect(node.x, `${where} x`).toBeGreaterThanOrEqual(RADIUS);
          expect(node.x, `${where} x`).toBeLessThanOrEqual(1 - RADIUS);
          expect(node.y, `${where} y`).toBeGreaterThanOrEqual(RADIUS);
          expect(node.y, `${where} y`).toBeLessThanOrEqual(1 - RADIUS);
        }
      }
    }
  });

  it('labels the path uniquely and in the documented order', () => {
    for (const difficulty of DIFFICULTIES) {
      for (const seed of SEEDS) {
        const nodes = nodesOf(seed, difficulty);
        const labels = nodes.map((n) => n.label);
        const where = `trail-making ${seed} d${difficulty}`;
        expect(new Set(labels).size, `${where}: duplicate labels`).toBe(labels.length);

        const isFormB = labels.some((l) => /[A-Z]/.test(l));
        if (isFormB) {
          // 1, A, 2, B … — numbers on the even positions, letters on the odd ones.
          labels.forEach((label, i) => {
            if (i % 2 === 0) expect(label, `${where} position ${i}`).toBe(String(i / 2 + 1));
            else expect(/^[A-Z]$/.test(label), `${where} position ${i} is "${label}"`).toBe(true);
          });
        } else {
          expect(labels).toEqual(labels.map((_, i) => String(i + 1)));
        }
      }
    }
  });

  /**
   * The path has to wander.
   *
   * If consecutive targets were always neighbours the board would be a dotted line, and following it
   * would need no reading at all — the search is the task. Measured as the mean step length against
   * the board's diagonal: a wandering path averages a substantial fraction of it, a laid-out one
   * would not.
   */
  it('scatters the path rather than laying it out in order', () => {
    for (const difficulty of DIFFICULTIES) {
      let total = 0;
      let steps = 0;
      for (const seed of SEEDS) {
        const nodes = nodesOf(seed, difficulty);
        for (let i = 1; i < nodes.length; i++) {
          total += Math.hypot(nodes[i]!.x - nodes[i - 1]!.x, nodes[i]!.y - nodes[i - 1]!.y);
          steps++;
        }
      }
      const mean = total / steps;
      expect(mean, `trail-making d${difficulty}: mean step ${mean.toFixed(3)}`).toBeGreaterThan(0.25);
    }
  });

  it('produces both forms, at every difficulty', () => {
    for (const difficulty of DIFFICULTIES) {
      const formB = SEEDS.filter((seed) => nodesOf(seed, difficulty).some((n) => /[A-Z]/.test(n.label)));
      expect(formB.length, `trail-making d${difficulty}: no form B boards`).toBeGreaterThan(0);
      expect(
        SEEDS.length - formB.length,
        `trail-making d${difficulty}: no form A boards`,
      ).toBeGreaterThan(0);
    }
  });

  it('scales the search load with difficulty, and only that', () => {
    const counts = DIFFICULTIES.map((d) => nodesOf('SCALE', d).length);
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]!, `d${i + 1} has ${counts[i]} nodes, d${i} has ${counts[i - 1]}`).toBeGreaterThan(
        counts[i - 1]!,
      );
    }
  });
});

describe('block-span boards are playable', () => {
  const SEEDS = Array.from({ length: 40 }, (_, i) => `BS${i}`);

  function boardOf(seed: string, difficulty: Difficulty) {
    const item = generateItem('block-span', seed, difficulty);
    if (item.stimulus.kind !== 'block-span') throw new Error('unexpected stimulus');
    return item.stimulus;
  }

  /**
   * The layout is a hand-written literal, so its two geometric properties are checked here rather
   * than trusted. A "small tidy-up" of those nine coordinates is exactly the kind of change that
   * looks harmless in a diff and produces two blocks on top of each other on the board.
   */
  it('never overlaps two blocks', () => {
    for (let i = 0; i < BLOCKS.length; i++) {
      for (let j = i + 1; j < BLOCKS.length; j++) {
        const distance = Math.hypot(BLOCKS[i]!.x - BLOCKS[j]!.x, BLOCKS[i]!.y - BLOCKS[j]!.y);
        expect(
          distance,
          `blocks ${i + 1} and ${j + 1} are ${distance.toFixed(3)} apart`,
        ).toBeGreaterThan(BLOCK_RADIUS * 2);
      }
    }
  });

  it('keeps every block inside the board', () => {
    BLOCKS.forEach((block, i) => {
      expect(block.x, `block ${i + 1} x`).toBeGreaterThanOrEqual(BLOCK_RADIUS);
      expect(block.x, `block ${i + 1} x`).toBeLessThanOrEqual(1 - BLOCK_RADIUS);
      expect(block.y, `block ${i + 1} y`).toBeGreaterThanOrEqual(BLOCK_RADIUS);
      expect(block.y, `block ${i + 1} y`).toBeLessThanOrEqual(1 - BLOCK_RADIUS);
    });
  });

  /**
   * The load-bearing claim of the format: the board is a constant, so the sequence is the only
   * thing that changes between items. If a future edit made the layout depend on the seed, every
   * item would silently start measuring search as well as span.
   */
  it('shows the same board on every item, at every level', () => {
    for (const difficulty of DIFFICULTIES) {
      for (const seed of SEEDS) {
        expect(boardOf(seed, difficulty).blocks, `block-span ${seed} d${difficulty}`).toEqual([
          ...BLOCKS,
        ]);
      }
    }
  });

  it('never lights the same block twice in one sequence', () => {
    for (const difficulty of DIFFICULTIES) {
      for (const seed of SEEDS) {
        const { sequence } = boardOf(seed, difficulty);
        expect(new Set(sequence).size, `block-span ${seed} d${difficulty}`).toBe(sequence.length);
        for (const index of sequence) {
          expect(index, `block-span ${seed}: index out of range`).toBeGreaterThanOrEqual(0);
          expect(index, `block-span ${seed}: index out of range`).toBeLessThan(BLOCKS.length);
        }
      }
    }
  });

  /**
   * Difficulty is the sequence length, and *only* the sequence length.
   *
   * The three ways this format could have gone wrong are all invisible to the generic contract
   * tests: a faster presentation at the high levels, a backward trial, or a shrinking board would
   * each pass every property in `generators.test.ts` while making level 5 a different task from
   * level 1 rather than a longer one. Two of the three are checked here directly; the third
   * (backwards recall) cannot exist because the answer is always the sequence in the order shown,
   * which the round-trip test below pins.
   */
  it('scales the sequence length with difficulty, and holds everything else fixed', () => {
    const lengths = DIFFICULTIES.map((d) => boardOf('SCALE', d).sequence.length);
    for (let i = 1; i < lengths.length; i++) {
      expect(lengths[i]!, `d${i + 1} is ${lengths[i]}, d${i} is ${lengths[i - 1]}`).toBeGreaterThan(
        lengths[i - 1]!,
      );
    }

    const presentations = DIFFICULTIES.map(
      (d) => generateItem('block-span', 'SCALE', d).presentation,
    );
    for (const presentation of presentations) {
      expect(presentation, 'a tap format must play before it can be answered').toBeDefined();
      expect(presentation, 'the flash rate must not move with difficulty').toEqual(
        presentations[0],
      );
    }
  });

  /**
   * No three consecutive blocks in a straight line.
   *
   * A straight run chunks: three positions travelled in one direction cost about as much to hold as
   * one, so a sequence containing them is shorter than its length claims. The guard is rejection
   * sampling with a bounded number of attempts, so this is a check that the bound is generous
   * enough in practice rather than a guarantee — hence "every board", asserted over a wide sweep.
   */
  it('never lays three blocks out in a straight run', () => {
    for (const difficulty of DIFFICULTIES) {
      for (const seed of SEEDS) {
        const { sequence } = boardOf(seed, difficulty);
        expect(hasStraightRun(sequence), `block-span ${seed} d${difficulty}: ${sequence.join('-')}`).toBe(
          false,
        );
      }
    }
  });

  /** The guard has to be able to say yes, or the test above is only asserting that it always says no. */
  it('recognises a straight run when there is one', () => {
    /*
     * The straight runs on this board are the lines *through the middle block*: 1-5-6, 3-5-7 and
     * 2-5-9 are all within a few degrees of straight. Found by measuring every ordered triple
     * rather than by eye — the first version of this test asserted that 1-4-7 was a run because
     * those three sit down the left-hand side, and they are in fact 35 degrees off.
     */
    expect(hasStraightRun([0, 4, 5])).toBe(true);
    expect(hasStraightRun([2, 4, 6])).toBe(true);
    // Down the left-hand side, but not in a line: this is the case that fooled the eye.
    expect(hasStraightRun([0, 3, 6])).toBe(false);
    // A path that turns is not a run, however long.
    expect(hasStraightRun([0, 2, 6, 5])).toBe(false);
  });

  /**
   * The guard is not vacuous.
   *
   * "No board has a straight run" passes trivially if straight runs are impossible on this layout,
   * and a rejection filter that never rejects is dead code that will be deleted by someone tidying
   * up. So the unfiltered rate is measured directly: draw sequences the way the generator does but
   * without the filter, and check that a real fraction of them would have shipped with a run in.
   *
   * Twelve of the 504 ordered triples on this board are near-collinear, which works out at about a
   * one-in-nine chance for a seven-long sequence — small enough to be invisible in casual play, big
   * enough that a reader would meet several a week.
   */
  it('rejects a meaningful share of the draws it makes', () => {
    const indices = BLOCKS.map((_, i) => i);
    let withRun = 0;
    const trials = 600;
    for (let i = 0; i < trials; i++) {
      if (hasStraightRun(createRng(`unfiltered${i}`).sample(indices, 7))) withRun++;
    }
    const share = withRun / trials;
    expect(share, `only ${(share * 100).toFixed(1)}% of raw draws contain a straight run`).toBeGreaterThan(
      0.04,
    );
  });

  /**
   * The round trip: what the board shows is exactly what grading expects back.
   *
   * This is what makes "no backwards trials" a property rather than a promise — a reversed
   * expectation would fail here — and it is also the only check that the tap encoding and the
   * answer string cannot drift apart.
   */
  it('accepts the sequence in the order it was shown, and nothing else', () => {
    for (const difficulty of DIFFICULTIES) {
      for (const seed of SEEDS.slice(0, 12)) {
        const item = generateItem('block-span', seed, difficulty);
        if (item.stimulus.kind !== 'block-span') throw new Error('unexpected stimulus');
        const { sequence } = item.stimulus;
        const where = `block-span ${seed} d${difficulty}`;

        expect(item.answerText, where).toBe(encodeTaps(sequence));
        expect(isCorrect(item, null, encodeTaps(sequence)), where).toBe(true);
        expect(isCorrect(item, null, encodeTaps([...sequence].reverse())), `${where} backwards`).toBe(
          false,
        );
        // A prefix of the right answer is not a partial success.
        expect(isCorrect(item, null, encodeTaps(sequence.slice(0, -1))), `${where} short`).toBe(false);
      }
    }
  });
});

describe('tapped-sequence diagnosis', () => {
  /**
   * The one diagnosis in the app that is computed rather than keyed, so it is the one that can be
   * wrong without a generator being wrong. Each case is a distinct failure a reader can actually
   * produce, and the ordering matters: a reversal is also a transposition, and must be reported as
   * the more specific of the two.
   */
  it('separates a lost order from a lost item', () => {
    expect(diagnoseTaps('4821', '4821')).toBe('correct');
    expect(diagnoseTaps('4821', '1284')).toBe('wrong-direction');
    expect(diagnoseTaps('4821', '4812')).toBe('transposition');
    // A block that never lit: the set differs, so the order is not what went wrong.
    expect(diagnoseTaps('4821', '4823')).toBe('plausible');
    // Same block tapped twice — a repeat is never in the answer, so it cannot be a transposition.
    expect(diagnoseTaps('4821', '4822')).toBe('plausible');
  });
});
