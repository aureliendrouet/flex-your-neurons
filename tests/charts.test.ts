import { describe, expect, it } from 'vitest';
import {
  dailyActivity,
  firstVsRecent,
  linePath,
  movingAverage,
  niceScale,
  normalise,
  sessionTrend,
  typeTrend,
} from '@/lib/charts';
import type { ItemTypeId, Response, Session } from '@/lib/types';

const DAY = 86_400_000;

function response(type: ItemTypeId, correct: boolean, latencyMs = 1000): Response {
  return { type, seed: 'S', difficulty: 3, chosenIndex: 0, answerIndex: 0, correct, latencyMs };
}

function session(startedAt: number, responses: Response[]): Session {
  return {
    id: `s${startedAt}`,
    mode: 'practice',
    seed: 'SEED',
    types: ['matrix'],
    startedAt,
    finishedAt: startedAt + 1000,
    responses,
  };
}

/** Midday, so a day bucket cannot be pushed across midnight by a timezone offset. */
function daysAgo(n: number, now: number): number {
  const d = new Date(now);
  d.setHours(12, 0, 0, 0);
  return d.getTime() - n * DAY;
}

describe('sessionTrend', () => {
  it('orders oldest first and numbers sessions from one', () => {
    const now = Date.now();
    const points = sessionTrend([
      session(now, [response('matrix', true)]),
      session(now - DAY, [response('matrix', false)]),
    ]);
    expect(points.map((p) => p.index)).toEqual([1, 2]);
    expect(points[0]!.startedAt).toBeLessThan(points[1]!.startedAt);
  });

  it('computes accuracy and peak difficulty per session', () => {
    const points = sessionTrend([
      session(1000, [
        response('matrix', true),
        response('matrix', true),
        response('matrix', false),
        response('matrix', false),
      ]),
    ]);
    expect(points[0]!.accuracy).toBe(0.5);
    expect(points[0]!.items).toBe(4);
    expect(points[0]!.correct).toBe(2);
    expect(points[0]!.peakDifficulty).toBe(3);
  });

  it('takes median latency over correct answers only', () => {
    // A wrong answer mostly measures how long someone stared at it, not how fast they are.
    const points = sessionTrend([
      session(1000, [
        response('matrix', true, 100),
        response('matrix', true, 300),
        response('matrix', false, 90_000),
      ]),
    ]);
    expect(points[0]!.medianLatencyMs).toBe(200);
  });

  it('reports null latency when nothing was answered correctly', () => {
    const points = sessionTrend([session(1000, [response('matrix', false, 500)])]);
    expect(points[0]!.medianLatencyMs).toBeNull();
  });

  it('skips sessions with no responses', () => {
    expect(sessionTrend([session(1000, [])])).toEqual([]);
  });
});

describe('movingAverage', () => {
  it('is null until the window is full', () => {
    expect(movingAverage([1, 2, 3, 4], 3)).toEqual([null, null, 2, 3]);
  });

  it('averages the trailing window', () => {
    expect(movingAverage([0, 0, 0, 3], 2)).toEqual([null, 0, 0, 1.5]);
  });

  it('handles a window longer than the data', () => {
    expect(movingAverage([1, 2], 5)).toEqual([null, null]);
  });
});

describe('dailyActivity', () => {
  const now = new Date('2026-08-08T15:00:00').getTime();

  it('returns one bucket per day, including empty ones', () => {
    const days = dailyActivity([session(daysAgo(2, now), [response('matrix', true)])], 7, now);
    expect(days).toHaveLength(7);
    expect(days.filter((d) => d.items > 0)).toHaveLength(1);
    // Gaps are the point of an activity chart; they must not be collapsed away.
    expect(days.filter((d) => d.items === 0)).toHaveLength(6);
  });

  it('puts the most recent day last', () => {
    const days = dailyActivity([], 5, now);
    expect(days[days.length - 1]!.date).toBeGreaterThan(days[0]!.date);
  });

  it('sums several sessions on the same day', () => {
    const at = daysAgo(1, now);
    const days = dailyActivity(
      [
        session(at, [response('matrix', true), response('matrix', false)]),
        session(at + 3600_000, [response('matrix', true)]),
      ],
      7,
      now,
    );
    const busy = days.find((d) => d.items > 0)!;
    expect(busy.items).toBe(3);
    expect(busy.correct).toBe(2);
  });

  it('ignores activity older than the window', () => {
    const days = dailyActivity([session(daysAgo(90, now), [response('matrix', true)])], 7, now);
    expect(days.every((d) => d.items === 0)).toBe(true);
  });
});

describe('typeTrend', () => {
  it('buckets a type’s attempts in chronological order', () => {
    const sessions = [
      session(1000, [response('matrix', false), response('matrix', false)]),
      session(2000, [response('matrix', true), response('matrix', true)]),
    ];
    const trend = typeTrend(sessions, 'matrix', 2);
    expect(trend).toHaveLength(2);
    expect(trend[0]!.accuracy).toBe(0);
    expect(trend[1]!.accuracy).toBe(1);
  });

  it('ignores other item types', () => {
    const sessions = [session(1000, [response('syllogism', true), response('matrix', false)])];
    const trend = typeTrend(sessions, 'matrix', 4);
    expect(trend).toHaveLength(1);
    expect(trend[0]!.attempts).toBe(1);
    expect(trend[0]!.accuracy).toBe(0);
  });

  it('returns nothing for a type never attempted', () => {
    expect(typeTrend([session(1000, [response('matrix', true)])], 'rotation', 4)).toEqual([]);
  });

  it('never produces more buckets than requested', () => {
    const many = Array.from({ length: 50 }, () => response('matrix', true));
    expect(typeTrend([session(1000, many)], 'matrix', 8).length).toBeLessThanOrEqual(8);
  });
});

describe('firstVsRecent', () => {
  it('refuses to call a trend on too little history', () => {
    const points = sessionTrend([
      session(1000, [response('matrix', true)]),
      session(2000, [response('matrix', true)]),
      session(3000, [response('matrix', true)]),
    ]);
    expect(firstVsRecent(points)).toBeNull();
  });

  it('compares the first half against the most recent half', () => {
    const wrong = () => session(0, [response('matrix', false), response('matrix', false)]);
    const right = () => session(0, [response('matrix', true), response('matrix', true)]);
    const points = sessionTrend([
      { ...wrong(), id: 'a', startedAt: 1000 },
      { ...wrong(), id: 'b', startedAt: 2000 },
      { ...right(), id: 'c', startedAt: 3000 },
      { ...right(), id: 'd', startedAt: 4000 },
    ]);
    const change = firstVsRecent(points)!;
    expect(change.first).toBe(0);
    expect(change.recent).toBe(1);
    expect(change.delta).toBe(1);
  });

  it('weights by items answered, not by session count', () => {
    // A one-item session must not count as much as a twenty-item one.
    const points = sessionTrend([
      session(1000, [response('matrix', false)]),
      session(2000, Array.from({ length: 19 }, () => response('matrix', false))),
      session(3000, Array.from({ length: 19 }, () => response('matrix', true))),
      session(4000, [response('matrix', true)]),
    ]);
    const change = firstVsRecent(points)!;
    expect(change.first).toBe(0);
    expect(change.recent).toBe(1);
  });
});

describe('scales and paths', () => {
  it('normalises within a scale and clamps outside it', () => {
    expect(normalise(5, { min: 0, max: 10 })).toBe(0.5);
    expect(normalise(-5, { min: 0, max: 10 })).toBe(0);
    expect(normalise(50, { min: 0, max: 10 })).toBe(1);
  });

  it('does not divide by zero on a flat scale', () => {
    expect(normalise(3, { min: 3, max: 3 })).toBe(0.5);
  });

  it('rounds a scale up to a readable maximum', () => {
    expect(niceScale([120, 340, 890]).max).toBeGreaterThanOrEqual(890);
    expect(niceScale([]).max).toBe(1);
  });

  it('never produces a scale that would divide by zero', () => {
    for (const values of [[], [0], [0, 0], [7, 7], [5], [-3, -3]]) {
      const scale = niceScale(values);
      expect(scale.max, JSON.stringify(values)).toBeGreaterThan(scale.min);
    }
  });

  it('always includes zero when asked to', () => {
    expect(niceScale([120, 340]).min).toBe(0);
  });

  it('builds a path that starts with a move', () => {
    expect(linePath([{ x: 0, y: 1 }, { x: 2, y: 3 }])).toBe('M 0 1 L 2 3');
    expect(linePath([])).toBe('');
  });
});
