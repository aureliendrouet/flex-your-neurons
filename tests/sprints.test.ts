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
import { interferenceScore, sprintSummary, summarise, untimedSessions } from '@/lib/scoring';
import { generateItem } from '@/lib/generators';
import { isCongruent } from '@/lib/generators/interference';
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
  opts: { plannedMs?: number; finishedAt?: number | null; type?: ItemTypeId } = {},
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
});
