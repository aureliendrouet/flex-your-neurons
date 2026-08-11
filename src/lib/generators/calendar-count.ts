/**
 * Calendar count — the anchor is given; work out the day.
 *
 * "The 3rd of a 31-day month is a Tuesday. What day is the 25th?" The arithmetic is modulo seven,
 * which is a base almost nothing else uses, and the reasoning is over a structure everybody already
 * carries around: a week that repeats, a month that does not divide by it. Calendar items are
 * standard in aptitude and numeracy batteries, and they are also the everyday form of quantitative
 * reasoning most people actually do — "a fortnight on Thursday" is this task.
 *
 * ## Why the item states its own anchor, and names no real date
 *
 * An item that said "what day is the 25th of March?" would be answerable only against a particular
 * year, so the generator would have to carry one — and then the answer depends on something that is
 * not in the picture. Worse for this site specifically: an item whose answer depends on *today*
 * cannot be regenerated from its seed, so a review screen would show a different item from the one
 * that was answered, and `ITEM_VERSION` could not save it because nothing about the generator would
 * have changed. Stating the anchor inside the item makes it self-contained: everything needed is on
 * screen, and the seed reproduces it forever.
 *
 * The month is described by its length rather than its name for the same reason — "a 31-day month"
 * is a fact the item supplies, where "March" is a fact the reader is assumed to have. This is a
 * reasoning format, not a general-knowledge one.
 *
 * ## Why some items run backwards, and some cross the month
 *
 * Counting forward from the anchor is the easy direction and the one a reader falls into. Asking
 * for a date *before* the anchor requires the same modulus run the other way, which is where the
 * sign errors live — and the wrong-direction answer is offered, so the mistake is named rather than
 * merely marked. Crossing into the next month adds the second thing this format knows that
 * arithmetic does not: months are not seven days long, so where the next month starts depends on how
 * long this one is.
 */
import { createRng, type Rng } from '../rng';
import { dict, type Locale } from '../i18n';
import type { Difficulty, ErrorType, Generator, Item, ItemTypeMeta, Option } from '../types';

/** Days in a week, and the modulus the whole format runs on. */
const WEEK = 7;
const OPTION_COUNT = 4;

/** The month lengths a calendar actually offers. February is 28 here: leap years are trivia. */
const MONTH_LENGTHS = [28, 30, 31] as const;

interface Plan {
  /** How far the target may sit from the anchor, in days. */
  span: [min: number, max: number];
  /** Whether the target may fall before the anchor. */
  backwards: boolean;
  /** Whether the target may fall in the following month. */
  crossesMonth: boolean;
}

/**
 * The dials are direction and the month boundary, not distance.
 *
 * Distance is nearly free: counting on 26 days is the same modulus as counting on 5, and a reader
 * who divides by seven does not care which. What costs is running the count the other way, and
 * having to know where the month ends before the count can be run at all.
 */
function planFor(difficulty: Difficulty): Plan {
  switch (difficulty) {
    case 1:
      return { span: [3, 12], backwards: false, crossesMonth: false };
    case 2:
      return { span: [5, 20], backwards: false, crossesMonth: false };
    case 3:
      return { span: [5, 24], backwards: true, crossesMonth: false };
    case 4:
      return { span: [6, 26], backwards: true, crossesMonth: true };
    case 5:
      return { span: [8, 30], backwards: true, crossesMonth: true };
  }
}

/**
 * The weekday `offset` days after `anchorDay`, as an index into the week — the independent check.
 *
 * Written as one modulus with a positive correction rather than as a forward branch and a backward
 * one, so an item that counts back is handled by exactly the code that handles one counting on.
 * Two branches here is where a sign error would hide, and a sign error in this format produces a
 * plausible wrong day rather than anything that looks broken.
 */
export function weekdayAfter(anchorDay: number, offset: number): number {
  return (((anchorDay + offset) % WEEK) + WEEK) % WEEK;
}

interface Puzzle {
  /** Length of the month the anchor sits in. */
  monthLength: number;
  /** Date of the anchor, and its weekday index. */
  anchorDate: number;
  anchorDay: number;
  /** Date being asked about, and whether it falls in the following month. */
  targetDate: number;
  nextMonth: boolean;
  /** Signed days from anchor to target. */
  offset: number;
}

function build(plan: Plan, rng: Rng): Puzzle | null {
  const monthLength = rng.pick([...MONTH_LENGTHS]);
  const anchorDate = rng.int(2, monthLength - 2);
  const anchorDay = rng.int(0, WEEK - 1);
  const distance = rng.int(plan.span[0], plan.span[1]);

  /*
   * A whole number of weeks is turned away. "Three weeks after a Tuesday" is a Tuesday, and the item
   * becomes a test of whether the reader noticed the multiple rather than of the count — with the
   * anchor's own day sitting in the option list as the answer, which is the one arrangement where a
   * reader who does nothing at all is right.
   */
  if (distance % WEEK === 0) return null;

  const nextMonth = plan.crossesMonth && rng.bool(0.45) && anchorDate + distance > monthLength;
  const backwards = !nextMonth && plan.backwards && rng.bool(0.4);
  const offset = backwards ? -distance : distance;

  const absolute = anchorDate + offset;
  if (nextMonth) {
    // Must land in the next month, and inside it: the 32nd of anything is not a date.
    if (absolute <= monthLength || absolute > monthLength + 28) return null;
    return { monthLength, anchorDate, anchorDay, targetDate: absolute - monthLength, nextMonth, offset };
  }
  if (absolute < 1 || absolute > monthLength) return null;
  return { monthLength, anchorDate, anchorDay, targetDate: absolute, nextMonth: false, offset };
}

const meta: ItemTypeMeta = {
  id: 'calendar-count',
  domain: 'Gq',
  icon: '▦',
  sprintable: false,
};

const MAX_ATTEMPTS = 100;

function generate(seed: string, difficulty: Difficulty, locale: Locale): Item {
  const t = dict(locale).gen.calendarCount;
  const days = dict(locale).calendar.days;
  const rng = createRng(`calendar-count:${seed}:${difficulty}`);
  const plan = planFor(difficulty);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const puzzle = build(plan, rng);
    if (!puzzle) continue;

    const answer = weekdayAfter(puzzle.anchorDay, puzzle.offset);

    /*
     * Every option is a weekday, and the whole week is never offered — four of seven, so the set is
     * not the trivial "all of them" and not a list a reader can work backwards from either.
     *
     * The distractors are the three ways this count goes wrong, and each is a *named* day rather
     * than a perturbation: the count run the wrong way, the count out by one day, and the anchor's
     * own day, which is where a reader lands by treating the gap as a whole number of weeks.
     */
    /*
     * The named mistakes come first, and the filler is drawn uniformly from whatever is left.
     *
     * Two things had to be learned here, and both are the same mistake in different clothes. The
     * first version drew three distractors uniformly from a list of seven, which produced items
     * whose every distractor was a generic near-miss — nothing to diagnose, in a format where every
     * realistic wrong answer means something specific.
     *
     * The second offered *both* neighbours, ±1 day, and that is the I-RAVEN shape once more: with
     * the day either side of it on the list, the answer sits in the middle of a run of three, and a
     * solver that never reads the item can take the middle. It scored 35% against a 26% baseline.
     * At most one neighbour is offered now, on a side that is drawn, so there is no middle to take —
     * and the filler is any unused weekday rather than another day measured from the answer, since
     * anything measured from the answer is one more thing that points at it.
     */
    const side = rng.pick([1, -1]);
    const candidates: { day: number; errorType: ErrorType }[] = [
      ...rng.shuffle([
        { day: weekdayAfter(puzzle.anchorDay, -puzzle.offset), errorType: 'wrong-direction' as ErrorType },
        { day: weekdayAfter(answer, side), errorType: 'off-by-one' as ErrorType },
        { day: puzzle.anchorDay, errorType: 'copy' as ErrorType },
      ]),
      ...rng.shuffle(
        Array.from({ length: WEEK }, (_, day) => ({ day, errorType: 'plausible' as ErrorType })),
      ),
    ];

    const seen = new Set([answer]);
    const distractors: { day: number; errorType: ErrorType }[] = [];
    for (const candidate of candidates) {
      if (seen.has(candidate.day)) continue;
      seen.add(candidate.day);
      distractors.push(candidate);
    }
    if (distractors.length < OPTION_COUNT - 1) continue;

    const chosen = rng.shuffle([
      { day: answer, errorType: 'correct' as ErrorType },
      ...distractors.slice(0, OPTION_COUNT - 1),
    ]);

    const options: Option[] = chosen.map((c) => ({ kind: 'text', text: days[c.day]! }));

    return {
      type: 'calendar-count',
      seed,
      difficulty,
      prompt: t.prompt,
      stimulus: {
        kind: 'text',
        lines: [
          t.anchorLine(puzzle.monthLength, puzzle.anchorDate, days[puzzle.anchorDay]!),
          puzzle.nextMonth
            ? t.questionLineNextMonth(puzzle.targetDate)
            : t.questionLine(puzzle.targetDate),
        ],
      },
      responseMode: 'choice',
      options,
      answerIndex: chosen.findIndex((c) => c.errorType === 'correct'),
      errorTypes: chosen.map((c) => c.errorType),
      explanation: {
        summary: t.summary(puzzle.targetDate, days[answer]!),
        rules: [
          puzzle.nextMonth
            ? t.ruleCrossing(puzzle.monthLength, puzzle.anchorDate, Math.abs(puzzle.offset))
            : t.ruleGap(Math.abs(puzzle.offset), puzzle.offset > 0),
          t.ruleModulus(Math.abs(puzzle.offset), Math.floor(Math.abs(puzzle.offset) / WEEK), Math.abs(puzzle.offset) % WEEK),
          t.ruleDistractors,
        ],
      },
      suggestedSeconds: 14 + difficulty * 2,
    };
  }

  throw new Error(
    `calendar-count generator exhausted ${MAX_ATTEMPTS} attempts for seed "${seed}" d${difficulty}`,
  );
}

export const calendarCountGenerator: Generator = { meta, generate };
