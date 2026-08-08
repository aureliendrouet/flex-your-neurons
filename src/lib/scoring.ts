/**
 * Scoring and progress statistics.
 *
 * Deliberately absent: any IQ score, percentile, or normative comparison. Without a
 * representative standardisation sample those numbers would be fabricated
 * (docs/IQ-TESTS.md §8). What is reported instead is the user's own accuracy, speed, and
 * change over time — quantities this app can actually measure.
 */
import type { ChcDomain, Difficulty, ItemTypeId, Response, Session } from './types';
import { getMeta } from './generators';
import { dict, DEFAULT_LOCALE, type Locale } from './i18n';

export function isCorrect(
  item: { responseMode: 'choice' | 'text'; answerIndex: number; answerText?: string },
  chosenIndex: number | null,
  chosenText?: string,
): boolean {
  if (item.responseMode === 'text') {
    if (chosenText === undefined) return false;
    return normaliseTextAnswer(chosenText) === normaliseTextAnswer(item.answerText ?? '');
  }
  return chosenIndex !== null && chosenIndex === item.answerIndex;
}

/** Spaces, dashes and case are noise in a recall answer, not errors. */
export function normaliseTextAnswer(text: string): string {
  return text.replace(/[\s,\-_]/g, '').toUpperCase();
}

export interface TypeStats {
  type: ItemTypeId;
  attempts: number;
  correct: number;
  /** 0-1, or null when there are no attempts. */
  accuracy: number | null;
  medianLatencyMs: number | null;
  bestStreak: number;
  lastPlayedAt: number | null;
  /** Highest difficulty at which the user has answered correctly. */
  peakDifficulty: Difficulty | null;
}

export interface DomainStats {
  domain: ChcDomain;
  attempts: number;
  correct: number;
  accuracy: number | null;
}

export interface OverallStats {
  attempts: number;
  correct: number;
  accuracy: number | null;
  medianLatencyMs: number | null;
  sessions: number;
  /** Consecutive calendar days with at least one answered item, ending today. */
  dayStreak: number;
}

export interface Summary {
  overall: OverallStats;
  byType: TypeStats[];
  byDomain: DomainStats[];
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1]! + sorted[mid]!) / 2) : sorted[mid]!;
}

function longestStreak(responses: Response[]): number {
  let best = 0;
  let run = 0;
  for (const r of responses) {
    run = r.correct ? run + 1 : 0;
    if (run > best) best = run;
  }
  return best;
}

export function allResponses(sessions: Session[]): Response[] {
  return sessions.flatMap((s) => s.responses);
}

/** Local calendar day as `YYYY-MM-DD`, so a streak follows the user's own midnight. */
function dayKey(timestamp: number): string {
  const d = new Date(timestamp);
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function computeDayStreak(sessions: Session[], now = Date.now()): number {
  const days = new Set(
    sessions.filter((s) => s.responses.length > 0).map((s) => dayKey(s.startedAt)),
  );
  if (days.size === 0) return 0;

  const DAY_MS = 86_400_000;
  // A streak counts back from today, or from yesterday if today has no activity yet —
  // otherwise every streak would appear broken until the user practises.
  let cursor = now;
  if (!days.has(dayKey(cursor))) {
    cursor -= DAY_MS;
    if (!days.has(dayKey(cursor))) return 0;
  }
  let streak = 0;
  while (days.has(dayKey(cursor))) {
    streak++;
    cursor -= DAY_MS;
  }
  return streak;
}

export function summarise(sessions: Session[], now = Date.now()): Summary {
  const responses = allResponses(sessions);

  const byTypeMap = new Map<ItemTypeId, Response[]>();
  for (const r of responses) {
    byTypeMap.set(r.type, [...(byTypeMap.get(r.type) ?? []), r]);
  }

  const byType: TypeStats[] = [...byTypeMap.entries()].map(([type, rs]) => {
    const correctResponses = rs.filter((r) => r.correct);
    return {
      type,
      attempts: rs.length,
      correct: correctResponses.length,
      accuracy: rs.length > 0 ? correctResponses.length / rs.length : null,
      // Latency is only meaningful for items the user actually solved; timing a wrong
      // answer mostly measures how long they were willing to stare at it.
      medianLatencyMs: median(correctResponses.map((r) => r.latencyMs)),
      bestStreak: longestStreak(rs),
      lastPlayedAt: lastPlayed(sessions, type),
      peakDifficulty:
        correctResponses.length > 0
          ? (Math.max(...correctResponses.map((r) => r.difficulty)) as Difficulty)
          : null,
    };
  });

  const byDomainMap = new Map<ChcDomain, { attempts: number; correct: number }>();
  for (const r of responses) {
    const domain = getMeta(r.type).domain;
    const acc = byDomainMap.get(domain) ?? { attempts: 0, correct: 0 };
    acc.attempts++;
    if (r.correct) acc.correct++;
    byDomainMap.set(domain, acc);
  }

  const byDomain: DomainStats[] = [...byDomainMap.entries()].map(([domain, v]) => ({
    domain,
    attempts: v.attempts,
    correct: v.correct,
    accuracy: v.attempts > 0 ? v.correct / v.attempts : null,
  }));

  const correct = responses.filter((r) => r.correct);
  return {
    overall: {
      attempts: responses.length,
      correct: correct.length,
      accuracy: responses.length > 0 ? correct.length / responses.length : null,
      medianLatencyMs: median(correct.map((r) => r.latencyMs)),
      sessions: sessions.filter((s) => s.responses.length > 0).length,
      dayStreak: computeDayStreak(sessions, now),
    },
    byType: byType.sort((a, b) => b.attempts - a.attempts),
    byDomain: byDomain.sort((a, b) => b.attempts - a.attempts),
  };
}

function lastPlayed(sessions: Session[], type: ItemTypeId): number | null {
  let latest: number | null = null;
  for (const s of sessions) {
    if (!s.responses.some((r) => r.type === type)) continue;
    const t = s.finishedAt ?? s.startedAt;
    if (latest === null || t > latest) latest = t;
  }
  return latest;
}

// ---------------------------------------------------------------------------
// Adaptive difficulty
// ---------------------------------------------------------------------------

export interface Ladder {
  difficulty: Difficulty;
  consecutiveCorrect: number;
  consecutiveWrong: number;
}

export const STEP_UP_AFTER = 3;
export const STEP_DOWN_AFTER = 2;

export function newLadder(start: Difficulty = 2): Ladder {
  return { difficulty: start, consecutiveCorrect: 0, consecutiveWrong: 0 };
}

/**
 * A staircase: three right in a row moves up, two wrong moves down. The asymmetry keeps
 * the user near the level where they get roughly 70-80% right, which is where practice
 * is most productive and least discouraging.
 */
export function advanceLadder(ladder: Ladder, correct: boolean): Ladder {
  const consecutiveCorrect = correct ? ladder.consecutiveCorrect + 1 : 0;
  const consecutiveWrong = correct ? 0 : ladder.consecutiveWrong + 1;

  let difficulty = ladder.difficulty;
  if (consecutiveCorrect >= STEP_UP_AFTER && difficulty < 5) {
    difficulty = (difficulty + 1) as Difficulty;
    return { difficulty, consecutiveCorrect: 0, consecutiveWrong: 0 };
  }
  if (consecutiveWrong >= STEP_DOWN_AFTER && difficulty > 1) {
    difficulty = (difficulty - 1) as Difficulty;
    return { difficulty, consecutiveCorrect: 0, consecutiveWrong: 0 };
  }
  return { difficulty, consecutiveCorrect, consecutiveWrong };
}

/** Suggested starting difficulty for a type, based on the user's own history. */
export function suggestedStart(stats: TypeStats | undefined): Difficulty {
  if (!stats || stats.attempts < 5) return 2;
  if (stats.accuracy === null) return 2;
  if (stats.accuracy > 0.85) return Math.min(5, (stats.peakDifficulty ?? 2) + 1) as Difficulty;
  if (stats.accuracy < 0.5) return Math.max(1, (stats.peakDifficulty ?? 2) - 1) as Difficulty;
  return (stats.peakDifficulty ?? 2) as Difficulty;
}

/**
 * Durations and percentages go through `Intl`, so French renders "1,4 s" with a comma
 * and "67 %" with the space French typography requires — details a bare template string
 * would get wrong.
 */
export function formatDuration(ms: number | null, locale: Locale = DEFAULT_LOCALE): string {
  if (ms === null) return '—';
  const tag = dict(locale).locale.intl;
  if (ms < 1000) {
    return `${new Intl.NumberFormat(tag, { maximumFractionDigits: 0 }).format(ms)} ms`;
  }
  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${new Intl.NumberFormat(tag, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(seconds)} s`;
  }
  const minutes = Math.floor(seconds / 60);
  return `${minutes} min ${Math.round(seconds % 60)} s`;
}

export function formatPercent(value: number | null, locale: Locale = DEFAULT_LOCALE): string {
  if (value === null) return '—';
  return new Intl.NumberFormat(dict(locale).locale.intl, {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(value);
}
