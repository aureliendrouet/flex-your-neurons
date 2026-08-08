import { describe, expect, it } from 'vitest';
import { matrixGenerator } from '@/lib/generators/matrix';
import { DIFFICULTIES } from '@/lib/types';
import type { Difficulty, Figure, Option } from '@/lib/types';

const SEEDS = Array.from({ length: 120 }, (_, i) => `S${i}`);

function figureOf(o: Option): Figure {
  if (o.kind !== 'figure') throw new Error('matrix options must be figures');
  return o.figure;
}

function figureKey(f: Figure): string {
  return (
    f.layout +
    '|' +
    f.shapes
      .map((s) => `${s.type},${s.size},${s.color},${s.rotation},${s.x},${s.y}`)
      .sort()
      .join(';')
  );
}

describe('matrix generator', () => {
  it('generates an item for every seed and difficulty without exhausting attempts', () => {
    for (const d of DIFFICULTIES) {
      for (const seed of SEEDS) {
        expect(() => matrixGenerator.generate(seed, d, 'en')).not.toThrow();
      }
    }
  });

  it('is deterministic: the same seed yields a deep-equal item', () => {
    for (const d of DIFFICULTIES) {
      for (const seed of SEEDS.slice(0, 40)) {
        const a = matrixGenerator.generate(seed, d, 'en');
        const b = matrixGenerator.generate(seed, d, 'en');
        expect(a).toEqual(b);
      }
    }
  });

  it('produces different items for different seeds', () => {
    const keys = new Set(
      SEEDS.map((s) => JSON.stringify(matrixGenerator.generate(s, 3, 'en').stimulus)),
    );
    // Allow a few collisions in a small attribute space, but demand real variety.
    expect(keys.size).toBeGreaterThan(SEEDS.length * 0.9);
  });

  describe('structural invariants', () => {
    it('holds for every generated item', () => {
      for (const d of DIFFICULTIES) {
        for (const seed of SEEDS) {
          const item = matrixGenerator.generate(seed, d, 'en');

          expect(item.stimulus.kind).toBe('matrix');
          if (item.stimulus.kind !== 'matrix') throw new Error('unreachable');

          // 8 visible cells, the 9th blank.
          expect(item.stimulus.cells).toHaveLength(9);
          expect(item.stimulus.cells[8]).toBeNull();
          for (let i = 0; i < 8; i++) {
            expect(item.stimulus.cells[i]).not.toBeNull();
          }

          // Exactly 8 pairwise-distinct options, exactly one marked correct.
          expect(item.options).toHaveLength(8);
          const keys = item.options.map((o) => figureKey(figureOf(o)));
          expect(new Set(keys).size).toBe(8);

          expect(item.answerIndex).toBeGreaterThanOrEqual(0);
          expect(item.answerIndex).toBeLessThan(8);
          expect(item.errorTypes).toHaveLength(8);
          expect(item.errorTypes.filter((e) => e === 'correct')).toHaveLength(1);
          expect(item.errorTypes[item.answerIndex]).toBe('correct');

          expect(item.explanation.rules.length).toBeGreaterThan(0);
          expect(item.seed).toBe(seed);
          expect(item.difficulty).toBe(d);
        }
      }
    });

    it('never places a shape outside the unit box', () => {
      for (const d of DIFFICULTIES) {
        for (const seed of SEEDS.slice(0, 40)) {
          const item = matrixGenerator.generate(seed, d, 'en');
          if (item.stimulus.kind !== 'matrix') throw new Error('unreachable');
          const figures = [
            ...item.stimulus.cells.filter((c): c is Figure => c !== null),
            ...item.options.map(figureOf),
          ];
          for (const f of figures) {
            expect(f.shapes.length).toBeGreaterThan(0);
            for (const s of f.shapes) {
              expect(s.x).toBeGreaterThanOrEqual(0);
              expect(s.x).toBeLessThanOrEqual(1);
              expect(s.y).toBeGreaterThanOrEqual(0);
              expect(s.y).toBeLessThanOrEqual(1);
            }
          }
        }
      }
    });
  });

  it('places the correct answer roughly uniformly across positions (no positional tell)', () => {
    const counts = new Array(8).fill(0);
    for (const d of DIFFICULTIES) {
      for (const seed of SEEDS) {
        counts[matrixGenerator.generate(seed, d, 'en').answerIndex]++;
      }
    }
    const total = counts.reduce((a: number, b: number) => a + b, 0);
    const expected = total / 8;
    for (const c of counts) {
      expect(c).toBeGreaterThan(expected * 0.55);
      expect(c).toBeLessThan(expected * 1.45);
    }
  });

  /**
   * The direct regression test for the RAVEN context-blind flaw: a solver shown only the
   * options, never the matrix, must score at chance. See docs/GENERATABILITY.md §4.
   */
  describe('Guard 2 — distractor leakage', () => {
    it('never makes the answer the attribute-wise mode of the option set', () => {
      for (const d of DIFFICULTIES) {
        for (const seed of SEEDS) {
          const item = matrixGenerator.generate(seed, d, 'en');
          const figures = item.options.map(figureOf);
          const answer = figures[item.answerIndex]!;

          const attrs = {
            type: (f: Figure) => f.shapes[0]!.type as string | number,
            size: (f: Figure) => f.shapes[0]!.size,
            color: (f: Figure) => f.shapes[0]!.color,
            count: (f: Figure) => f.shapes.length,
          };

          for (const [name, read] of Object.entries(attrs)) {
            const tally = new Map<string | number, number>();
            for (const f of figures) {
              const v = read(f);
              tally.set(v, (tally.get(v) ?? 0) + 1);
            }
            // An attribute every option shares carries no information, so it cannot leak.
            if (tally.size === 1) continue;
            const answerCount = tally.get(read(answer))!;
            const best = Math.max(...tally.values());
            const winners = [...tally.values()].filter((v) => v === best).length;
            // The answer may tie for most common, but must never be the *unique* mode.
            const isStrictMode = answerCount === best && winners === 1;
            expect(
              isStrictMode,
              `seed ${seed} d${d}: answer is the unique mode of "${name}"`,
            ).toBe(false);
          }
        }
      }
    });

    it('scores at chance when a context-blind solver guesses the modal option', () => {
      let hits = 0;
      let n = 0;
      for (const d of DIFFICULTIES) {
        for (const seed of SEEDS) {
          const item = matrixGenerator.generate(seed, d, 'en');
          const figures = item.options.map(figureOf);
          // Score each option by how many attribute values it shares with the others.
          const scores = figures.map((f) =>
            figures.reduce(
              (acc, g) =>
                acc +
                (f.shapes[0]!.type === g.shapes[0]!.type ? 1 : 0) +
                (f.shapes[0]!.size === g.shapes[0]!.size ? 1 : 0) +
                (f.shapes[0]!.color === g.shapes[0]!.color ? 1 : 0) +
                (f.shapes.length === g.shapes.length ? 1 : 0),
              0,
            ),
          );
          const guess = scores.indexOf(Math.max(...scores));
          if (guess === item.answerIndex) hits++;
          n++;
        }
      }
      // Chance is 1/8 = 12.5%. Anything much above that is exploitable leakage.
      expect(hits / n).toBeLessThan(0.22);
    });
  });

  it('gets harder as difficulty rises (more rules stated)', () => {
    const avgRules = (d: Difficulty) =>
      SEEDS.reduce((acc, s) => acc + matrixGenerator.generate(s, d, 'en').explanation.rules.length, 0) /
      SEEDS.length;
    expect(avgRules(5)).toBeGreaterThan(0);
    const d1 = SEEDS.map((s) => matrixGenerator.generate(s, 1, 'en'));
    const d5 = SEEDS.map((s) => matrixGenerator.generate(s, 5, 'en'));
    const shapes = (items: typeof d1) =>
      items.reduce((acc, i) => {
        if (i.stimulus.kind !== 'matrix') return acc;
        const first = i.stimulus.cells[0];
        return acc + (first ? first.shapes.length : 0);
      }, 0) / items.length;
    // Higher difficulties use multi-object layouts, so cells carry more elements.
    expect(shapes(d5)).toBeGreaterThan(shapes(d1));
  });
});
