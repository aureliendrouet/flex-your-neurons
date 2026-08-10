/**
 * Head count — figures arrive and leave one step at a time; report how many remain.
 *
 * The third working-memory format, and it measures something the other two do not. Span
 * asks you to hold a list still and give it back. N-back asks you to keep a window of the
 * last few elements and rewrite it every step. This asks you to maintain a single *running
 * value* and update it — hold a total, add, subtract, discard the old total, hold the new
 * one. That is the classic tracking-and-updating load (`IQ-TESTS.md` §2), and it is the one
 * of the three where the thing being held is not the stimulus itself.
 *
 * ## Why departures are mandatory
 *
 * A stream of arrivals only would be a sum, and a sum can be accumulated without ever
 * discarding anything — arithmetic on a growing number, not updating. It is the *subtraction*
 * that forces the old total to be thrown away, so every item here contains at least one
 * departure.
 *
 * ## Why the room never empties, at any point
 *
 * Two separate reasons, and both had to be learned from rendered output.
 *
 * A script that goes *below* zero is not a hard item but an incoherent one — three figures
 * cannot leave a room holding two — and a reader who noticed would be right to stop trusting
 * the format. That much was obvious from the start.
 *
 * Reaching *exactly* zero mid-stream is subtler and was caught only by looking at the pinned
 * preview card, whose totals ran 1, 0, 3, 6. It is perfectly coherent, and it quietly destroys
 * the task: once the room is empty everything before that point is irrelevant, so the reader
 * can stop tracking and simply add up the rest. On that card the first two steps were
 * decoration. And a final total of zero is unusable for the n-back reason — "none left" is
 * where you land by never watching, indistinguishable from not having engaged.
 *
 * So the floor is one, held throughout, by construction rather than by filtering: a departure
 * is never drawn larger than `total - 1`.
 */
import { createRng, type Rng } from '../rng';
import { dict, type Locale } from '../i18n';
import type { Difficulty, ErrorType, Generator, Item, ItemTypeMeta, Option } from '../types';

const OPTION_COUNT = 4;

interface Plan {
  /** How many arrival/departure steps the stream contains. */
  events: number;
  /** Largest number of figures that may move in a single step. */
  maxPerEvent: number;
  /**
   * Most figures the room may hold.
   *
   * This is what keeps the format measuring tracking rather than arithmetic. Without a
   * ceiling the total drifts upward across the stream — at eight events it reached the
   * twenties — and holding "23, now 26" is mental addition on two-digit numbers, which is a
   * different construct with its own format. Difficulty here is how many times the held
   * value is rewritten and how fast, never how large it gets.
   */
  capacity: number;
  /** Milliseconds each step is shown. */
  stepMs: number;
}

function planFor(difficulty: Difficulty): Plan {
  switch (difficulty) {
    case 1:
      return { events: 4, maxPerEvent: 3, capacity: 7, stepMs: 1200 };
    case 2:
      return { events: 5, maxPerEvent: 3, capacity: 8, stepMs: 1100 };
    case 3:
      return { events: 6, maxPerEvent: 4, capacity: 9, stepMs: 1000 };
    case 4:
      return { events: 8, maxPerEvent: 4, capacity: 9, stepMs: 950 };
    case 5:
      return { events: 9, maxPerEvent: 4, capacity: 10, stepMs: 850 };
  }
}

/**
 * How many of the steps must be departures.
 *
 * "At least one" was the original rule and it was far too weak: a nine-event stream with a
 * single departure is an accumulation with one interruption, and accumulating never forces the
 * held value to be discarded. Requiring roughly a third makes the updating continuous, which
 * is the thing the format is for.
 */
function minDepartures(events: number): number {
  return events >= 5 ? Math.max(2, Math.round(events * 0.35)) : 1;
}

/**
 * Walks the finished script and returns the total remaining — the independent check.
 *
 * The builder tracks the total as it goes, so it already "knows" the answer. This derives it
 * again from the events the reader will actually see, and throws if the script ever leaves the
 * room empty. The two must agree or the item is discarded: that is the difference between an
 * answer that is constructed and one that is merely intended (`GENERATABILITY.md` §1).
 */
export function finalCount(events: number[]): number {
  let total = 0;
  for (const delta of events) {
    total += delta;
    if (total < 1) throw new RangeError(`head-count script emptied the room: ${events.join(',')}`);
  }
  return total;
}

/**
 * Builds a script of signed deltas, or `null` if this draw did not satisfy the invariants.
 *
 * Direction is drawn against the room's remaining headroom rather than from a fixed coin: the
 * emptier the room, the likelier the next step is an arrival. That is what holds the total in
 * the middle of its range instead of letting it wander to a wall and stay there, and it is why
 * both directions appear throughout the stream rather than in runs.
 *
 * Three invariants hold by construction rather than by filtering: a departure never leaves the
 * room empty, an arrival never exceeds the headroom, and no step moves nobody. Only the share
 * of departures is checked and retried, because it is a property of the whole script rather
 * than of any one step.
 */
function buildScript(plan: Plan, rng: Rng): number[] | null {
  const events: number[] = [];
  let total = 0;

  for (let i = 0; i < plan.events; i++) {
    const headroom = plan.capacity - total;
    /*
     * The room may never empty, not merely at the end.
     *
     * Reaching zero mid-stream resets the task: from that point everything before it is
     * irrelevant, so a reader can stop tracking and simply add up the rest. The first pinned
     * preview drew exactly that — the totals ran 1, 0, 3, 6, and the first two steps were
     * decoration. Holding the floor at one keeps the load continuous across the whole stream.
     */
    const canLeave = total > 1;
    const canArrive = headroom > 0;
    const arriving = canArrive && (!canLeave || rng.bool(headroom / plan.capacity));

    if (arriving) {
      const n = rng.int(1, Math.min(plan.maxPerEvent, headroom));
      events.push(n);
      total += n;
    } else {
      const n = rng.int(1, Math.min(plan.maxPerEvent, total - 1));
      events.push(-n);
      total -= n;
    }
  }

  if (events.filter((d) => d < 0).length < minDepartures(plan.events)) return null;
  return events;
}

const meta: ItemTypeMeta = {
  id: 'head-count',
  domain: 'Gwm',
  icon: '⇄',
  sprintable: false,
};

const MAX_ATTEMPTS = 100;

function generate(seed: string, difficulty: Difficulty, locale: Locale): Item {
  const t = dict(locale).gen.headCount;
  const rng = createRng(`head-count:${seed}:${difficulty}`);
  const plan = planFor(difficulty);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const events = buildScript(plan, rng);
    if (!events) continue;

    const answer = finalCount(events);

    /*
     * Every distractor is a specific way of mistracking one step, and every one of them lands
     * within a few units of the answer. Both halves of that matter.
     *
     * The obvious distractor — the total you get by counting the arrivals and ignoring the
     * departures altogether — was tried first and had to go. It is the sum of *all* the
     * departures away from the answer, so on a longer stream it arrives as 20 beside an answer
     * of 4, and an option that far out can be dismissed without having watched anything. That
     * is exactly the I-RAVEN leak (`IQ-TESTS.md` §5.2): the option set alone answers the item.
     *
     * What replaces it are the two errors a reader actually makes on a stream that will not
     * repeat — losing one departure, and seeing one departure as an arrival. Both are bounded
     * by a single step's size, so neither can stick out.
     */
    const departures = events.filter((d) => d < 0).map(Math.abs);
    const missed = rng.pick(departures);

    const values: number[] = [answer];
    const errors = new Map<number, ErrorType>([[answer, 'correct']]);
    const offer = (v: number, type: ErrorType) => {
      if (v < 0 || errors.has(v) || values.length >= OPTION_COUNT) return;
      values.push(v);
      errors.set(v, type);
    };

    // Blinked through one departure: it never came off the total.
    offer(answer + missed, 'wrong-rule');
    // Saw the group leave but added it: right magnitude, wrong direction.
    offer(answer + 2 * missed, 'wrong-direction');
    for (let delta = 1; values.length < OPTION_COUNT; delta++) {
      offer(answer - delta, delta === 1 ? 'off-by-one' : 'plausible');
      offer(answer + delta, delta === 1 ? 'off-by-one' : 'plausible');
      if (delta > OPTION_COUNT + 3) break;
    }
    if (values.length !== OPTION_COUNT) continue;

    const shuffled = rng.shuffle(values);
    const options: Option[] = shuffled.map((v) => ({ kind: 'text', text: String(v) }));

    return {
      type: 'head-count',
      seed,
      difficulty,
      prompt: t.prompt,
      stimulus: { kind: 'head-count', events },
      responseMode: 'choice',
      options,
      answerIndex: shuffled.indexOf(answer),
      errorTypes: shuffled.map((v) => errors.get(v) ?? 'plausible'),
      explanation: {
        summary: t.summary(answer),
        /*
         * The running total is spelled out step by step. A reader who lost the count can see
         * *where* it slipped, which a final number alone cannot tell them — and it is the only
         * way to review an item whose stimulus is gone by the time the answer appears.
         */
        rules: [t.ruleTrack, t.ruleSteps(runningTotals(events, locale)), t.ruleMissedStep(missed)],
      },
      suggestedSeconds: 12 + plan.events * 2,
      presentation: { stepMs: plan.stepMs, gapMs: 250 },
    };
  }

  throw new Error(
    `head-count generator exhausted ${MAX_ATTEMPTS} attempts for seed "${seed}" d${difficulty}`,
  );
}

/** "3 in → 3, 2 out → 1, 4 in → 5" — the script with its running total, for the explanation. */
function runningTotals(events: number[], locale: Locale): string {
  const t = dict(locale).gen.headCount;
  let total = 0;
  return events
    .map((delta) => {
      total += delta;
      return t.step(Math.abs(delta), delta > 0, total);
    })
    .join(', ');
}

export const headCountGenerator: Generator = { meta, generate };
