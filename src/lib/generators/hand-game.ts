/**
 * Hand game — rock, paper, scissors, played against an instruction that changes.
 *
 * One hand is shown and the reader plays the hand that *beats* it, or the hand that *loses* to it,
 * according to what the item asks. Both halves matter. Beating the shown hand is the response
 * everybody already has: the game is over-learned, and the winning move arrives without being
 * worked out. Losing to it deliberately is the same lookup run against that habit, so the item asks
 * for a prepotent response on some trials and its suppression on others — which is what a
 * response-inhibition task *is* (the go/no-go and Simon families; here in the Brain Age 2 dress,
 * where it is a brain-age check).
 *
 * ## Why the option set is the three hands, in the same order every time
 *
 * The same reasoning as the interference keypad. The measurement is a few hundred milliseconds of
 * conflict, so a shuffled option list would put a visual search in front of every response and the
 * search would be larger than the effect. A fixed mapping is learned once, and then the only thing
 * that varies is the decision.
 *
 * It also makes the option set carry nothing at all: all three hands are offered on every item,
 * whatever is shown and whatever is asked, so there is no option-set-only strategy to have.
 *
 * ## Why the two wrong hands are both named
 *
 * There are exactly two ways to be wrong here and neither is carelessness. Playing the hand that was
 * shown is failing to transform it at all; playing the third hand is answering the *other*
 * instruction — winning when asked to lose, which is precisely the automatic response getting out.
 * A format with only two distractors can afford to diagnose both, and the second diagnosis is the one
 * that says what this format measures.
 *
 * ## Why the item space is small, and why that is the paradigm
 *
 * Three hands times two instructions is six items, and no seed will ever produce a seventh. That is
 * the same shape as `interference`, and for the same reason: a conflict task is a small stimulus set
 * shown many times, because the response has to *become* automatic before there is anything to
 * inhibit. Novelty would defeat it. `tests/generators.test.ts` exempts both formats from the variety
 * property for exactly this reason.
 */
import { createRng } from '../rng';
import { dict, type Locale } from '../i18n';
import { HANDS, type Difficulty, type ErrorType, type Generator, type Hand, type Item, type ItemTypeMeta, type Option } from '../types';

/** What each hand beats. The cycle, written once. */
const BEATS: Record<Hand, Hand> = {
  rock: 'scissors',
  paper: 'rock',
  scissors: 'paper',
};

/** The hand that beats the given one — the inverse of `BEATS`, derived rather than written twice. */
export function beatenBy(hand: Hand): Hand {
  const winner = HANDS.find((h) => BEATS[h] === hand);
  if (!winner) throw new Error(`no hand beats ${hand}`);
  return winner;
}

/** The hand that answers `want` against `hand` — the independent check, and the answer key. */
export function play(hand: Hand, want: 'win' | 'lose'): Hand {
  return want === 'win' ? beatenBy(hand) : BEATS[hand];
}

/**
 * How often the instruction is the one that has to be held back.
 *
 * The only dial, and deliberately the only one — as with the counting Stroop, the load is the
 * conflict, so the thing to scale is how often the conflict fires. Level 1 is an even split, where
 * the automatic answer is right half the time and can be leaned on; level 5 is mostly "lose", where
 * it cannot.
 */
function loseShare(difficulty: Difficulty): number {
  switch (difficulty) {
    case 1:
      return 0.5;
    case 2:
      return 0.6;
    case 3:
      return 0.7;
    case 4:
      return 0.8;
    case 5:
      return 0.88;
  }
}

const meta: ItemTypeMeta = {
  id: 'hand-game',
  domain: 'Gs',
  icon: '✌',
  sprintable: true,
};

function generate(seed: string, difficulty: Difficulty, locale: Locale): Item {
  const t = dict(locale).gen.handGame;
  const rng = createRng(`hand-game:${seed}:${difficulty}`);

  const hand = rng.pick([...HANDS]);
  const want: 'win' | 'lose' = rng.bool(loseShare(difficulty)) ? 'lose' : 'win';
  const answer = play(hand, want);

  const options: Option[] = HANDS.map((h) => ({ kind: 'text', text: t.hands[h] }));
  const errorTypes: ErrorType[] = HANDS.map((h) =>
    h === answer
      ? 'correct'
      : h === hand
        ? // The hand that was shown: the transformation never happened.
          'copy'
        : // The third hand answers the instruction that was *not* given.
          'wrong-direction',
  );

  return {
    type: 'hand-game',
    seed,
    difficulty,
    // The instruction changes from item to item, so it belongs in the prompt rather than in a rubric.
    prompt: want === 'win' ? t.promptWin : t.promptLose,
    stimulus: { kind: 'hands', hand, want },
    responseMode: 'choice',
    options,
    answerIndex: HANDS.indexOf(answer),
    errorTypes,
    explanation: {
      summary: t.summary(t.hands[answer], t.hands[hand], want === 'win'),
      rules: [
        want === 'win' ? t.ruleWin : t.ruleLose,
        t.ruleCycle(t.hands.rock, t.hands.paper, t.hands.scissors),
        t.ruleInhibition,
      ],
    },
    // Short, like the other conflict format: what is measured is the delay, not the lookup.
    suggestedSeconds: 4,
  };
}

export const handGameGenerator: Generator = { meta, generate };
