/**
 * Clock spin — read a clock that has been turned.
 *
 * The face is drawn rotated, numerals and all, and the reader says what time it shows. Reading a
 * dial is over-learned in a way that depends entirely on its orientation: twelve is up, three is
 * right, and the whole reading is a lookup against that frame. Turn the face and the lookup stops
 * working, so the reader has to mentally rotate the frame back — which is the same operation
 * `rotation` measures on polyominoes, on material where the reader already has a strong,
 * orientation-bound habit to overcome.
 *
 * ## Why the numerals stay on the face
 *
 * Without them the item is not hard, it is undecidable. A bare dial rotated by an unknown amount has
 * no way to say which mark is twelve, so every reading is as good as every other and the "answer"
 * would be whatever the generator happened to intend (`GENERATABILITY.md` §4). With the numerals
 * drawn, the rotation is fully stated by the picture and exactly one reading is defensible.
 *
 * ## Why the rotations are multiples of forty-five degrees
 *
 * Two kinds of turn, and both are wanted. The right angles carry every hour mark onto another hour
 * mark, so the face still looks like a perfectly ordinary clock — with the 12 sitting where the 3
 * belongs. Nothing about it announces that it has been turned, and a reader who glances at the hands
 * without checking the numerals gets a confident wrong answer. The odd multiples leave the marks
 * visibly off-grid, so the turn announces itself and the work is simply undoing it.
 *
 * Neither is ambiguous, and the numerals are why: they travel with the face, so exactly one reading
 * is defensible in both cases. What differs is whether the item warns you that it needs one.
 *
 * ## The distractors are the four ways a dial is misread
 *
 * The hour it is approaching rather than the one it is past; the hands taken for each other; the
 * reading reflected rather than rotated; and the minute hand landing on the wrong quarter. Each is a
 * specific slip that survives the rotation, which is what makes them worth naming afterwards.
 */
import { createRng, type Rng } from '../rng';
import { dict, type Locale } from '../i18n';
import { twelveHour } from '../clock';
import type { ClockFace, Difficulty, ErrorType, Generator, Item, ItemTypeMeta, Option } from '../types';

const OPTION_COUNT = 4;

interface Plan {
  /** How far the face may be turned, in degrees clockwise. */
  rotations: number[];
  /**
   * Whether the minute hand may sit in the second half of the hour.
   *
   * It is a difficulty dial because of what it does to the *hour* hand: at fifty past, the hour hand
   * is almost all the way to the next numeral, so "the hour it is approaching" stops being a careless
   * answer and becomes the one the picture appears to give.
   */
  lateMinutes: boolean;
}

function planFor(difficulty: Difficulty): Plan {
  switch (difficulty) {
    case 1:
      return { rotations: [45, 315], lateMinutes: false };
    case 2:
      return { rotations: [45, 90, 270, 315], lateMinutes: false };
    case 3:
      return { rotations: [90, 135, 225, 270], lateMinutes: true };
    case 4:
      return { rotations: [135, 180, 225], lateMinutes: true };
    case 5:
      return { rotations: [135, 180, 225, 270], lateMinutes: true };
  }
}

interface Reading {
  hour: number;
  minute: number;
}

const key = (r: Reading): string => `${r.hour}:${r.minute}`;

const meta: ItemTypeMeta = {
  id: 'clock-spin',
  domain: 'Gv',
  icon: '◴',
  sprintable: false,
};

const MAX_ATTEMPTS = 100;

function generate(seed: string, difficulty: Difficulty, locale: Locale): Item {
  const t = dict(locale).gen.clockSpin;
  const time = dict(locale).clock.time;
  const rng = createRng(`clock-spin:${seed}:${difficulty}`);
  const plan = planFor(difficulty);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const rotation = rng.pick(plan.rotations);
    const hour = rng.int(1, 12);
    const minute = rng.int(1, plan.lateMinutes ? 11 : 5) * 5;
    const answer: Reading = { hour, minute };

    const distractors = misreadings(answer, rng);
    if (!distractors) continue;

    const face: ClockFace = { hour, minute, rotation };
    const readings = rng.shuffle([answer, ...distractors.map((d) => d.reading)]);
    const errors = new Map(distractors.map((d) => [key(d.reading), d.errorType]));

    const options: Option[] = readings.map((r) => ({ kind: 'text', text: time(r.hour, r.minute) }));

    return {
      type: 'clock-spin',
      seed,
      difficulty,
      prompt: t.prompt,
      stimulus: { kind: 'clock', faces: [face] },
      responseMode: 'choice',
      options,
      answerIndex: readings.findIndex((r) => key(r) === key(answer)),
      errorTypes: readings.map((r): ErrorType =>
        key(r) === key(answer) ? 'correct' : (errors.get(key(r)) ?? 'plausible'),
      ),
      explanation: {
        summary: t.summary(time(hour, minute), rotation),
        rules: [t.ruleTurnBack(rotation), t.ruleHourHand(hour, minute), t.ruleMisreadings],
      },
      suggestedSeconds: 12 + difficulty * 2,
    };
  }

  throw new Error(
    `clock-spin generator exhausted ${MAX_ATTEMPTS} attempts for seed "${seed}" d${difficulty}`,
  );
}

/**
 * Three misreadings of one time, or `null` when this draw cannot produce three distinct ones.
 *
 * Every candidate is a *reading*, not a perturbation of a number: each one is a time somebody
 * actually arrives at from this dial, which is what makes them worth diagnosing and what keeps them
 * indistinguishable from the answer as members of an option set.
 */
function misreadings(
  answer: Reading,
  rng: Rng,
): { reading: Reading; errorType: ErrorType }[] | null {
  const { hour, minute } = answer;
  const candidates: { reading: Reading; errorType: ErrorType }[] = [
    // The hour the hand is travelling towards rather than the one it has left.
    { reading: { hour: twelveHour(hour + 1), minute }, errorType: 'off-by-one' },
    /*
     * The hands taken for each other: the minute hand read as an hour and the hour hand as a count
     * of minutes. Only well defined when the hour is one a minute hand could point at, i.e. every
     * hour — five times the hour is always a legal minute — so this one is always available.
     */
    { reading: { hour: twelveHour(minute / 5), minute: (hour * 5) % 60 }, errorType: 'wrong-attribute' },
    // The dial reflected rather than turned: a mirror is the other way to undo a rotation, and wrong.
    { reading: { hour: twelveHour(12 - hour), minute: (60 - minute) % 60 }, errorType: 'mirror' },
    // The minute hand put on the wrong quarter of the face.
    { reading: { hour, minute: (minute + 15) % 60 }, errorType: 'plausible' },
    { reading: { hour, minute: (minute + 45) % 60 }, errorType: 'plausible' },
    { reading: { hour: twelveHour(hour - 1), minute }, errorType: 'off-by-one' },
  ];

  const seen = new Set([key(answer)]);
  const out: { reading: Reading; errorType: ErrorType }[] = [];
  for (const candidate of candidates) {
    if (seen.has(key(candidate.reading))) continue;
    seen.add(key(candidate.reading));
    out.push(candidate);
  }
  if (out.length < OPTION_COUNT - 1) return null;
  /*
   * Which three of the surviving candidates are spent is drawn rather than taken in order. Taken in
   * order, the same three misreadings appear on nearly every item, and an option set whose *kinds*
   * are fixed is one a reader learns to navigate without reading the dial.
   */
  return rng.shuffle(out).slice(0, OPTION_COUNT - 1);
}

export const clockSpinGenerator: Generator = { meta, generate };
