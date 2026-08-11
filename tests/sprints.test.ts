/**
 * The continuous timed block, and the one property that makes it trustworthy: a sprint's numbers
 * and a practice drill's numbers are never mixed.
 *
 * That separation is easy to state and easy to lose. A sprint's latencies measure how fast someone
 * *chose* to go, and its accuracy is pushed down by the speed–accuracy trade-off the clock
 * imposes; both are pinned to one difficulty for the whole block. Pooling them into the per-type
 * medians would move every practice figure the first time a reader sprinted, with nothing on
 * screen to say the measurement underneath had changed. So it is asserted, not assumed.
 */
import { describe, expect, it } from 'vitest';
import {
  interferenceScore,
  sprintSummary,
  summarise,
  switchCostScore,
  untimedSessions,
} from '@/lib/scoring';
import { generateItem, ITEM_VERSION } from '@/lib/generators';
import { isCongruent } from '@/lib/generators/interference';
import { isFormB } from '@/lib/generators/trail-making';
import type { Difficulty, ItemTypeId, Response, Session, SessionMode } from '@/lib/types';

function response(correct: boolean, latencyMs: number, difficulty: Difficulty = 2): Response {
  return {
    type: 'coding',
    seed: 'S',
    difficulty,
    chosenIndex: correct ? 0 : 1,
    answerIndex: 0,
    correct,
    latencyMs,
  };
}

let counter = 0;
function session(
  mode: SessionMode,
  responses: Response[],
  opts: {
    plannedMs?: number;
    finishedAt?: number | null;
    type?: ItemTypeId;
    /** Defaults to the current generation; pass a stale one to test the re-derivation guard. */
    itemVersion?: number;
  } = {},
): Session {
  counter++;
  return {
    id: `s${counter}`,
    mode,
    seed: `SEED${counter}`,
    types: [opts.type ?? 'coding'],
    startedAt: 1_700_000_000_000 + counter * 1000,
    finishedAt: opts.finishedAt === undefined ? 1_700_000_000_000 + counter * 2000 : opts.finishedAt,
    responses,
    itemVersion: opts.itemVersion === undefined ? ITEM_VERSION : opts.itemVersion,
    ...(opts.plannedMs === undefined ? {} : { plannedMs: opts.plannedMs }),
  };
}

describe('sprints are kept out of the untimed statistics', () => {
  it('excludes sprint sessions from summarise', () => {
    const practice = session('practice', [response(true, 4000), response(false, 5000)]);
    const sprint = session('sprint', Array.from({ length: 20 }, () => response(true, 500)), {
      plannedMs: 60_000,
    });

    const pooled = summarise([practice, sprint]);
    const untimedOnly = summarise([practice]);

    // Identical, or the sprint leaked in.
    expect(pooled.overall.attempts).toBe(untimedOnly.overall.attempts);
    expect(pooled.overall.medianLatencyMs).toBe(untimedOnly.overall.medianLatencyMs);
    expect(pooled.byType).toEqual(untimedOnly.byType);
  });

  /**
   * The specific failure this guards. Twenty fast sprint responses against two slow practice ones
   * would drag a per-type median from seconds to hundreds of milliseconds — a dramatic apparent
   * improvement that is entirely an artefact of which mode the responses came from.
   */
  it('does not let a sprint drag the practice median down', () => {
    const practice = session('practice', [response(true, 4000), response(true, 4200)]);
    const sprint = session('sprint', Array.from({ length: 20 }, () => response(true, 300)), {
      plannedMs: 60_000,
    });
    const stats = summarise([practice, sprint]).byType.find((s) => s.type === 'coding');
    expect(stats?.medianLatencyMs).toBe(4100);
  });

  it('reports the untimed sessions and nothing else', () => {
    const all = [
      session('practice', [response(true, 1000)]),
      session('test', [response(true, 1000)]),
      session('sprint', [response(true, 400)], { plannedMs: 30_000 }),
    ];
    expect(untimedSessions(all).map((s) => s.mode)).toEqual(['practice', 'test']);
  });
});

describe('sprint scoring', () => {
  it('scores a run as a count and a rate per minute', () => {
    const runs = sprintSummary([
      session('sprint', [response(true, 400), response(false, 300), response(true, 500)], {
        plannedMs: 30_000,
      }),
    ]);
    expect(runs).toHaveLength(1);
    const run = runs[0]!.latest;
    expect(run.attempted).toBe(3);
    expect(run.correct).toBe(2);
    expect(run.accuracy).toBeCloseTo(2 / 3);
    // Two correct in half a minute is four a minute.
    expect(run.perMinute).toBeCloseTo(4);
  });

  /**
   * A rate is what makes windows of different lengths comparable. Without it, the longer window
   * would always look like the better performance simply for containing more items.
   */
  it('normalises so a longer window is not automatically a better score', () => {
    const short = session('sprint', Array.from({ length: 5 }, () => response(true, 400)), {
      plannedMs: 15_000,
    });
    const long = session('sprint', Array.from({ length: 12 }, () => response(true, 400)), {
      plannedMs: 60_000,
    });
    const [stats] = sprintSummary([short, long]);
    // 20/min against 12/min: the short run is the better one despite the smaller count.
    expect(stats!.best.plannedMs).toBe(15_000);
    expect(stats!.best.correct).toBe(5);
  });

  it('skips sessions that never recorded the window they were scored in', () => {
    // Written before sprints carried `plannedMs`, or abandoned before the clock started.
    const legacy = session('sprint', [response(true, 400)]);
    const unfinished = session('sprint', [response(true, 400)], {
      plannedMs: 60_000,
      finishedAt: null,
    });
    const empty = session('sprint', [], { plannedMs: 60_000 });
    expect(sprintSummary([legacy, unfinished, empty])).toEqual([]);
  });

  it('groups by format and orders formats by most recent activity', () => {
    const older = session('sprint', [response(true, 400)], { plannedMs: 30_000, type: 'coding' });
    const newer = session('sprint', [response(true, 400)], {
      plannedMs: 30_000,
      type: 'symbol-search',
    });
    const stats = sprintSummary([older, newer]);
    expect(stats.map((s) => s.type)).toEqual(['symbol-search', 'coding']);
  });

  /** A later run that merely ties a personal best has not beaten it. */
  it('breaks a tie on rate towards the earlier run', () => {
    const first = session('sprint', [response(true, 400)], { plannedMs: 30_000 });
    const second = session('sprint', [response(true, 400)], { plannedMs: 30_000 });
    const [stats] = sprintSummary([first, second]);
    expect(stats!.best.sessionId).toBe(first.id);
    expect(stats!.latest.sessionId).toBe(second.id);
  });
});

/**
 * The interference score, and specifically that it is recoverable *without* having been stored.
 *
 * Congruency was never written into a response. It is a property of the item, and the item
 * regenerates exactly from `(type, seed, difficulty)` — so the partition is re-derived at read time.
 * These tests build history the way the app does (real seeds, real difficulties) and check the
 * contrast comes back out.
 */
describe('the interference score', () => {
  /**
   * Finds seeds of each congruency by generating items, which is what a real session would have
   * produced. Hand-writing "a congruent response" is not possible: congruency is not a field.
   */
  function seedsByCongruency(difficulty: Difficulty, wanted: boolean, count: number): string[] {
    const found: string[] = [];
    for (let i = 0; found.length < count && i < 4000; i++) {
      const seed = `SC${i}`;
      const item = generateItem('interference', seed, difficulty);
      if (item.stimulus.kind !== 'interference') continue;
      if (isCongruent(item.stimulus.glyphs) === wanted) found.push(seed);
    }
    expect(found.length, `only found ${found.length} ${wanted ? 'congruent' : 'incongruent'} seeds`).toBe(count);
    return found;
  }

  function interferenceResponse(seed: string, latencyMs: number): Response {
    const item = generateItem('interference', seed, 3);
    return {
      type: 'interference',
      seed,
      difficulty: 3,
      chosenIndex: item.answerIndex,
      answerIndex: item.answerIndex,
      correct: true,
      latencyMs,
    };
  }

  it('re-derives congruency from the seed and reports the contrast', () => {
    const congruent = seedsByCongruency(3, true, 10).map((s) => interferenceResponse(s, 600));
    const incongruent = seedsByCongruency(3, false, 10).map((s) => interferenceResponse(s, 800));
    const score = interferenceScore([session('practice', [...congruent, ...incongruent])]);

    expect(score).not.toBeNull();
    expect(score!.congruentMs).toBe(600);
    expect(score!.incongruentMs).toBe(800);
    expect(score!.interferenceMs).toBe(200);
    expect(score!.congruentTrials).toBe(10);
    expect(score!.incongruentTrials).toBe(10);
  });

  it('reports nothing until both conditions have enough trials', () => {
    const congruent = seedsByCongruency(3, true, 10).map((s) => interferenceResponse(s, 600));
    const incongruent = seedsByCongruency(3, false, 2).map((s) => interferenceResponse(s, 800));
    // A median of two latencies is not a median; a contrast drawn from it is noise with a number on.
    expect(interferenceScore([session('practice', [...congruent, ...incongruent])])).toBeNull();
  });

  it('times only the trials that were answered correctly', () => {
    const congruent = seedsByCongruency(3, true, 10).map((s) => interferenceResponse(s, 600));
    const incongruent = seedsByCongruency(3, false, 10).map((s) => interferenceResponse(s, 800));
    /*
     * A thirty-second wrong answer must not enter the median. The time taken to reach a wrong answer
     * mostly measures how long someone was willing to stare at it, and one such trial would move a
     * contrast that lives in tens of milliseconds.
     */
    const wrong = { ...incongruent[0]!, correct: false, latencyMs: 30_000 };
    const score = interferenceScore([
      session('practice', [...congruent, ...incongruent.slice(1), wrong]),
    ]);
    expect(score).not.toBeNull();
    expect(score!.incongruentMs).toBe(800);
    // Nine timed trials, not ten: the wrong one was excluded rather than merely down-weighted.
    expect(score!.incongruentTrials).toBe(9);
  });

  it('ignores every other format', () => {
    const congruent = seedsByCongruency(3, true, 10).map((s) => interferenceResponse(s, 600));
    const incongruent = seedsByCongruency(3, false, 10).map((s) => interferenceResponse(s, 800));
    const noise = Array.from({ length: 40 }, () => response(true, 5000));
    const score = interferenceScore([session('practice', [...congruent, ...incongruent, ...noise])]);
    expect(score!.interferenceMs).toBe(200);
  });

  it('ignores sprint blocks, which would flatten the contrast towards zero', () => {
    /*
     * The regression for the one read-out that forgot `untimedSessions`. A sprint's latencies are a
     * measure of how fast someone chose to go under a running clock, so both conditions collapse
     * towards the same floor and take their difference with them — and because a sprint produces
     * items quickly, its trials outnumber the practice ones within a single block.
     */
    const congruent = seedsByCongruency(3, true, 10).map((s) => interferenceResponse(s, 600));
    const incongruent = seedsByCongruency(3, false, 10).map((s) => interferenceResponse(s, 800));
    const rushedCongruent = seedsByCongruency(4, true, 30).map((s) => interferenceResponse(s, 250));
    const rushedIncongruent = seedsByCongruency(4, false, 30).map((s) =>
      interferenceResponse(s, 260),
    );

    const score = interferenceScore([
      session('practice', [...congruent, ...incongruent]),
      session('sprint', [...rushedCongruent, ...rushedIncongruent]),
    ]);

    expect(score).not.toBeNull();
    expect(score!.interferenceMs).toBe(200);
    expect(score!.congruentTrials).toBe(10);
    expect(score!.incongruentTrials).toBe(10);
  });
});

/**
 * The trail-making switch cost, built and checked the same way as the interference score.
 *
 * Form was never stored on a response either — it is a property of the item, recoverable by
 * regenerating from the seed. The one deliberate difference from the Stroop contrast: this uses every
 * completed board rather than only the error-free ones, because a trail is scored on time in the real
 * task and a run with one misclick is a slightly slower run, not an invalid one.
 */
describe('the switch cost', () => {
  function seedsByForm(difficulty: Difficulty, wantFormB: boolean, count: number): string[] {
    const found: string[] = [];
    for (let i = 0; found.length < count && i < 4000; i++) {
      const seed = `SW${i}`;
      const item = generateItem('trail-making', seed, difficulty);
      if (item.stimulus.kind !== 'trail') continue;
      if (isFormB(item.stimulus.nodes) === wantFormB) found.push(seed);
    }
    expect(found.length, `only found ${found.length} form-${wantFormB ? 'B' : 'A'} seeds`).toBe(count);
    return found;
  }

  function trailResponse(seed: string, latencyMs: number, correct = true): Response {
    return {
      type: 'trail-making',
      seed,
      difficulty: 2,
      chosenIndex: null,
      answerIndex: -1,
      correct,
      latencyMs,
    };
  }

  it('re-derives the form from the seed and reports the contrast', () => {
    const formA = seedsByForm(2, false, 5).map((s) => trailResponse(s, 9_000));
    const formB = seedsByForm(2, true, 5).map((s) => trailResponse(s, 15_000));
    const score = switchCostScore([session('practice', [...formA, ...formB])]);

    expect(score).not.toBeNull();
    expect(score!.formAMs).toBe(9_000);
    expect(score!.formBMs).toBe(15_000);
    expect(score!.switchCostMs).toBe(6_000);
    expect(score!.formATrials).toBe(5);
    expect(score!.formBTrials).toBe(5);
  });

  it('reports nothing until both forms have enough boards', () => {
    const formA = seedsByForm(2, false, 5).map((s) => trailResponse(s, 9_000));
    const formB = seedsByForm(2, true, 2).map((s) => trailResponse(s, 15_000));
    expect(switchCostScore([session('practice', [...formA, ...formB])])).toBeNull();
  });

  /**
   * Unlike the Stroop contrast, a run with a misclick still counts. It finished, and the correction is
   * already inside the time — which is exactly what the real task scores.
   */
  it('counts every completed board, including ones with a wrong click', () => {
    const formA = seedsByForm(2, false, 5).map((s) => trailResponse(s, 9_000));
    const formB = seedsByForm(2, true, 5).map((s, i) => trailResponse(s, 15_000, i !== 0));
    const score = switchCostScore([session('practice', [...formA, ...formB])]);
    expect(score!.formBTrials).toBe(5);
    expect(score!.formBMs).toBe(15_000);
  });

  it('ignores every other format', () => {
    const formA = seedsByForm(2, false, 5).map((s) => trailResponse(s, 9_000));
    const formB = seedsByForm(2, true, 5).map((s) => trailResponse(s, 15_000));
    const noise = Array.from({ length: 30 }, () => response(true, 400));
    const score = switchCostScore([session('practice', [...formA, ...formB, ...noise])]);
    expect(score!.switchCostMs).toBe(6_000);
  });
});

/**
 * A response stores a seed, and both contrasts above recover a *condition* by regenerating the item
 * from it. That inference silently expires when a generator changes: the same seed now yields a
 * different board, so old responses are sorted by a condition their reader never faced. The contrast
 * keeps returning a confident number computed from a coin flip, which is the worst possible failure —
 * a wrong statistic is less useful than no statistic.
 *
 * Sessions therefore carry the generator generation they were played at, and only the current one is
 * re-derivable. Everything a response records directly — accuracy, latency, the chosen error type —
 * is unaffected by a bump and keeps being counted, so this narrows two read-outs rather than
 * discarding history.
 */
describe('re-derived contrasts only read the generation they were played at', () => {
  function seedsByForm(difficulty: Difficulty, wantFormB: boolean, count: number): string[] {
    const found: string[] = [];
    for (let i = 0; found.length < count && i < 4000; i++) {
      const seed = `GEN${i}`;
      const item = generateItem('trail-making', seed, difficulty);
      if (item.stimulus.kind !== 'trail') continue;
      if (isFormB(item.stimulus.nodes) === wantFormB) found.push(seed);
    }
    return found;
  }

  function trailResponse(seed: string, latencyMs: number): Response {
    return {
      type: 'trail-making',
      seed,
      difficulty: 2,
      chosenIndex: null,
      answerIndex: -1,
      correct: true,
      latencyMs,
    };
  }

  const formA = seedsByForm(2, false, 5).map((s) => trailResponse(s, 9_000));
  const formB = seedsByForm(2, true, 5).map((s) => trailResponse(s, 15_000));
  const trails = [...formA, ...formB];

  it('drops sessions stamped with an older generation', () => {
    expect(switchCostScore([session('practice', trails, { itemVersion: ITEM_VERSION - 1 })])).toBeNull();
    expect(switchCostScore([session('practice', trails)])).not.toBeNull();
  });

  it('drops sessions written before the stamp existed', () => {
    // Not merely an old number — no number at all, which is the shape every pre-2026-08 session has.
    const legacy = session('practice', trails);
    delete legacy.itemVersion;
    expect(switchCostScore([legacy])).toBeNull();
  });

  it('still counts an older session everywhere the response speaks for itself', () => {
    // Accuracy and latency were measured, not inferred. A generator change cannot invalidate them.
    const stale = session('practice', trails, { itemVersion: ITEM_VERSION - 1 });
    const summary = summarise([stale]);
    expect(summary.overall.attempts).toBe(trails.length);
    expect(untimedSessions([stale])).toHaveLength(1);
  });
});
