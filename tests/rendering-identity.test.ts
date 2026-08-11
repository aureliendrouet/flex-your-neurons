/**
 * Sameness has to be judged on the ink, not on the record.
 *
 * `rotation` is a free number in the data model and a *quotient* on the page: a regular polygon
 * turned by one of its own symmetry steps is the same picture, and a square turned 45° is drawn as
 * the same four points as an upright diamond. Every generator that de-duplicates figures, builds a
 * lookup key, or asks "is this target present?" has to mean the drawn form.
 *
 * These are regressions for three shipped defects of exactly that shape:
 *
 *  - a coding key holding two visually identical symbols under different digits, so a reader who
 *    read the key perfectly was scored wrong;
 *  - a symbol-search trial keyed "target absent" while displaying a pixel-identical copy of one,
 *    which capped a flawless reader below the ceiling *and* removed the item from the latency
 *    median, because medians are taken over correct responses;
 *  - a figural analogy whose option list contained the answer twice.
 *
 * They are written against the rendered outline rather than against any generator's own notion of
 * identity, so a generator cannot satisfy them by agreeing with itself.
 */
import { describe, expect, it } from 'vitest';
import { generateItem } from '@/lib/generators';
import { describeFigure } from '@/components/FigureView';
import { describeGrid } from '@/components/GridView';
import { canonicalRotation, figureSignature, ROTATION_PERIOD, shapeSignature } from '@/lib/geometry';
import { DEFAULT_LOCALE } from '@/lib/i18n';
import { DIFFICULTIES, SHAPE_TYPES } from '@/lib/types';
import type { CellGrid, Figure } from '@/lib/types';

const SEEDS = Array.from({ length: 120 }, (_, i) => `VIS${i}`);

describe('rotation periods match the drawn outline', () => {
  it('a turn of one period is invisible, and any smaller turn is not', () => {
    for (const type of SHAPE_TYPES) {
      const period = ROTATION_PERIOD[type];
      const at = (r: number) => shapeSignature({ type, size: 3, color: 2, rotation: r, x: 0.5, y: 0.5 });

      if (period === 0) {
        // A circle takes no angle at all: every orientation is one drawing.
        for (const r of [0, 30, 45, 90, 137]) expect(at(r), `circle@${r}`).toBe(at(0));
        continue;
      }

      // A full period returns the shape to itself...
      expect(at(period), `${type}@${period}`).toBe(at(0));
      expect(at(period * 2), `${type}@${period * 2}`).toBe(at(0));

      // ...and nothing shorter does, or the period is overstated and invisible turns get through.
      for (let r = 1; r < period; r++) {
        expect(at(r), `${type}@${r} should differ from ${type}@0`).not.toBe(at(0));
      }
    }
  });

  it('canonicalRotation lands on the same drawing as the angle it reduces', () => {
    for (const type of SHAPE_TYPES) {
      for (const r of [0, 30, 45, 60, 90, 120, 150, 180, 270, 315, -30, -90]) {
        const raw = shapeSignature({ type, size: 3, color: 2, rotation: r, x: 0.5, y: 0.5 });
        const reduced = shapeSignature({
          type,
          size: 3,
          color: 2,
          rotation: canonicalRotation(type, r),
          x: 0.5,
          y: 0.5,
        });
        expect(reduced, `${type}@${r}`).toBe(raw);
      }
    }
  });

  it('sees the cross-type coincidence a per-shape symmetry table cannot', () => {
    const square45 = shapeSignature({ type: 'square', size: 3, color: 2, rotation: 45, x: 0.5, y: 0.5 });
    const diamond0 = shapeSignature({ type: 'diamond', size: 3, color: 2, rotation: 0, x: 0.5, y: 0.5 });
    expect(square45).toBe(diamond0);
  });
});

describe('no item shows the same drawing twice where it must not', () => {
  it('every figural option list is distinct as drawn', () => {
    for (const id of ['matrix', 'analogy-figural', 'odd-one-out', 'coding', 'symbol-search', 'figure-weights'] as const) {
      for (const d of DIFFICULTIES) {
        for (const seed of SEEDS) {
          const item = generateItem(id, seed, d);
          const figures = item.options.filter((o) => o.kind === 'figure');
          if (figures.length < 2) continue;
          const keys = figures.map((o) => figureSignature((o as { figure: Figure }).figure));
          expect(new Set(keys).size, `${id}/${seed}/d${d}: two options render identically`).toBe(
            keys.length,
          );
        }
      }
    }
  });

  it('a coding key never pairs one drawing with two digits', () => {
    for (const d of DIFFICULTIES) {
      for (const seed of SEEDS) {
        const item = generateItem('coding', seed, d);
        const stimulus = item.stimulus;
        if (stimulus.kind !== 'coding') throw new Error('expected a coding stimulus');
        const keys = stimulus.pairs.map((p) => figureSignature(p.figure));
        expect(new Set(keys).size, `coding/${seed}/d${d}: duplicate symbol in the key`).toBe(
          keys.length,
        );

        // And the probe resolves to exactly one entry, which is the keyed answer.
        const probe = stimulus.pairs.find((p) => p.digit === stimulus.probe);
        expect(probe, `coding/${seed}/d${d}: probe absent from key`).toBeDefined();
        const answer = item.options[item.answerIndex];
        expect(figureSignature((answer as { figure: Figure }).figure)).toBe(
          figureSignature(probe!.figure),
        );
      }
    }
  });

  it('every figural option list is distinguishable without seeing it', () => {
    /*
     * The description is the entire non-visual channel, so two options that read alike are two
     * options a reader cannot choose between — and the item is presented as answerable anyway.
     * Options are distinct *as drawn* (asserted above), so distinct descriptions is exactly the
     * requirement that the description says everything the drawing does.
     */
    for (const id of ['matrix', 'analogy-figural', 'odd-one-out', 'coding', 'figure-weights'] as const) {
      for (const d of DIFFICULTIES) {
        for (const seed of SEEDS) {
          const item = generateItem(id, seed, d);
          const figures = item.options.filter((o) => o.kind === 'figure');
          if (figures.length < 2) continue;
          const described = figures.map((o) =>
            describeFigure((o as { figure: Figure }).figure, DEFAULT_LOCALE),
          );
          expect(
            new Set(described).size,
            `${id}/${seed}/d${d}: two options describe identically — "${
              described.find((x, i) => described.indexOf(x) !== i) ?? ''
            }"`,
          ).toBe(described.length);
        }
      }
    }
  });

  it('every grid option list is distinguishable without seeing it', () => {
    // The same requirement as for figures, for the two formats whose options are cell grids. A
    // polyomino is a shape and a punched sheet is a set of places; a cell *count* is neither.
    for (const id of ['rotation', 'paper-folding'] as const) {
      for (const d of DIFFICULTIES) {
        for (const seed of SEEDS) {
          const item = generateItem(id, seed, d);
          const grids = item.options.filter((o) => o.kind === 'grid');
          if (grids.length < 2) continue;
          const described = grids.map((o) =>
            describeGrid((o as { grid: CellGrid }).grid, DEFAULT_LOCALE),
          );
          expect(
            new Set(described).size,
            `${id}/${seed}/d${d}: two options describe identically`,
          ).toBe(described.length);
        }
      }
    }
  });

  it('a symbol-search trial keyed "absent" never displays a target', () => {
    for (const d of DIFFICULTIES) {
      for (const seed of SEEDS) {
        const item = generateItem('symbol-search', seed, d);
        if (item.stimulus.kind !== 'symbol-search') throw new Error('expected a symbol-search stimulus');
        const targets = new Set(item.stimulus.targets.map(figureSignature));
        const present = item.stimulus.search.some((f) => targets.has(figureSignature(f)));
        const keyedPresent = item.options[item.answerIndex]?.kind === 'text'
          ? (item.options[item.answerIndex] as { text: string }).text
          : '';

        // The key is a yes/no string per locale; compare against what the generator itself keyed.
        const yesIndex = item.errorTypes.findIndex((e) => e === 'correct');
        expect(yesIndex, `${seed}/d${d}`).toBe(item.answerIndex);
        expect(
          present,
          `symbol-search/${seed}/d${d}: keyed "${keyedPresent}" but presence-as-drawn is ${present}`,
        ).toBe(item.answerIndex === 0);

        // The search row must also not repeat one drawing, which reads as a rendering fault.
        const searchKeys = item.stimulus.search.map(figureSignature);
        expect(new Set(searchKeys).size, `symbol-search/${seed}/d${d}: duplicate search symbol`).toBe(
          searchKeys.length,
        );
      }
    }
  });
});
