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
// Letters that are unambiguous when spoken or read quickly.
const LETTERS = 'BDFHJKLMNPRSTVWXZ'.split('');

interface Plan {
  length: number;
  direction: 'forward' | 'backward';
  alphabet: string[];
  stepMs: number;
}

function planFor(difficulty: Difficulty): Plan {
  switch (difficulty) {
    case 1:
      return { length: 4, direction: 'forward', alphabet: DIGITS, stepMs: 1000 };
    case 2:
      return { length: 5, direction: 'forward', alphabet: DIGITS, stepMs: 900 };
    case 3:
      return { length: 5, direction: 'backward', alphabet: DIGITS, stepMs: 900 };
    case 4:
      return { length: 6, direction: 'backward', alphabet: DIGITS, stepMs: 800 };
    case 5:
      return { length: 7, direction: 'backward', alphabet: LETTERS, stepMs: 800 };
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
