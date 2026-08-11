/**
 * Scoring and progress statistics.
 *
 * Deliberately absent: any IQ score, percentile, or normative comparison. Without a
 * representative standardisation sample those numbers would be fabricated
 * (docs/IQ-TESTS.md §8). What is reported instead is the user's own accuracy, speed, and
 * change over time — quantities this app can actually measure.
 */
import type {
  ChcDomain,
  Difficulty,
  ErrorType,
  ItemTypeId,
  Response,
  ResponseMode,
  Session,
} from './types';
import { generateItem, getMeta, ITEM_VERSION } from './generators';
import { isCongruent } from './generators/interference';
import { isFormB } from './generators/trail-making';
import { dict, DEFAULT_LOCALE, type Locale } from './i18n';

/**
 * `trailMisses` applies only to the trail format, where "correct" is a binarisation rather than a
 * fact about an answer.
 *
 * A trail always completes, and what the real task scores is the time taken; there is no wrong
 * answer to give. So the site's own notion of correctness is set to "finished without a misclick",
 * which keeps a trail out of the accuracy statistics as a permanent free point while still recording
 * something meaningful. The measurement that matters is the latency, and the format's own copy says
 * so rather than letting the tick imply otherwise.
 */
export function isCorrect(
  item: { responseMode: ResponseMode; answerIndex: number; answerText?: string },
  chosenIndex: number | null,
  chosenText?: string,
  trailMisses?: number,
): boolean {
  if (item.responseMode === 'trail') return trailMisses === 0;
  /*
   * A tapped sequence is graded exactly as a typed one: both are the response itself rather than a
   * choice among options, and both come down to "is this the expected string". The all-or-nothing
   * result is the standard scoring for a span trial — four of five blocks in the right order is a
   * failed trial, not four fifths of a success, because what is being measured is whether the whole
   * sequence survived.
   */
  /*
   * A filled pyramid is compared blank by blank rather than as one string, and the difference
   * matters: `normaliseTextAnswer` strips separators, so "1,42" and "14,2" both flatten to "142".
   * The blanks are numbers of varying width, so the separator is the only thing that says where one
   * ends — dropping it would mark a wrong answer right.
   *
   * Still all-or-nothing, like a span. Half a pyramid is not half an answer: every cell above a
   * mistake inherits it, so a reader who slips once is wrong from there upward, and scoring the
   * inherited cells as separate failures would count one mistake several times.
   */
  if (item.responseMode === 'fill') {
    if (chosenText === undefined) return false;
    const want = splitBlanks(item.answerText ?? '');
    const got = splitBlanks(chosenText);
    return want.length === got.length && want.every((value, i) => value === got[i]);
  }
  if (item.responseMode === 'text' || item.responseMode === 'tap') {
    if (chosenText === undefined) return false;
    return normaliseTextAnswer(chosenText) === normaliseTextAnswer(item.answerText ?? '');
  }
  return chosenIndex !== null && chosenIndex === item.answerIndex;
}

/**
 * Names the mistake in a tapped sequence.
 *
 * Every other format diagnoses by *construction*: the generator builds each distractor to embody one
 * misreading and records which, so `errorTypes[chosen]` is a lookup. A tap has no distractors — the
 * reader produces the response rather than selecting it — so the diagnosis has to be computed from
 * what they did, and this is the one place in the app where a diagnosis is derived rather than keyed.
 *
 * The interesting distinction is the middle one. A response containing exactly the right blocks in
 * the wrong order means the positions were encoded and their *order* was lost, which is a different
 * failure from tapping a block that never lit — and the two call for different practice. The reversal
 * is split out from it because recalling a sequence backwards is a specific, common slip rather than
 * generic disorder.
 */
export function diagnoseTaps(expected: string, tapped: string): ErrorType {
  const want = normaliseTextAnswer(expected);
  const got = normaliseTextAnswer(tapped);
  if (want === got) return 'correct';
  if ([...want].reverse().join('') === got) return 'wrong-direction';
  const sorted = (value: string) => [...value].sort().join('');
  if (want.length === got.length && sorted(want) === sorted(got)) return 'transposition';
  return 'plausible';
}

/** Spaces, dashes and case are noise in a recall answer, not errors. */
export function normaliseTextAnswer(text: string): string {
  return text.replace(/[\s,\-_]/g, '').toUpperCase();
}

/** The blanks of a `fill` response, in order. Empty blanks survive as empty strings. */
export function splitBlanks(text: string): string[] {
  return text.split(',').map((part) => part.trim());
}

/**
 * Names the mistake in a filled pyramid.
 *
 * Computed rather than keyed, for the same reason a tapped sequence's is: there are no distractors
 * to look up, because the reader produced the answer instead of choosing it. What can be said is
 * more specific here than in a span, because the blanks are related to each other — so the
 * diagnosis is about *which* relation the reader used, not merely about how far off they were.
 *
 * The order matters. A subtracted pyramid is checked before an arithmetic slip, because a reader who
 * subtracted throughout has made one conceptual mistake and not five careless ones, and calling that
 * "off by one" in five places would be the least useful thing this screen could say.
 */
export function diagnoseFills(expected: string, filled: string, base: number[]): ErrorType {
  const want = splitBlanks(expected);
  const got = splitBlanks(filled);
  if (want.length === got.length && want.every((v, i) => v === got[i])) return 'correct';
  if (got.length !== want.length || got.some((v) => v === '' || !/^-?\d+$/.test(v))) {
    return 'plausible';
  }

  const wanted = want.map(Number);
  const given = got.map(Number);

  // The whole pyramid built by subtracting instead of adding — one wrong idea, applied throughout.
  const subtracted: number[] = [];
  let row = base;
  while (row.length > 1) {
    row = row.slice(0, -1).map((value, i) => value - row[i + 1]!);
    subtracted.push(...row);
  }
  if (subtracted.length === given.length && subtracted.every((v, i) => v === given[i])) {
    return 'wrong-rule';
  }

  const wrong = given.map((v, i) => v - wanted[i]!).filter((d) => d !== 0);
  // The units digit right and a higher place wrong, everywhere it went wrong: the dropped carry.
  if (wrong.every((d) => d % 10 === 0)) return 'carry';
  if (wrong.every((d) => Math.abs(d) === 1)) return 'off-by-one';
  return 'plausible';
}

export interface TypeStats {
  type: ItemTypeId;
  attempts: number;
  correct: number;
  /** 0-1, or null when there are no attempts. */
  accuracy: number | null;
  /**
   * What guessing alone would score on this format, 0-1, or `null` where guessing is not a strategy.
   *
   * Reported because accuracy is not comparable across formats without it, and the site was showing
   * it as though it were. A matrix offers eight options and symbol search offers two, so 50% on the
   * first is four times chance and on the second is a coin — presented side by side in one column,
   * the same number, with nothing to say they mean opposite things. `null` for the formats with no
   * option list to guess from: a typed span or a tapped sequence has no floor worth naming.
   */
  chanceLevel: number | null;
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

/**
 * The untimed sessions: practice and full tests.
 *
 * Sprint responses are collected under a running clock, at a difficulty pinned for the whole
 * block, with no reveal between items. Their latencies are therefore not the same quantity as a
 * practice latency — they measure how fast someone *chose to go*, not how long they needed —
 * and their accuracy is depressed by the speed–accuracy trade-off the clock imposes. Pooling
 * them would make every per-type median jump the first time a reader sprinted, with no
 * indication that the measurement underneath had changed.
 *
 * So the two regimes are summarised separately: `summarise` over these, `sprintSummary` over
 * the rest. This is also why the adaptive ladder reads from `summarise` — a sprint's pinned
 * difficulty carries no evidence about where the ladder should start.
 */
export function untimedSessions(sessions: Session[]): Session[] {
  return sessions.filter((s) => s.mode !== 'sprint');
}

/**
 * The sessions whose items can still be regenerated as the reader saw them.
 *
 * Two read-outs recover a condition the response never stored — `interferenceScore` regenerates a
 * Stroop trial to ask whether it was congruent, `switchCostScore` regenerates a trail to ask which
 * form it was. That inference is only sound while the generators still produce what the reader
 * answered. Change a plan and old responses get sorted into the wrong condition: the contrast keeps
 * returning a confident number, computed from a coin flip.
 *
 * So these two filter to the current `ITEM_VERSION`, on top of the untimed rule. Nothing else does:
 * accuracy, latency and the recorded error type are properties of the response itself and survive
 * any generator change. A session written before the stamp existed has an unknown version and is
 * therefore not re-derivable — which loses a small amount of pre-2026-08 history and is the point.
 */
export function rederivableSessions(sessions: Session[]): Session[] {
  return untimedSessions(sessions).filter((s) => s.itemVersion === ITEM_VERSION);
}

/**
 * What guessing scores on a format, or `null` where there is nothing to guess between.
 *
 * Derived by generating one item and counting its options rather than kept in a table, so it cannot
 * drift away from what the format actually offers — the option count is a property of the generator,
 * and a table of them would be a second place for it to be recorded and a first place for it to go
 * stale.
 */
function chanceLevelFor(type: ItemTypeId): number | null {
  const probe = generateItem(type, 'CHANCE', 3);
  if (probe.responseMode !== 'choice' || probe.options.length === 0) return null;
  return 1 / probe.options.length;
}

export function summarise(allSessions: Session[], now = Date.now()): Summary {
  const sessions = untimedSessions(allSessions);
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
      chanceLevel: chanceLevelFor(type),
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

// ---------------------------------------------------------------------------
// The Stroop effect — the one measurement here that is a difference, not a total
// ---------------------------------------------------------------------------

/**
 * The interference score: how much slower incongruent trials are than congruent ones.
 *
 * This is the only figure on the site that is a *contrast* rather than a tally, and it is the whole
 * reason the interference format exists. Neither half means much alone — a fast reader and a slow one
 * differ on both — but the gap between them is a property of inhibition specifically, because
 * everything else about the two conditions is identical: same glyphs, same options, same positions,
 * same motor response. Only the conflict differs.
 *
 * It is recoverable from history *without* having stored anything extra. Congruency is a property of
 * the item, and every item regenerates exactly from `(type, seed, difficulty)` — so the partition is
 * re-derived at read time rather than written into every response. That is the seed architecture
 * paying for itself: a measurement nobody planned for when the response shape was designed.
 *
 * Only correct responses are timed, for the same reason the per-type medians are: the time taken to
 * reach a wrong answer mostly measures how long someone was willing to stare at it.
 */
export interface InterferenceScore {
  congruentMs: number;
  incongruentMs: number;
  /** Incongruent minus congruent. Positive is the expected direction. */
  interferenceMs: number;
  congruentTrials: number;
  incongruentTrials: number;
}

/**
 * Fewest correct trials needed in *each* condition before a difference is worth showing.
 *
 * A median of two latencies is not a median, and a Stroop effect is tens of milliseconds against
 * within-person variance of hundreds — so a contrast drawn from a handful of trials is mostly noise
 * wearing a number's clothes. Better to say nothing yet than to show a figure that will swing wildly
 * on the next attempt.
 */
export const MIN_INTERFERENCE_TRIALS = 8;

export function interferenceScore(sessions: Session[]): InterferenceScore | null {
  const congruent: number[] = [];
  const incongruent: number[] = [];

  /*
   * Untimed sessions only — the same rule every other read-out follows, and the one this contrast
   * was quietly breaking.
   *
   * A sprint's latencies measure how fast a reader *chose* to go under a running clock, not how long
   * the item took them, and `interference` is sprintable. Pooling them compresses both conditions
   * towards the same floor and takes the difference with them: a real +200 ms Stroop effect measured
   * +10 ms once a single sprint block was in the history, and because a sprint produces items
   * quickly, its trials come to outnumber the practice ones in the median within one session.
   *
   * And only sessions from the current generator generation, because the congruency below is
   * recovered by regenerating the item rather than read from the response — see
   * `rederivableSessions`.
   */
  for (const session of rederivableSessions(sessions)) {
    for (const response of session.responses) {
      if (response.type !== 'interference' || !response.correct) continue;
      const item = generateItem('interference', response.seed, response.difficulty);
      if (item.stimulus.kind !== 'interference') continue;
      (isCongruent(item.stimulus.glyphs) ? congruent : incongruent).push(response.latencyMs);
    }
  }

  if (
    congruent.length < MIN_INTERFERENCE_TRIALS ||
    incongruent.length < MIN_INTERFERENCE_TRIALS
  ) {
    return null;
  }

  const congruentMs = median(congruent)!;
  const incongruentMs = median(incongruent)!;
  return {
    congruentMs,
    incongruentMs,
    interferenceMs: incongruentMs - congruentMs,
    congruentTrials: congruent.length,
    incongruentTrials: incongruent.length,
  };
}

/**
 * The switch cost: how much longer a number-and-letter board takes than a numbers-only one.
 *
 * The same shape of measurement as `interferenceScore`, and for the same reason — the two kinds of
 * board are matched on visual search and motor demand, so the difference between them isolates the
 * cost of alternating between two sequences. In the literature this is the B-minus-A contrast, and it
 * is the part of the Trail Making Test that indexes executive function rather than plain speed.
 *
 * Like congruency, form was never stored: it is a property of the item, and the item regenerates from
 * its seed. Unlike the interference score this one uses *every completed* trail rather than only the
 * error-free ones — a trail is scored on time in the real task, and a run with one misclick is a
 * slightly slower run, not an invalid one.
 */
export interface SwitchCostScore {
  formAMs: number;
  formBMs: number;
  /** Form B minus form A. Positive is the expected direction. */
  switchCostMs: number;
  formATrials: number;
  formBTrials: number;
}

/** Fewest completed boards needed of each form. Lower than the Stroop threshold because a trail is
 *  a whole task rather than a single trial: five of each is already several minutes of data. */
export const MIN_TRAIL_RUNS = 4;

export function switchCostScore(sessions: Session[]): SwitchCostScore | null {
  const formA: number[] = [];
  const formB: number[] = [];

  /* Untimed sessions only, as for the interference contrast. `trail-making` is not sprintable
     today, so nothing reaches this from a sprint — but the invariant belongs where the statistic is
     computed rather than in another file's metadata, which is exactly how the sibling read-out came
     to be wrong. Current-generation sessions only too, since the form is regenerated from the seed
     rather than stored — see `rederivableSessions`. */
  for (const session of rederivableSessions(sessions)) {
    for (const response of session.responses) {
      if (response.type !== 'trail-making') continue;
      const item = generateItem('trail-making', response.seed, response.difficulty);
      if (item.stimulus.kind !== 'trail') continue;
      (isFormB(item.stimulus.nodes) ? formB : formA).push(response.latencyMs);
    }
  }

  if (formA.length < MIN_TRAIL_RUNS || formB.length < MIN_TRAIL_RUNS) return null;

  const formAMs = median(formA)!;
  const formBMs = median(formB)!;
  return {
    formAMs,
    formBMs,
    switchCostMs: formBMs - formAMs,
    formATrials: formA.length,
    formBTrials: formB.length,
  };
}

// ---------------------------------------------------------------------------
// Sprints — the continuous timed block, scored in its own units
// ---------------------------------------------------------------------------

/**
 * One finished sprint, reduced to the numbers that describe it.
 *
 * The headline is `correct`, not accuracy. A sprint's question is "how much did you get through
 * in the window", and accuracy alone cannot answer it: someone who attempts six items and gets
 * all six right scores 100% and has done a third of the work of someone who attempts twenty and
 * gets sixteen. Accuracy is still carried, because output bought entirely by guessing is not
 * output — but it is a check on the score rather than the score.
 */
export interface SprintRun {
  sessionId: string;
  type: ItemTypeId;
  difficulty: Difficulty;
  finishedAt: number;
  /** The window the block was scored in. */
  plannedMs: number;
  attempted: number;
  correct: number;
  /** 0-1, or null when nothing was attempted. */
  accuracy: number | null;
  /** Correct answers per minute, normalised so different window lengths can be compared. */
  perMinute: number;
}

export interface SprintStats {
  type: ItemTypeId;
  runs: number;
  /** Most recent run first. */
  history: SprintRun[];
  /** The best run by `perMinute`. */
  best: SprintRun;
  latest: SprintRun;
}

/**
 * A sprint is only scorable if it recorded the window it was scored in.
 *
 * Sessions written before sprints existed have no `plannedMs`, and neither do sprints abandoned
 * before the clock started. Rather than inventing a window from the elapsed time — which would
 * silently rank an abandoned ten-second run against a full minute — those are skipped.
 */
function toSprintRun(session: Session): SprintRun | null {
  const type = session.types[0];
  if (session.mode !== 'sprint' || !type || !session.plannedMs || session.finishedAt === null) {
    return null;
  }
  if (session.responses.length === 0) return null;

  const correct = session.responses.filter((r) => r.correct).length;
  return {
    sessionId: session.id,
    type,
    // A sprint pins one level for the whole block, so the first response carries it.
    difficulty: session.responses[0]!.difficulty,
    finishedAt: session.finishedAt,
    plannedMs: session.plannedMs,
    attempted: session.responses.length,
    correct,
    accuracy: correct / session.responses.length,
    perMinute: (correct / session.plannedMs) * 60_000,
  };
}

/** Every sprint that can be scored, newest first, grouped by format. */
export function sprintSummary(sessions: Session[]): SprintStats[] {
  const byType = new Map<ItemTypeId, SprintRun[]>();
  for (const session of sessions) {
    const run = toSprintRun(session);
    if (!run) continue;
    byType.set(run.type, [...(byType.get(run.type) ?? []), run]);
  }

  return [...byType.entries()]
    .map(([type, runs]) => {
      const history = [...runs].sort((a, b) => b.finishedAt - a.finishedAt);
      /*
       * Ties on rate break towards the *earlier* run, so a later run that merely matches a
       * personal best does not claim to have beaten it.
       */
      const best = [...runs].sort((a, b) => b.perMinute - a.perMinute || a.finishedAt - b.finishedAt)[0]!;
      return { type, runs: runs.length, history, best, latest: history[0]! };
    })
    .sort((a, b) => b.latest.finishedAt - a.latest.finishedAt);
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
// Error types — turning a verdict into a diagnosis
// ---------------------------------------------------------------------------

export interface ErrorTally {
  errorType: ErrorType;
  count: number;
}

/**
 * Counts the named mistakes among a set of responses, commonest first.
 *
 * Only wrong answers are counted, and only those carrying a diagnosis: text-entry formats
 * (digit span) have no distractors to diagnose and nothing to compute a diagnosis from, and
 * histories written before the taxonomy was surfaced have no `errorType` at all. Both are
 * absences, not zeroes, so they are dropped rather than bucketed — a "plausible" bucket
 * inflated by every old response would make the breakdown say something false about the
 * user's habits. Tapped sequences do appear here: their diagnosis is computed at submit time
 * by `diagnoseTaps` and stored on the response like any other.
 */
export function tallyErrorTypes(responses: Response[]): ErrorTally[] {
  const counts = new Map<ErrorType, number>();
  for (const r of responses) {
    if (r.correct) continue;
    const type = r.errorType;
    if (type === undefined || type === 'correct') continue;
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([errorType, count]) => ({ errorType, count }))
    // Ties broken by name so the order is stable across renders and across locales.
    .sort((a, b) => b.count - a.count || a.errorType.localeCompare(b.errorType));
}

/**
 * The single commonest mistake, when one genuinely stands out.
 *
 * "Stands out" means at least a third of the diagnosed errors and at least two
 * occurrences. Below that the honest report is that the errors were spread — naming a
 * "commonest" mistake from a 2–1–1 split would be reading a habit into noise, which is
 * the same overclaiming this site refuses to do with scores.
 */
export function dominantErrorType(tally: ErrorTally[]): ErrorTally | null {
  const total = tally.reduce((sum, t) => sum + t.count, 0);
  const top = tally[0];
  if (!top || total === 0) return null;
  if (top.count < 2 || top.count / total < 1 / 3) return null;
  // A tie for first place is not a dominant habit either.
  if (tally[1] && tally[1].count === top.count) return null;
  return top;
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
