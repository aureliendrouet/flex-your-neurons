/**
 * Contract tests every generator must satisfy, swept over many seeds.
 *
 * These are property-style rather than example-based: an item generator is only as good
 * as its worst seed, so asserting on a handful of hand-picked examples would prove very
 * little. Each property below corresponds to a guard in docs/GENERATABILITY.md §4.
 */
import { describe, expect, it } from 'vitest';
import { GENERATORS, generateItem, getGenerator, getItemText, ITEM_TYPE_IDS } from '@/lib/generators';
import { LOCALES } from '@/lib/i18n';
import { figureSignature } from '@/lib/geometry';
import { DIFFICULTIES } from '@/lib/types';
import type { Difficulty, Item, Option } from '@/lib/types';

const SEEDS = Array.from({ length: 80 }, (_, i) => `SEED${i}`);

/** How many formats ship. See the registry test below before changing this. */
const EXPECTED_TYPES = 25;

function optionKey(o: Option): string {
  switch (o.kind) {
    case 'text':
      return `t:${o.text}`;
    case 'grid':
      return `g:${o.grid.rows}x${o.grid.cols}:${o.grid.cells.map((b) => (b ? 1 : 0)).join('')}`;
    case 'figure':
      /*
       * Keyed on the rendered outline, not on the record. Two options that store different rotations
       * can paint the same pixels — a hexagon at 60° and at 120°, a square at 45° and a diamond at 0
       * — and "options are pairwise distinct" has to mean distinct to the reader, who is the one
       * being asked to choose between them.
       */
      return `f:${figureSignature(o.figure)}`;
  }
}

function allItems(): { item: Item; seed: string; difficulty: Difficulty }[] {
  const out: { item: Item; seed: string; difficulty: Difficulty }[] = [];
  for (const id of ITEM_TYPE_IDS) {
    for (const difficulty of DIFFICULTIES) {
      for (const seed of SEEDS) {
        out.push({ item: generateItem(id, seed, difficulty), seed, difficulty });
      }
    }
  }
  return out;
}

describe('generator registry', () => {
  /**
   * The count is asserted explicitly rather than derived, so that losing a generator to a
   * bad merge fails here instead of silently shrinking the test. Update it deliberately
   * when a format ships — and update the user-facing copy that counts formats with it.
   */
  it('exposes every registered item type with unique ids and complete metadata', () => {
    expect(GENERATORS).toHaveLength(EXPECTED_TYPES);
    expect(new Set(ITEM_TYPE_IDS).size).toBe(EXPECTED_TYPES);
    for (const g of GENERATORS) {
      expect(['Gf', 'Gv', 'Gwm', 'Gs', 'Gq']).toContain(g.meta.domain);
      expect(g.meta.icon.length).toBeGreaterThan(0);
      // The human-readable text lives in the dictionaries, one entry per locale.
      for (const locale of LOCALES) {
        const text = getItemText(g.meta.id, locale);
        expect(text.name.length, `${g.meta.id} ${locale}`).toBeGreaterThan(0);
        expect(text.blurb.length, `${g.meta.id} ${locale}`).toBeGreaterThan(0);
        expect(text.description.length, `${g.meta.id} ${locale}`).toBeGreaterThan(40);
        expect(text.seenIn.length, `${g.meta.id} ${locale}`).toBeGreaterThan(0);
      }
    }
  });

  /**
   * A sprintable format must be answerable in a couple of seconds, and a format that plays a
   * sequence before it can be answered never is: the block would be spent watching. Asserted
   * rather than trusted, because `sprintable` is a hand-set boolean and the failure it guards
   * against is silent — a gated format in a sixty-second block simply produces a very low score
   * that looks like the reader's, not the harness's.
   */
  it('never marks a format with a transient stimulus as sprintable', () => {
    for (const g of GENERATORS) {
      if (!g.meta.sprintable) continue;
      for (const d of DIFFICULTIES) {
        for (const seed of SEEDS.slice(0, 20)) {
          const item = generateItem(g.meta.id, seed, d);
          expect(
            item.presentation,
            `${g.meta.id} ${seed} d${d} is sprintable but plays a presentation first`,
          ).toBeUndefined();
        }
      }
    }
  });

  /**
   * A sprint has to have something in it. If the flag were false everywhere the mode would still
   * build, still route, and simply list nothing — a working feature with no content, which is
   * the kind of regression a green suite hides.
   */
  it('leaves at least one format sprintable', () => {
    expect(GENERATORS.filter((g) => g.meta.sprintable).length).toBeGreaterThan(0);
  });

  it('covers all five CHC domains the site claims to train', () => {
    const domains = new Set(GENERATORS.map((g) => g.meta.domain));
    expect([...domains].sort()).toEqual(['Gf', 'Gq', 'Gs', 'Gv', 'Gwm']);
  });

  it('rejects unknown ids rather than returning undefined', () => {
    expect(() => getGenerator('nope' as never)).toThrow(/unknown item type/);
  });
});

describe.each(ITEM_TYPE_IDS)('generator: %s', (id) => {
  it('never throws across every seed and difficulty', () => {
    for (const d of DIFFICULTIES) {
      for (const seed of SEEDS) {
        expect(() => generateItem(id, seed, d), `${id} ${seed} d${d}`).not.toThrow();
      }
    }
  });

  it('is reproducible: the same seed yields a deep-equal item', () => {
    for (const d of DIFFICULTIES) {
      for (const seed of SEEDS.slice(0, 25)) {
        expect(generateItem(id, seed, d)).toEqual(generateItem(id, seed, d));
      }
    }
  });

  it('reports back the seed and difficulty it was asked for', () => {
    for (const d of DIFFICULTIES) {
      for (const seed of SEEDS.slice(0, 20)) {
        const item = generateItem(id, seed, d);
        expect(item.type).toBe(id);
        expect(item.seed).toBe(seed);
        expect(item.difficulty).toBe(d);
      }
    }
  });

  it('produces a well-formed, self-consistent item', () => {
    for (const d of DIFFICULTIES) {
      for (const seed of SEEDS) {
        const item = generateItem(id, seed, d);
        const where = `${id} ${seed} d${d}`;

        expect(item.prompt.length, where).toBeGreaterThan(0);
        expect(item.explanation.summary.length, where).toBeGreaterThan(0);
        expect(item.explanation.rules.length, where).toBeGreaterThan(0);
        expect(item.suggestedSeconds, where).toBeGreaterThan(0);

        if (item.responseMode === 'trail') {
          /*
           * A trail has no option list and no expected string: it is answered by walking a path, and
           * it always completes. What has to hold instead is that the path itself is well formed —
           * the labels are unique and the targets are inside the box — which the solver suite checks
           * in detail. Here it is enough that the option machinery is properly empty rather than
           * half-populated.
           */
          expect(item.options, where).toHaveLength(0);
          expect(item.answerIndex, where).toBe(-1);
          expect(item.errorTypes, where).toHaveLength(0);
          expect(item.stimulus.kind, where).toBe('trail');
        } else if (item.responseMode === 'text' || item.responseMode === 'tap') {
          // Recall formats carry an expected string and no options.
          expect(item.options, where).toHaveLength(0);
          expect(item.answerIndex, where).toBe(-1);
          expect(item.answerText, where).toBeTruthy();
          expect(item.answerText!.length, where).toBeGreaterThan(0);
          /*
           * A tapped response is collected on a surface that has to play itself first, and the
           * response clock starts when playback ends. A `tap` item with no presentation would
           * therefore never unlock — the board would wait for a stream that never runs — so the
           * pairing is asserted rather than assumed.
           */
          if (item.responseMode === 'tap') expect(item.presentation, where).toBeDefined();
        } else {
          expect(item.options.length, where).toBeGreaterThanOrEqual(2);
          expect(item.answerIndex, where).toBeGreaterThanOrEqual(0);
          expect(item.answerIndex, where).toBeLessThan(item.options.length);

          // Options must be pairwise distinct, or "the" answer has no unique referent.
          const keys = item.options.map(optionKey);
          expect(new Set(keys).size, `${where}: duplicate options`).toBe(keys.length);

          // Exactly one option is keyed correct, and it is at answerIndex.
          expect(item.errorTypes, where).toHaveLength(item.options.length);
          expect(item.errorTypes.filter((e) => e === 'correct'), where).toHaveLength(1);
          expect(item.errorTypes[item.answerIndex], where).toBe('correct');
        }
      }
    }
  });

  /**
   * Variety is measured over the whole item, not the stimulus alone, and across all
   * difficulties. Two of the formats have a genuinely small stimulus space — there are
   * only twelve pentominoes, and only so many ways to fold a 4x4 sheet twice — so a
   * stimulus-only measure would fail them for a reason that is not a defect. What
   * actually matters is that a user drilling a type does not meet the same *item* twice.
   */
  it('varies its items across seeds rather than repeating one template', () => {
    /*
     * Interference is exempt, and the exemption is the paradigm rather than a concession. A Stroop
     * task is a *small* stimulus set shown many times: five counts against five digits is
     * twenty-five possible trials in total, and the measurement is the latency difference between
     * two kinds of them, accumulated over repetitions. Novelty would defeat it — an unfamiliar
     * stimulus each time means the automatic response never becomes automatic, and there is then
     * nothing to inhibit. What matters here is that both congruency conditions occur, which
     * `tests/solvers.test.ts` checks directly.
     *
     * `hand-game` is exempt for exactly the same reason, and more starkly: three hands against two
     * instructions is six items in total, and no seed will ever produce a seventh. A conflict task
     * needs the response to *become* automatic before there is anything to inhibit, so a novel
     * stimulus each time would remove the thing being measured. What matters there is that both
     * instructions occur and that all three hands are answered, which the solver suite checks.
     */
    if (id === 'interference' || id === 'hand-game') return;

    const items = DIFFICULTIES.flatMap((d) =>
      SEEDS.map((s) => {
        const { seed: _seed, ...rest } = generateItem(id, s, d);
        return JSON.stringify(rest);
      }),
    );
    const distinct = new Set(items).size;
    expect(distinct, `${id}: only ${distinct}/${items.length} distinct items`).toBeGreaterThan(
      items.length * 0.85,
    );
  });

  it('places the answer without a positional tell', () => {
    const gen = getGenerator(id);
    const first = gen.generate(SEEDS[0]!, 3, 'en');
    // No options, no positions to balance.
    if (first.responseMode !== 'choice' || first.options.length < 4) return; // n/a

    const counts = new Map<number, number>();
    let total = 0;
    for (const d of DIFFICULTIES) {
      for (const seed of SEEDS) {
        const item = generateItem(id, seed, d);
        counts.set(item.answerIndex, (counts.get(item.answerIndex) ?? 0) + 1);
        total++;
      }
    }
    const positions = first.options.length;
    const expected = total / positions;
    for (const [pos, n] of counts) {
      expect(n, `${id}: answer lands at position ${pos} ${n}/${total} times`).toBeGreaterThan(
        expected * 0.5,
      );
      expect(n, `${id}: answer lands at position ${pos} ${n}/${total} times`).toBeLessThan(
        expected * 1.5,
      );
    }
    // Every position must be used at least once.
    expect(counts.size).toBe(positions);
  });
});

describe('cross-generator properties', () => {
  it('makes distractors diagnostic, not arbitrary', () => {
    // Every wrong option should carry a named error type rather than the generic fallback,
    // at least most of the time — that is what lets the review screen say *why* it is wrong.
    for (const id of ITEM_TYPE_IDS) {
      const items = SEEDS.map((s) => generateItem(id, s, 3));
      const choice = items.filter((i) => i.responseMode === 'choice');
      if (choice.length === 0) continue;
      const wrong = choice.flatMap((i) => i.errorTypes.filter((e) => e !== 'correct'));
      const named = wrong.filter((e) => e !== 'plausible');
      // syllogism and odd-one-out have a single uniform error mode; exempt them.
      if (id === 'syllogism' || id === 'symbol-search') continue;
      expect(named.length / wrong.length, `${id} distractor diagnosis rate`).toBeGreaterThan(0.2);
    }
  });

  /**
   * The *answer* has to vary, not just the stimulus.
   *
   * N-back shipped briefly with a fixed match count per difficulty. Every property above
   * passed — the streams genuinely differed — but the answer at a given level was always the
   * same integer, so drilling the format taught you "level 3 means three" and the stream
   * became decoration. `varies its items` could not see it, because it hashes whole items and
   * the streams made every item distinct.
   *
   * Only text-option formats are checked. A figural answer's "value" is a figure, and for
   * odd-one-out the answer is a *position* among freshly generated figures, so there is no
   * comparable value to count.
   */
  it('varies the answer itself, not only the stimulus around it', () => {
    for (const id of ITEM_TYPE_IDS) {
      for (const d of DIFFICULTIES) {
        const answers = SEEDS.map((s) => {
          const item = generateItem(id, s, d);
          if (item.responseMode === 'text' || item.responseMode === 'tap') return item.answerText!;
          // A trail has no answer *value* at all — it is a path, and its variety is its layout.
          if (item.responseMode === 'trail') return null;
          const chosen = item.options[item.answerIndex]!;
          return chosen.kind === 'text' ? chosen.text : null;
        });
        if (answers.some((a) => a === null)) continue; // figural answer: not applicable

        const distinct = new Set(answers).size;
        /*
         * Two is the floor rather than something higher because a genuinely binary format
         * exists: symbol search answers yes or no, and balanced 50/50 is correct there.
         */
        expect(distinct, `${id} d${d}: only ${distinct} distinct answers over ${answers.length} seeds`)
          .toBeGreaterThan(1);
      }
    }
  });

  it('scales suggested time with difficulty', () => {
    for (const id of ITEM_TYPE_IDS) {
      const easy = generateItem(id, 'T', 1).suggestedSeconds;
      const hard = generateItem(id, 'T', 5).suggestedSeconds;
      expect(hard, `${id}`).toBeGreaterThanOrEqual(easy);
    }
  });

  it('generates a full mixed test quickly enough to feel instant', () => {
    const start = performance.now();
    for (const id of ITEM_TYPE_IDS) {
      for (const d of DIFFICULTIES) generateItem(id, 'PERF', d);
    }
    const elapsed = performance.now() - start;
    // 50 items is more than a full test; this must not be a perceptible wait.
    expect(elapsed).toBeLessThan(1000);
  });

  it('produces every item type without exhausting retries at any difficulty', () => {
    const items = allItems();
    expect(items.length).toBe(ITEM_TYPE_IDS.length * DIFFICULTIES.length * SEEDS.length);
  });
});
