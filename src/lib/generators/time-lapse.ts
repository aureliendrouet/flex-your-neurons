/**
 * Time lapse — two clock faces, and how long passed between them.
 *
 * Reading a clock and subtracting one time from another is quantitative reasoning on a base that is
 * not ten: sixty minutes make an hour, so the borrow happens at a boundary most arithmetic never
 * uses. That is the whole difficulty of the format, and it is why the interval crossing the hour is
 * the dial rather than the interval being large.
 *
 * ## Why every interval stays under an hour
 *
 * An answer of "two hours and fifteen minutes" is two numbers, and an option set of two-part answers
 * either compares them on the hours (in which case the minutes are decoration) or on the minutes (in
 * which case the hours are). Keeping the gap inside an hour makes the answer a single count of
 * minutes — one quantity, comparable to its distractors along one axis — and loses nothing, because
 * the hour boundary is exactly what the format is about and every crossing item still contains one.
 *
 * ## Why both hands sit on marks
 *
 * Minutes are multiples of five throughout, so the minute hand always points at a printed mark. A
 * hand between marks would put "read this dial to the nearest minute" inside a measurement about
 * subtraction, and misreading a hand by one minute is a perceptual failure rather than an arithmetic
 * one. The hour hand still moves continuously, because that is what makes it readable at all —
 * see `handAngles`.
 */
import { createRng, type Rng } from '../rng';
import { dict, type Locale } from '../i18n';
import { windowOptions } from './distractors';
import { twelveHour } from '../clock';
import type { ClockFace, Difficulty, ErrorType, Generator, Item, ItemTypeMeta, Option } from '../types';

const OPTION_COUNT = 4;
/** Minutes per step, everywhere: both hands, the answer, and the distractors. */
const TICK = 5;

interface Plan {
  /** Smallest and largest interval, in minutes. */
  elapsed: [min: number, max: number];
  /** Whether the interval has to run past the hour, may do, or may not. */
  crossing: 'never' | 'either' | 'always';
  /** The multiple of five the first face's minute hand may sit on. */
  startGrain: number;
}

/**
 * The dial is the borrow, not the size of the number.
 *
 * Level 1 never crosses the hour, so the answer is the difference between two minute hands and the
 * hour hands are confirmation. Level 5 always crosses, so the minute hands alone give the wrong
 * answer every time and the hour has to be carried.
 */
function planFor(difficulty: Difficulty): Plan {
  switch (difficulty) {
    case 1:
      return { elapsed: [MIN_ELAPSED, 35], crossing: 'never', startGrain: 15 };
    case 2:
      return { elapsed: [MIN_ELAPSED, 45], crossing: 'never', startGrain: 5 };
    case 3:
      return { elapsed: [MIN_ELAPSED, 50], crossing: 'either', startGrain: 5 };
    case 4:
      return { elapsed: [MIN_ELAPSED, 55], crossing: 'either', startGrain: 5 };
    case 5:
      return { elapsed: [25, 55], crossing: 'always', startGrain: 5 };
  }
}

/**
 * The shortest interval any level may use, and it is a fact about the *option set* rather than about
 * the clocks.
 *
 * The options are a contiguous run of five-minute values with the answer at a drawn rank, and a run
 * cannot go below five minutes — a duration of zero is not a reading anybody offers. So a ten-minute
 * answer has only two of the four ranks available to it, lands near the bottom of its option set
 * most of the time, and "pick the smallest" beats chance. It did: 36% against a 28% baseline at
 * level 1, which is the leak this constant closes. Four ranks need three steps of headroom
 * underneath the answer, which is twenty minutes.
 */
const MIN_ELAPSED = 4 * TICK;

/**
 * The interval between two faces, in minutes — the independent check.
 *
 * Recomputed from the faces the reader will see rather than trusted from the draw, and deliberately
 * written the long way round: both times are reduced to minutes past midday and subtracted, so a
 * crossing item is handled by the same two lines as a non-crossing one and there is no branch to get
 * backwards.
 */
export function elapsedMinutes(from: ClockFace, to: ClockFace): number {
  const minutesOf = (f: ClockFace) => (f.hour % 12) * 60 + f.minute;
  return (minutesOf(to) - minutesOf(from) + 720) % 720;
}

const meta: ItemTypeMeta = {
  id: 'time-lapse',
  domain: 'Gq',
  icon: '◷',
  sprintable: false,
};

const MAX_ATTEMPTS = 100;

function generate(seed: string, difficulty: Difficulty, locale: Locale): Item {
  const t = dict(locale).gen.timeLapse;
  const rng = createRng(`time-lapse:${seed}:${difficulty}`);
  const plan = planFor(difficulty);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const elapsed = rng.int(plan.elapsed[0] / TICK, plan.elapsed[1] / TICK) * TICK;
    const startHour = rng.int(1, 12);
    const startMinute = rng.int(0, Math.floor(59 / plan.startGrain)) * plan.startGrain;
    const crosses = startMinute + elapsed >= 60;
    if (plan.crossing === 'never' && crosses) continue;
    if (plan.crossing === 'always' && !crosses) continue;

    const from: ClockFace = { hour: startHour, minute: startMinute, rotation: 0 };
    const to: ClockFace = {
      hour: twelveHour(startHour + (crosses ? 1 : 0)),
      minute: (startMinute + elapsed) % 60,
      rotation: 0,
    };
    // The independent check: the interval read back off the two faces is the one that was drawn.
    if (elapsedMinutes(from, to) !== elapsed) continue;

    const set = optionsFor(rng, elapsed);
    if (!set) continue;

    const shuffled = rng.shuffle(set.values);
    /*
     * Bare numbers, with the unit in the prompt.
     *
     * Not cosmetic: the blind solver in `tests/leakage.test.ts` reads a numeric option as its value
     * and a non-numeric one as its length, so "35 min" would be scored on how many characters it
     * has. The defence this format relies on — a contiguous window with the answer at a drawn rank —
     * is a defence about *values*, and it only holds if the values are what the option set exposes.
     */
    const options: Option[] = shuffled.map((v) => ({ kind: 'text', text: String(v) }));

    return {
      type: 'time-lapse',
      seed,
      difficulty,
      prompt: t.prompt,
      stimulus: { kind: 'clock', faces: [from, to] },
      responseMode: 'choice',
      options,
      answerIndex: shuffled.indexOf(elapsed),
      errorTypes: shuffled.map((v) => set.errors.get(v) ?? 'plausible'),
      explanation: {
        summary: t.summary(
          dict(locale).clock.time(from.hour, from.minute),
          dict(locale).clock.time(to.hour, to.minute),
          elapsed,
        ),
        rules: [
          crosses ? t.ruleCrossing(60 - startMinute, to.minute) : t.ruleWithinHour(startMinute, to.minute),
          t.ruleTicks,
        ],
      },
      suggestedSeconds: 12 + difficulty * 2,
    };
  }

  throw new Error(
    `time-lapse generator exhausted ${MAX_ATTEMPTS} attempts for seed "${seed}" d${difficulty}`,
  );
}

/**
 * A contiguous run of five-minute intervals with the answer at a drawn rank.
 *
 * Five rather than one, because the option one minute away is not a reading anybody arrives at from
 * a dial whose hands sit on marks — offering it would announce the run as decoration around the only
 * credible value. The diagnoses are read off whatever the window contains rather than deciding it:
 * a neighbour is a hand misread by one mark, and the complement of the interval is the item done
 * backwards, which is what subtracting the minute hands in the wrong order gives on a crossing item.
 */
function optionsFor(rng: Rng, elapsed: number) {
  const diagnose = (value: number): ErrorType => {
    if (value === 60 - elapsed) return 'wrong-direction';
    return Math.abs(value - elapsed) === TICK ? 'off-by-one' : 'plausible';
  };
  return windowOptions(rng, elapsed, OPTION_COUNT, diagnose, TICK, TICK);
}

export const timeLapseGenerator: Generator = { meta, generate };
