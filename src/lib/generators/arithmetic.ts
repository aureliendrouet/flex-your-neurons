/**
 * Mental arithmetic — evaluate a short expression, fast.
 *
 * The first quantitative-knowledge (Gq) format, and it fills a real gap: number series and figure
 * weights are both filed under Gf because what they measure is the *inference* of a rule, with the
 * arithmetic incidental. This measures the arithmetic itself, which nothing else here does.
 *
 * ## Why multiple choice, and not typing the answer
 *
 * Typing is the obvious response mode for a sum, and it is the wrong one. This format exists for
 * the sprint block, where the score is how much gets finished inside a window — and a typed answer
 * puts keyboard speed inside that measurement. Two readers who calculate equally well would be
 * separated by how fast they type digits, which is not the construct. Picking from four options
 * costs one keystroke for everyone.
 *
 * ## Why the last-digit shortcut is closed off
 *
 * The units digit of a sum or product is fixed by the units digits of the operands, so `7 × 8` can
 * be answered by computing one digit — *if* only one option ends in 6. That is distractor leakage
 * in arithmetic dress: the option set is answerable without doing the task. Every item here
 * therefore carries a distractor congruent to the answer mod 10 (the answer plus or minus ten),
 * which is also the realistic carry slip, so closing the shortcut and naming a genuine error turn
 * out to be the same move.
 *
 * ## Why precedence never comes up
 *
 * Two-operator expressions appear at the top level, and they mix only operators of equal
 * precedence — `12 + 7 − 5`, never `7 + 3 × 2`. The second has one right answer under the
 * convention and a different one read left to right, and an item whose answer depends on whether
 * the reader remembers a convention is measuring the convention. Left to right is the whole rule.
 */
import { createRng, type Rng } from '../rng';
import { dict, type Locale } from '../i18n';
import type { Difficulty, ErrorType, Generator, Item, ItemTypeMeta, Option } from '../types';

const OPTION_COUNT = 4;

/** Proper typographic operators, matching the care taken everywhere else in the UI. */
export type Operator = '+' | '−' | '×' | '÷';

interface Plan {
  operators: Operator[];
  /** Largest operand for the additive operators. */
  additiveMax: number;
  /** Largest operand for multiplication and division. */
  factorMax: number;
  /** Whether an expression may chain two operators of equal precedence. */
  chains: boolean;
}

function planFor(difficulty: Difficulty): Plan {
  switch (difficulty) {
    case 1:
      return { operators: ['+', '−'], additiveMax: 9, factorMax: 5, chains: false };
    case 2:
      return { operators: ['+', '−'], additiveMax: 40, factorMax: 6, chains: false };
    case 3:
      return { operators: ['+', '−', '×'], additiveMax: 80, factorMax: 9, chains: false };
    case 4:
      return { operators: ['+', '−', '×', '÷'], additiveMax: 120, factorMax: 12, chains: false };
    case 5:
      return { operators: ['+', '−', '×', '÷'], additiveMax: 150, factorMax: 12, chains: true };
  }
}

/**
 * Applies one operator, or `null` where the result is not a whole non-negative number.
 *
 * Division is only ever offered where it comes out exact, and subtraction only where the result
 * does not go below zero. Not because negatives or fractions are too hard, but because they are a
 * *different* skill — sign handling and fractions each deserve their own treatment rather than
 * arriving unannounced inside a speed drill.
 */
export function apply(a: number, operator: Operator, b: number): number | null {
  switch (operator) {
    case '+':
      return a + b;
    case '−':
      return a >= b ? a - b : null;
    case '×':
      return a * b;
    case '÷':
      return b !== 0 && a % b === 0 ? a / b : null;
  }
}

/** Evaluates a chain strictly left to right. See the header on why precedence never applies. */
export function evaluate(terms: number[], operators: Operator[]): number | null {
  let total = terms[0]!;
  for (const [i, operator] of operators.entries()) {
    const next = apply(total, operator, terms[i + 1]!);
    if (next === null) return null;
    total = next;
  }
  return total;
}

/** Draws the operands for one operator so that the result is a whole non-negative number. */
function drawPair(operator: Operator, plan: Plan, rng: Rng): [number, number] | null {
  switch (operator) {
    case '+': {
      const a = rng.int(2, plan.additiveMax);
      return [a, rng.int(2, plan.additiveMax)];
    }
    case '−': {
      const a = rng.int(3, plan.additiveMax);
      // Never a - a: a result of zero is memorable rather than calculated.
      return a <= 3 ? null : [a, rng.int(2, a - 1)];
    }
    case '×':
      return [rng.int(2, plan.factorMax), rng.int(2, plan.factorMax)];
    case '÷': {
      // Built from the answer outwards, so exactness is a property of construction.
      const divisor = rng.int(2, plan.factorMax);
      const quotient = rng.int(2, plan.factorMax);
      return [divisor * quotient, divisor];
    }
  }
}

interface Expression {
  terms: number[];
  operators: Operator[];
  value: number;
}

function buildExpression(plan: Plan, rng: Rng): Expression | null {
  const operator = rng.pick(plan.operators);
  const pair = drawPair(operator, plan, rng);
  if (!pair) return null;

  const terms = [...pair];
  const operators: Operator[] = [operator];

  if (plan.chains) {
    /*
     * A second operator of the *same* precedence class, so the chain reads left to right with no
     * convention to remember. Additive chains take another additive operator; multiplicative
     * chains take another multiplicative one.
     */
    const additive = operator === '+' || operator === '−';
    const pool: Operator[] = additive ? ['+', '−'] : ['×', '÷'];
    const second = rng.pick(pool.filter((o) => plan.operators.includes(o)));
    const head = evaluate(terms, operators);
    if (head === null) return null;

    let third: number;
    if (second === '÷') {
      // Must divide the running total exactly, so it is drawn from that total's divisors.
      const divisors = [];
      for (let d = 2; d <= Math.min(plan.factorMax, head); d++) if (head % d === 0) divisors.push(d);
      if (divisors.length === 0) return null;
      third = rng.pick(divisors);
    } else if (second === '−') {
      if (head <= 3) return null;
      third = rng.int(2, head - 1);
    } else {
      third = rng.int(2, additive ? plan.additiveMax : Math.min(plan.factorMax, 9));
    }
    terms.push(third);
    operators.push(second);
  }

  const value = evaluate(terms, operators);
  // A single-digit answer to a chained expression is usually a giveaway rather than a calculation.
  if (value === null || value < 2) return null;
  return { terms, operators, value };
}

/** "12 + 7 − 5", ready to display. */
export function formatExpression(expression: Expression): string {
  return expression.terms
    .map((term, i) => (i === 0 ? String(term) : `${expression.operators[i - 1]} ${term}`))
    .join(' ');
}

/**
 * The value a reader lands on by applying a different operator to the same operands — the
 * commonest arithmetic slip that is not a miscount. `null` when no substitute is well defined.
 */
function wrongOperatorValue(expression: Expression): number | null {
  /*
   * The same-precedence substitute is tried first, and the order is not cosmetic. Reading × where
   * + was written produces a value from another world — `34 + 26` becomes 884 — which the magnitude
   * band in `generate` then rejects, wasting the slot on nothing. Reading − where + was written
   * stays near the answer whenever the second operand is small relative to it, so it is the
   * substitution most likely to survive as an actual named distractor.
   */
  const first = expression.operators[0]!;
  const BY_OPERATOR: Record<Operator, Operator[]> = {
    '+': ['−', '×'],
    '−': ['+', '×'],
    '×': ['÷', '+'],
    '÷': ['×', '+'],
  };

  for (const substitute of BY_OPERATOR[first]) {
    const value = evaluate(expression.terms, [substitute, ...expression.operators.slice(1)]);
    if (value !== null && value >= 0 && value !== expression.value) return value;
  }
  return null;
}

/** The value from reading the first operator backwards: `b − a`, or `b ÷ a`. */
function reversedValue(expression: Expression): number | null {
  const first = expression.operators[0]!;
  if (first !== '−' && first !== '÷') return null; // commutative: nothing to reverse
  const [a, b] = [expression.terms[0]!, expression.terms[1]!];
  const value = apply(b, first, a);
  if (value === null || value === expression.value) return null;
  const rest = evaluate([value, ...expression.terms.slice(2)], expression.operators.slice(1));
  return rest !== null && rest >= 0 && rest !== expression.value ? rest : null;
}

const meta: ItemTypeMeta = {
  id: 'arithmetic',
  domain: 'Gq',
  // Not '×': beside a format name in a pill, a multiplication sign reads as a close button.
  icon: '÷',
  sprintable: true,
};

const MAX_ATTEMPTS = 200;

function generate(seed: string, difficulty: Difficulty, locale: Locale): Item {
  const t = dict(locale).gen.arithmetic;
  const rng = createRng(`arithmetic:${seed}:${difficulty}`);
  const plan = planFor(difficulty);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const expression = buildExpression(plan, rng);
    if (!expression) continue;
    const { value } = expression;

    const values: number[] = [value];
    const errors = new Map<number, ErrorType>([[value, 'correct']]);
    /*
     * Every option has to be in scale with the answer, and this bound is the whole reason.
     *
     * Substituting an operator is a realistic misreading, but substituting × into an additive
     * expression produces an answer from another world: `34 + 26` offered 884, and `37 − 26`
     * offered 962. An option that far out is discarded on sight, without any arithmetic — the same
     * leakage as an option set that answers the item on its own, arriving through a different door.
     *
     * The band scales with the answer, because "far out" is relative: 203 beside 213 is a real
     * candidate, while 16 beside 2 is not. A diagnostic distractor that falls outside it is simply
     * dropped and filler takes the slot; a named error is worth having, but not at the price of a
     * free elimination.
     */
    const band = Math.max(12, Math.ceil(value * 0.35));
    const offer = (candidate: number | null, type: ErrorType) => {
      if (candidate === null || candidate < 0 || errors.has(candidate)) return;
      if (values.length >= OPTION_COUNT) return;
      if (Math.abs(candidate - value) > band) return;
      values.push(candidate);
      errors.set(candidate, type);
    };

    /*
     * The carry slip goes in first and is not optional. It is the one distractor that shares the
     * answer's units digit, so without it an item can be answered by computing a single digit —
     * see the header. Preferring the direction that stays positive keeps it available at small
     * answers too.
     */
    offer(value >= 12 ? value - 10 : value + 10, 'carry');
    offer(reversedValue(expression), 'wrong-direction');
    offer(wrongOperatorValue(expression), 'wrong-rule');
    offer(rng.bool() ? value + 1 : value - 1, 'off-by-one');
    // Filler, still drawn near the answer so nothing is dismissible on size alone.
    for (let delta = 2; values.length < OPTION_COUNT && delta <= band; delta++) {
      offer(value + delta, 'plausible');
      offer(value - delta, 'plausible');
    }
    if (values.length !== OPTION_COUNT) continue;
    // The guard the header is about: at least two options must share the answer's units digit.
    if (values.filter((v) => v % 10 === value % 10).length < 2) continue;

    const shuffled = rng.shuffle(values);
    const options: Option[] = shuffled.map((v) => ({ kind: 'text', text: String(v) }));
    const display = formatExpression(expression);

    return {
      type: 'arithmetic',
      seed,
      difficulty,
      prompt: t.prompt,
      stimulus: { kind: 'expression', expression: display },
      responseMode: 'choice',
      options,
      answerIndex: shuffled.indexOf(value),
      errorTypes: shuffled.map((v) => errors.get(v) ?? 'plausible'),
      explanation: {
        summary: t.summary(display, value),
        rules: [
          expression.operators.length > 1 ? t.ruleLeftToRight : t.ruleSingle,
          t.ruleUnitsDigit(value % 10),
        ],
      },
      // Deliberately short: this is the one format meant to be answered in a couple of seconds.
      suggestedSeconds: 3 + difficulty,
    };
  }

  throw new Error(
    `arithmetic generator exhausted ${MAX_ATTEMPTS} attempts for seed "${seed}" d${difficulty}`,
  );
}

export const arithmeticGenerator: Generator = { meta, generate };
