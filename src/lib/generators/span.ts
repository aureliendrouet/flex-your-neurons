/**
 * Digit / letter span — hold a sequence briefly, then reproduce it, forwards or backwards.
 *
 * This is a *recall* task, so it uses text entry rather than multiple choice. Turning it
 * into "pick the sequence you saw" would quietly change the construct from recall to
 * recognition, which is easier and loads differently — hence `responseMode: 'text'` exists
 * in the item model at all.
 */
import { createRng } from '../rng';
import { dict, type Locale } from '../i18n';
import type { Difficulty, Generator, Item, ItemTypeMeta } from '../types';

const DIGITS = '123456789'.split('');
/*
 * There is no letter alphabet here any more, and its removal is the point rather than a tidy-up.
 * Switching to letters at the top rung changed the phonological similarity of what had to be held,
 * so the hardest level measured a different thing from the four below it — see `planFor`. The format
 * is called "digit span" in both locales, and now that is what it is.
 */

interface Plan {
  length: number;
  direction: 'forward' | 'backward';
  alphabet: string[];
  stepMs: number;
}

/**
 * One element per second, at every level, and digits throughout.
 *
 * The ladder used to move three things at once — length 4→7, rate 1000→800 ms, and the alphabet from
 * digits to letters at the top rung — while the docs and the on-screen description promised only
 * that "sequences lengthen as difficulty rises". Two of those three were the drifts this repo's own
 * design notes forbid elsewhere:
 *
 *  - **Rate** trades storage against encoding speed, which is a different construct. `block-span`'s
 *    design note rules it out in as many words; the same argument applies to its sibling.
 *  - **Alphabet** changes phonological similarity, so difficulty 5 was a different task from
 *    difficulty 4 rather than a longer one — and difficulty 5 is the level `peakDifficulty` reports
 *    on, which makes it the number most likely to be read as "my span is seven".
 *
 * What remains is length, and the forward/backward condition — which is a genuine second dimension,
 * introduced once at level 3 and held from there, so no level is a mixture of the two.
 */
const STEP_MS = 900;

function planFor(difficulty: Difficulty): Plan {
  const base = { alphabet: DIGITS, stepMs: STEP_MS };
  switch (difficulty) {
    case 1:
      return { ...base, length: 4, direction: 'forward' };
    case 2:
      return { ...base, length: 5, direction: 'forward' };
    case 3:
      return { ...base, length: 5, direction: 'backward' };
    case 4:
      return { ...base, length: 6, direction: 'backward' };
    case 5:
      return { ...base, length: 7, direction: 'backward' };
  }
}

const meta: ItemTypeMeta = {
  id: 'span',
  domain: 'Gwm',
  icon: '⋯',
  sprintable: false,
};

function generate(seed: string, difficulty: Difficulty, locale: Locale): Item {
  const t = dict(locale).gen.span;
  const rng = createRng(`span:${seed}:${difficulty}`);
  const plan = planFor(difficulty);

  const sequence: string[] = [];
  for (let i = 0; i < plan.length; i++) {
    // Avoid immediate repeats: a doubled element is easy to mishear as a single one, and
    // runs like 4-5-6 chunk into one item, shortening the effective span.
    const pool = plan.alphabet.filter((ch, idx) => {
      if (ch === sequence[i - 1]) return false;
      const prevIdx = sequence[i - 1] ? plan.alphabet.indexOf(sequence[i - 1]!) : -99;
      return Math.abs(idx - prevIdx) !== 1;
    });
    sequence.push(rng.pick(pool.length > 0 ? pool : plan.alphabet));
  }

  const expected = plan.direction === 'forward' ? sequence : [...sequence].reverse();

  return {
    type: 'span',
    seed,
    difficulty,
    prompt: plan.direction === 'forward' ? t.promptForward : t.promptBackward,
    stimulus: { kind: 'span', sequence, direction: plan.direction },
    responseMode: 'text',
    options: [],
    answerIndex: -1,
    answerText: expected.join(''),
    errorTypes: [],
    explanation: {
      summary: t.summary(sequence.join(' '), expected.join(' ')),
      rules: [
        plan.direction === 'backward' ? t.ruleBackward : t.ruleForward,
        t.ruleChunking,
      ],
    },
    suggestedSeconds: 20 + plan.length * 3,
    presentation: { stepMs: plan.stepMs, gapMs: 200 },
  };
}

export const spanGenerator: Generator = { meta, generate };
