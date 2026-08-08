/**
 * Data shaping for the progress charts.
 *
 * Kept separate from the rendering so the interesting part — bucketing, ordering, what
 * counts as a data point — is unit-testable without a browser. The components below it do
 * nothing but turn these arrays into SVG.
 *
 * The honest-reporting rule from docs/IQ-TESTS.md §8 applies here too: these are the
 * user's own numbers over time. No trend line implies a change in ability, and nothing is
 * extrapolated forwards.
 */
import type { ItemTypeId, Session } from './types';
import { median } from './scoring';

/** One finished session, reduced to the quantities a chart can show. */
export interface SessionPoint {
  /** 1-based position in the user's history, which is the x axis. */
  index: number;
  startedAt: number;
  items: number;
  correct: number;
  accuracy: number;
  /** Median latency over the *correct* answers only; null if there were none. */
  medianLatencyMs: number | null;
  peakDifficulty: number;
}

/** Sessions that actually contain answers, oldest first, reduced to plottable points. */
export function sessionTrend(sessions: Session[]): SessionPoint[] {
  return [...sessions]
    .filter((s) => s.responses.length > 0)
    .sort((a, b) => a.startedAt - b.startedAt)
    .map((session, i) => {
      const correct = session.responses.filter((r) => r.correct);
      return {
        index: i + 1,
        startedAt: session.startedAt,
        items: session.responses.length,
        correct: correct.length,
        accuracy: correct.length / session.responses.length,
        medianLatencyMs: median(correct.map((r) => r.latencyMs)),
        peakDifficulty: Math.max(...session.responses.map((r) => r.difficulty)),
      };
    });
}

/**
 * A trailing average, so a single unlucky session does not read as a collapse.
 * Returns `null` until there are enough points to fill the window.
 */
export function movingAverage(values: number[], window: number): (number | null)[] {
  return values.map((_, i) => {
    if (i + 1 < window) return null;
    const slice = values.slice(i + 1 - window, i + 1);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
}

export interface DayBucket {
  /** Local calendar day, `YYYY-MM-DD`. */
  day: string;
  /** Midnight of that day, local time. */
  date: number;
  items: number;
  correct: number;
}

/** Local calendar day key, so a streak follows the user's own midnight, not UTC. */
function dayKey(timestamp: number): string {
  const d = new Date(timestamp);
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function startOfDay(timestamp: number): number {
  const d = new Date(timestamp);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * One bucket per day for the last `days` days, including days with no activity — the
 * gaps are the point of an activity chart.
 */
export function dailyActivity(sessions: Session[], days: number, now = Date.now()): DayBucket[] {
  const byDay = new Map<string, { items: number; correct: number }>();
  for (const session of sessions) {
    if (session.responses.length === 0) continue;
    const key = dayKey(session.startedAt);
    const acc = byDay.get(key) ?? { items: 0, correct: 0 };
    acc.items += session.responses.length;
    acc.correct += session.responses.filter((r) => r.correct).length;
    byDay.set(key, acc);
  }

  const out: DayBucket[] = [];
  const today = startOfDay(now);
  const DAY_MS = 86_400_000;
  for (let i = days - 1; i >= 0; i--) {
    // Re-derive from the timestamp rather than subtracting on the key, so DST-shifted
    // days still land on the right calendar date.
    const date = startOfDay(today - i * DAY_MS);
    const key = dayKey(date);
    const found = byDay.get(key);
    out.push({ day: key, date, items: found?.items ?? 0, correct: found?.correct ?? 0 });
  }
  return out;
}

/**
 * Accuracy per item type across the user's history, in equal-sized chunks of attempts.
 *
 * Chunked by *attempts* rather than by session, because a type may appear once in a
 * twenty-item test and forty times in a drill; sessions would make the x axis mean
 * something different for every type.
 */
export function typeTrend(
  sessions: Session[],
  type: ItemTypeId,
  buckets: number,
): { accuracy: number; attempts: number }[] {
  const responses = [...sessions]
    .sort((a, b) => a.startedAt - b.startedAt)
    .flatMap((s) => s.responses)
    .filter((r) => r.type === type);

  if (responses.length === 0) return [];
  const size = Math.max(1, Math.ceil(responses.length / buckets));

  const out: { accuracy: number; attempts: number }[] = [];
  for (let i = 0; i < responses.length; i += size) {
    const chunk = responses.slice(i, i + size);
    out.push({
      accuracy: chunk.filter((r) => r.correct).length / chunk.length,
      attempts: chunk.length,
    });
  }
  return out;
}

/**
 * Overall accuracy split into the first and the most recent half of the history.
 * Deliberately coarse: with a handful of sessions, anything finer is noise.
 */
export function firstVsRecent(
  points: SessionPoint[],
): { first: number; recent: number; delta: number } | null {
  // Fewer than four sessions is not a trend, it is a coin toss.
  if (points.length < 4) return null;
  const half = Math.floor(points.length / 2);
  const mean = (xs: SessionPoint[]) =>
    xs.reduce((a, p) => a + p.correct, 0) / xs.reduce((a, p) => a + p.items, 0);
  const first = mean(points.slice(0, half));
  const recent = mean(points.slice(points.length - half));
  return { first, recent, delta: recent - first };
}

// ---------------------------------------------------------------------------
// Geometry helpers, shared by the chart components
// ---------------------------------------------------------------------------

export interface Scale {
  min: number;
  max: number;
}

/** Maps a value onto 0..1 within a scale, clamped. */
export function normalise(value: number, scale: Scale): number {
  if (scale.max === scale.min) return 0.5;
  return Math.min(1, Math.max(0, (value - scale.min) / (scale.max - scale.min)));
}

/**
 * A scale that rounds out to readable bounds, and is never degenerate.
 *
 * `lo`/`hi` are ordered before the span is taken. Taking `max - min` directly produced a
 * negative span for all-negative input, and `Math.log10` of that is NaN — a NaN scale
 * silently blanks a chart rather than failing, which is the worst way for this to break.
 */
export function niceScale(values: number[], fromZero = true): Scale {
  const usable = values.filter((v) => Number.isFinite(v));
  if (usable.length === 0) return { min: 0, max: 1 };

  const dataMax = Math.max(...usable);
  const dataMin = Math.min(...usable);
  const lo = fromZero ? Math.min(0, dataMin) : dataMin;
  const hi = fromZero ? Math.max(0, dataMax) : dataMax;
  if (hi === lo) return { min: lo, max: lo + 1 };

  const step = 10 ** Math.floor(Math.log10(hi - lo));
  const max = Math.ceil(hi / step) * step;
  const min = fromZero ? lo : Math.floor(lo / step) * step;
  return max > min ? { min, max } : { min, max: min + 1 };
}

/** An SVG path through points already projected into chart space. */
export function linePath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${round(p.x)} ${round(p.y)}`)
    .join(' ');
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
