import { describe, expect, it } from 'vitest';
import { dominantErrorType, tallyErrorTypes } from '@/lib/scoring';
import { generateItem, ITEM_TYPE_IDS } from '@/lib/generators';
import { makeResponse } from '@/lib/store';
import { dict, LOCALES } from '@/lib/i18n';
import { DIFFICULTIES } from '@/lib/types';
import type { ErrorType, Response } from '@/lib/types';

function wrong(errorType: ErrorType | undefined, count = 1): Response[] {
  return Array.from({ length: count }, () => ({
    type: 'matrix' as const,
    seed: 'S',
    difficulty: 3 as const,
    chosenIndex: 1,
    answerIndex: 0,
    correct: false,
    latencyMs: 1000,
    ...(errorType === undefined ? {} : { errorType }),
  }));
}

const right: Response = {
  type: 'matrix',
  seed: 'S',
  difficulty: 3,
  chosenIndex: 0,
  answerIndex: 0,
  correct: true,
  latencyMs: 900,
  errorType: 'correct',
};

describe('error-type tally', () => {
  it('counts only diagnosed wrong answers, commonest first', () => {
    const tally = tallyErrorTypes([
      ...wrong('wrong-axis', 3),
      ...wrong('off-by-one', 1),
      ...wrong('copy', 2),
      right,
    ]);
    expect(tally).toEqual([
      { errorType: 'wrong-axis', count: 3 },
      { errorType: 'copy', count: 2 },
      { errorType: 'off-by-one', count: 1 },
    ]);
  });

  /**
   * A history written before the taxonomy was surfaced carries no `errorType`. Those
   * responses must vanish from the breakdown rather than pile into a bucket — otherwise
   * the page would report a habit the user never had.
   */
  it('ignores responses with no diagnosis', () => {
    expect(tallyErrorTypes(wrong(undefined, 5))).toEqual([]);
    // A text-entry format has no distractors, so nothing is diagnosable there either.
    expect(tallyErrorTypes([...wrong(undefined, 2), ...wrong('mirror', 1)])).toEqual([
      { errorType: 'mirror', count: 1 },
    ]);
  });

  it('never counts a correct answer as a mistake', () => {
    expect(tallyErrorTypes([right, right])).toEqual([]);
    // Belt and braces: a 'correct' tag on a response marked wrong is still not a mistake
    // anyone can be told about, so it is dropped rather than displayed.
    expect(tallyErrorTypes(wrong('correct', 3))).toEqual([]);
  });

  it('gives a stable order when counts tie', () => {
    const a = tallyErrorTypes([...wrong('mirror'), ...wrong('copy')]);
    const b = tallyErrorTypes([...wrong('copy'), ...wrong('mirror')]);
    expect(a).toEqual(b);
  });
});

describe('dominant error type', () => {
  it('names a habit that genuinely stands out', () => {
    const tally = tallyErrorTypes([...wrong('wrong-axis', 4), ...wrong('copy', 1)]);
    expect(dominantErrorType(tally)).toEqual({ errorType: 'wrong-axis', count: 4 });
  });

  /** One occurrence is an incident, not a habit. */
  it('refuses to name a habit from a single error', () => {
    expect(dominantErrorType(tallyErrorTypes(wrong('mirror', 1)))).toBeNull();
  });

  it('refuses when the errors are spread thin', () => {
    // 2 of 7 is under a third: naming it would be reading a pattern into noise.
    const tally = tallyErrorTypes([
      ...wrong('mirror', 2),
      ...wrong('copy', 2),
      ...wrong('off-by-one', 2),
      ...wrong('wrong-rule', 1),
    ]);
    expect(dominantErrorType(tally)).toBeNull();
  });

  it('refuses on a tie for first place', () => {
    const tally = tallyErrorTypes([...wrong('mirror', 3), ...wrong('copy', 3)]);
    expect(dominantErrorType(tally)).toBeNull();
  });

  it('handles an empty tally', () => {
    expect(dominantErrorType([])).toBeNull();
  });
});

describe('every diagnosis can be named', () => {
  /**
   * The load-bearing property of Phase 1: whatever any generator puts in `errorTypes`,
   * the feedback panel must have words for it — in both languages. A missing key would
   * surface as `undefined` next to a wrong answer, which is worse than saying nothing.
   */
  it('has a tag and a body for every error type any generator emits', () => {
    const emitted = new Set<ErrorType>();
    for (const id of ITEM_TYPE_IDS) {
      for (const difficulty of DIFFICULTIES) {
        for (let i = 0; i < 12; i++) {
          for (const e of generateItem(id, `DIAG${i}`, difficulty).errorTypes) emitted.add(e);
        }
      }
    }
    // Not just a smoke test: the taxonomy is only worth surfacing if the generators
    // actually use most of it.
    expect(emitted.size).toBeGreaterThanOrEqual(6);

    for (const locale of LOCALES) {
      const t = dict(locale).diagnosis;
      for (const errorType of emitted) {
        expect(t.tags[errorType], `${locale} tag ${errorType}`).toBeTruthy();
        expect(t.bodies[errorType]?.length, `${locale} body ${errorType}`).toBeGreaterThan(40);
      }
    }
  });
});

describe('recorded responses carry the diagnosis', () => {
  it('stores the error type of the option actually chosen', () => {
    const item = generateItem('matrix', 'RECORD1', 3);
    const picked = item.answerIndex === 0 ? 1 : 0;
    const response = makeResponse(
      item.type,
      item.seed,
      item.difficulty,
      item.answerIndex,
      picked,
      false,
      1200,
      undefined,
      item.errorTypes[picked],
    );
    expect(response.errorType).toBe(item.errorTypes[picked]);
    expect(response.errorType).not.toBe('correct');
  });

  /** A skipped or typed answer has no chosen option, so there is nothing to diagnose. */
  it('leaves the key absent when there is no chosen option', () => {
    const response = makeResponse('span', 'S', 3, -1, null, false, 1200, 'ZZZ', undefined);
    expect('errorType' in response).toBe(false);
  });
});
