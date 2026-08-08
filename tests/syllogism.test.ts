import { describe, expect, it } from 'vitest';
import { enumerateValidForms, isValid, syllogismGenerator } from '@/lib/generators/syllogism';
import type { Proposition } from '@/lib/generators/syllogism';
import { DIFFICULTIES } from '@/lib/types';

describe('syllogism logic engine', () => {
  /**
   * The load-bearing check: under modern (Boolean, no existential import) semantics the
   * classical 24 valid forms reduce to exactly 15 unconditionally valid ones. If the model
   * checker reproduces that number, it is almost certainly right.
   */
  it('reproduces exactly the 15 unconditionally valid syllogistic forms', () => {
    const forms = enumerateValidForms();
    expect(forms).toHaveLength(15);
  });

  it('accepts Barbara and rejects the undistributed middle', () => {
    // Barbara, figure 1: All M are P; All S are M; therefore All S are P.
    const barbara: Proposition[] = [
      { type: 'A', subject: 1, predicate: 2 },
      { type: 'A', subject: 0, predicate: 1 },
    ];
    expect(isValid(barbara, { type: 'A', subject: 0, predicate: 2 })).toBe(true);
    // Without existential import, All S are P does NOT entail Some S are P.
    expect(isValid(barbara, { type: 'I', subject: 0, predicate: 2 })).toBe(false);

    // Undistributed middle: All P are M; All S are M; therefore All S are P — invalid.
    const fallacy: Proposition[] = [
      { type: 'A', subject: 2, predicate: 1 },
      { type: 'A', subject: 0, predicate: 1 },
    ];
    expect(isValid(fallacy, { type: 'A', subject: 0, predicate: 2 })).toBe(false);
  });

  it('rejects a conclusion from two negative premises', () => {
    const twoNegatives: Proposition[] = [
      { type: 'E', subject: 1, predicate: 2 },
      { type: 'E', subject: 0, predicate: 1 },
    ];
    for (const type of ['A', 'E', 'I', 'O'] as const) {
      expect(isValid(twoNegatives, { type, subject: 0, predicate: 2 })).toBe(false);
    }
  });
});

describe('syllogism generator', () => {
  const SEEDS = Array.from({ length: 60 }, (_, i) => `S${i}`);

  it('generates 5 distinct options with a provable key', () => {
    for (const d of DIFFICULTIES) {
      for (const seed of SEEDS) {
        const item = syllogismGenerator.generate(seed, d, 'en');
        expect(item.options).toHaveLength(5);
        expect(new Set(item.options.map((o) => (o.kind === 'text' ? o.text : '')))).toHaveProperty('size', 5);
        expect(item.errorTypes.filter((e) => e === 'correct')).toHaveLength(1);
        expect(item.errorTypes[item.answerIndex]).toBe('correct');
        expect(item.stimulus.kind).toBe('text');
        if (item.stimulus.kind === 'text') expect(item.stimulus.lines).toHaveLength(2);
      }
    }
  });

  it('is deterministic', () => {
    for (const seed of SEEDS.slice(0, 20)) {
      expect(syllogismGenerator.generate(seed, 4, 'en')).toEqual(syllogismGenerator.generate(seed, 4, 'en'));
    }
  });

  it('mixes items that do and do not have a valid conclusion', () => {
    const noConclusion = DIFFICULTIES.flatMap((d) =>
      SEEDS.map((s) => syllogismGenerator.generate(s, d, 'en')),
    ).filter((i) => {
      const opt = i.options[i.answerIndex];
      return opt?.kind === 'text' && opt.text.startsWith('No valid conclusion');
    });
    const total = DIFFICULTIES.length * SEEDS.length;
    expect(noConclusion.length).toBeGreaterThan(total * 0.1);
    expect(noConclusion.length).toBeLessThan(total * 0.7);
  });
});
