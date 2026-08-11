/**
 * Serial subtraction — take the same number away, over and over, and say where you land.
 *
 * "Serial sevens" is one of the oldest bedside measures of sustained attention there is: it appears
 * in the mental-status examination, in delirium screens, and in the arithmetic sections of aptitude
 * batteries. What it loads is not the subtraction — anybody can do one — but the *chain*: each
 * answer becomes the next problem, so nothing can be checked against anything, and losing the thread
 * once loses the item.
 *
 * ## Why this is not the arithmetic format with a longer expression
 *
 * `arithmetic` caps a chain at two operators, on purpose: it is the sprint format, and its measure
 * is how many short calculations get finished in a window. Chaining seven subtractions there would
 * change what that score means. Here the chain *is* the format — six or seven steps at the top
 * level, all with the same operand, so what varies between levels is how long the thread has to be
 * held rather than how hard any one step is.
 *
 * The steps also avoid 5 and 10, which are the two that let a reader stop calculating: subtracting
 * ten walks the tens digit down a column, and subtracting five alternates between two units digits.
 * Both turn the chain into a pattern, and reading a pattern is not the task.
 *
 * ## Why the whole chain is written out
 *
 * Stating it once ("start at 167 and take away 8 six times") would add a memory load — how many
 * subtractions are left — that belongs to `math-recall` rather than here. Every term is on the
 * screen, so the item is exactly what it claims to be: an arithmetic thread with nowhere to write
 * the intermediate values down.
 */
import { createRng, type Rng } from '../rng';
import { dict, type Locale } from '../i18n';
import { rectangleOptions } from './distractors';
import type { Difficulty, ErrorType, Generator, Item, ItemTypeMeta, Option } from '../types';

interface Plan {
  /** Where the chain may start. */
  start: [min: number, max: number];
  /** Which numbers may be taken away. Never 5 or 10 — see the header. */
  steps: number[];
  /** How many subtractions the chain runs. */
  length: number;
}

function planFor(difficulty: Difficulty): Plan {
  switch (difficulty) {
    case 1:
      return { start: [40, 90], steps: [3, 4, 6], length: 3 };
    case 2:
      return { start: [60, 120], steps: [4, 6, 7], length: 4 };
    case 3:
      return { start: [80, 150], steps: [6, 7, 8, 9], length: 5 };
    case 4:
      return { start: [100, 200], steps: [7, 8, 9, 12], length: 6 };
    case 5:
      return { start: [120, 250], steps: [7, 9, 13, 17], length: 7 };
  }
}

/**
 * The smallest value the chain may end on.
 *
 * A chain that lands in single figures has two problems at once: the option set has to be top-heavy
 * because it cannot put a full run of distractors underneath, and a reader who has lost the thread
 * can often recover the answer by noticing there is nowhere further to fall. Neither is about
 * subtraction.
 */
const MIN_ANSWER = 12;

/**
 * Walks the chain and returns where it lands — the independent check.
 *
 * The builder already knows the answer, since it chose the start and the step. This recomputes it
 * from the terms the reader will actually see, one subtraction at a time, and the two have to agree
 * (`GENERATABILITY.md` §1).
 */
export function walkChain(start: number, step: number, length: number): number {
  let total = start;
  for (let i = 0; i < length; i++) total -= step;
  return total;
}

/** "167 − 8 − 8 − 8", ready to display. */
export function formatChain(start: number, step: number, length: number): string {
  return [String(start), ...Array.from({ length }, () => `− ${step}`)].join(' ');
}

const meta: ItemTypeMeta = {
  id: 'serial-subtraction',
  domain: 'Gq',
  icon: '−',
  /*
   * Not sprintable, and it is the one Gq format that is not. A seven-step chain takes twenty
   * seconds to do honestly, so a sixty-second block would hold three items — which measures the
   * length of the chain rather than sustained output.
   */
  sprintable: false,
};

const MAX_ATTEMPTS = 100;

function generate(seed: string, difficulty: Difficulty, locale: Locale): Item {
  const t = dict(locale).gen.serialSubtraction;
  const rng = createRng(`serial-subtraction:${seed}:${difficulty}`);
  const plan = planFor(difficulty);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const step = rng.pick(plan.steps);
    const start = rng.int(plan.start[0], plan.start[1]);
    const answer = walkChain(start, step, plan.length);
    if (answer < MIN_ANSWER) continue;
    /*
     * The chain has to cross at least one ten, or it is not a chain.
     *
     * Without a borrow anywhere the whole thing collapses to one subtraction on the units digit and
     * a tens digit that never moves — 89, 82, 75 is done by reading a single column. Requiring the
     * hundreds-or-tens place to change makes every item contain the part that is actually
     * bookkeeping.
     */
    if (Math.floor(start / 10) === Math.floor(answer / 10)) continue;

    const set = optionsFor(rng, answer, step);
    if (!set) continue;

    const shuffled = rng.shuffle(set.values);
    const options: Option[] = shuffled.map((v) => ({ kind: 'text', text: String(v) }));
    const chain = formatChain(start, step, plan.length);

    return {
      type: 'serial-subtraction',
      seed,
      difficulty,
      prompt: t.prompt,
      stimulus: { kind: 'expression', expression: chain },
      responseMode: 'choice',
      options,
      answerIndex: shuffled.indexOf(answer),
      errorTypes: shuffled.map((v) => set.errors.get(v) ?? 'plausible'),
      explanation: {
        summary: t.summary(chain, answer),
        rules: [
          t.ruleSteps(runningTotals(start, step, plan.length)),
          t.ruleOneStepOut(step),
          t.ruleCarry,
        ],
      },
      // Long enough to do the chain honestly: roughly three seconds a step, plus reading it.
      suggestedSeconds: 6 + plan.length * 3,
    };
  }

  throw new Error(
    `serial-subtraction generator exhausted ${MAX_ATTEMPTS} attempts for seed "${seed}" d${difficulty}`,
  );
}

/**
 * The option set: a rectangle whose two axes are the two mistakes this format actually produces.
 *
 * One axis is the step itself — a subtraction too many or too few, which is what losing count of
 * the chain gives you. The other is ten, the dropped or doubled borrow, which is also what keeps
 * the item from being answerable on its units digit alone: two options always share the answer's.
 */
function optionsFor(rng: Rng, answer: number, step: number) {
  const diagnose = (value: number): ErrorType => {
    if (Math.abs(value - answer) === step) return 'off-by-one';
    if (Math.abs(value - answer) === 10) return 'carry';
    return 'plausible';
  };
  return rectangleOptions(
    rng,
    answer,
    [step],
    [10],
    diagnose,
    // Wide enough for both axes at once, since the far corner sits at step + 10 from the answer.
    step + 12,
    1,
  );
}

/** "167 → 159 → 151" — the chain with its running value, for the explanation. */
function runningTotals(start: number, step: number, length: number): string {
  const totals = [start];
  for (let i = 0; i < length; i++) totals.push(totals[totals.length - 1]! - step);
  return totals.join(' → ');
}

export const serialSubtractionGenerator: Generator = { meta, generate };
