/**
 * Change maker — hand over the fewest coins that come to the change.
 *
 * The subtraction is the easy half and it is not what the format is for. What it measures is the
 * *decomposition*: given an amount, find the smallest set of denominations that makes it — which is
 * the greedy algorithm everybody runs at a till without ever having been taught it, over a base
 * that is neither ten nor a hundred but the messy mixture a currency actually is.
 *
 * ## Why the answer is a set of coins and not an amount
 *
 * "£5.00 less £3.45" is arithmetic in a hat: `arithmetic` and `serial-subtraction` already measure
 * that, and better. Asking *which coins* is the part of the task that has no equivalent anywhere
 * else here, and it is the part with the interesting failure mode — the greedy choice is optimal for
 * these denominations, but only if you take the largest coin that fits at every step, and stopping
 * one denomination short is what produces a fistful of change.
 *
 * ## Why one seed gives the same item in both languages
 *
 * The euro and the pound have identical denomination structure — 1, 2, 5, 10, 20, 50, 100, 200 in
 * the smallest unit — so the same amounts decompose into the same *counts* of coins in both, and
 * only the symbols differ. That is luck rather than design, and it is what lets this format keep the
 * promise every other one makes: a shared seed is the same item in either language, with the same
 * difficulty and the same answer. A currency with a 25-unit coin would have broken it.
 *
 * ## Why every option has the same number of coins
 *
 * Otherwise the item is answerable by counting: "fewest coins" would make the shortest list right
 * every time, and the reader would never have to add anything up. Every option here is the same
 * length as the answer, so the count says nothing and only the total decides — which also means the
 * distractors are genuinely tempting, since they are the same size handful of coins and differ only
 * in being wrong.
 */
import { createRng, type Rng } from '../rng';
import { dict, type Locale } from '../i18n';
import type { Difficulty, ErrorType, Generator, Item, ItemTypeMeta, Option } from '../types';

const OPTION_COUNT = 4;

/**
 * The denominations, in the smallest unit — pence or cents, identically.
 *
 * Notes above 200 are deliberately absent: what a note buys is one more subtraction, where what a
 * coin buys is a decomposition step, and the format is about the decomposition. Amounts stay under
 * two of the largest coin for the same reason.
 */
export const DENOMINATIONS = [200, 100, 50, 20, 10, 5, 2, 1] as const;

/**
 * What a person hands over, smallest first: a pound, two, a five, a ten, a twenty.
 *
 * Both currencies again agree on these, and the list is deliberately not "any round number" — £3 and
 * €7 are not things anybody puts on a counter, and an item that said so would be describing a
 * transaction that does not happen.
 */
const TENDERS = [100, 200, 500, 1000, 2000] as const;

interface Plan {
  /** The change the reader has to make, in the smallest unit. */
  change: [min: number, max: number];
  /** The coarsest denomination the price may land on — 5 keeps the ones out of it. */
  grain: number;
  /** How many coins the answer must use. */
  coins: [min: number, max: number];
}

/**
 * Difficulty is how many coins the answer takes, not how large the amount is.
 *
 * A larger amount is not a harder decomposition — £4.50 is two coins and 87p is six — so the dial is
 * the number of steps the greedy run takes. The grain is the second dial and it works the same way:
 * an amount that is a multiple of five never reaches the 2 and 1 coins, so the run stops early.
 */
function planFor(difficulty: Difficulty): Plan {
  switch (difficulty) {
    case 1:
      return { change: [25, 95], grain: 5, coins: [2, 2] };
    case 2:
      return { change: [30, 190], grain: 5, coins: [2, 3] };
    case 3:
      return { change: [45, 285], grain: 5, coins: [3, 4] };
    case 4:
      return { change: [40, 320], grain: 1, coins: [4, 5] };
    case 5:
      return { change: [60, 385], grain: 1, coins: [5, 6] };
  }
}

/**
 * The fewest coins that make `amount` — the greedy run, which is optimal for these denominations.
 *
 * Returned as a descending list of coins rather than as counts, because that is what the reader is
 * shown and what the options are compared as. It is also the independent check: the generator picks
 * an amount, and this decides what the answer is.
 */
export function makeChange(amount: number): number[] {
  const coins: number[] = [];
  let left = amount;
  for (const coin of DENOMINATIONS) {
    while (left >= coin) {
      coins.push(coin);
      left -= coin;
    }
  }
  return coins;
}

/** What a handful of coins comes to. The other half of the check. */
export function totalOf(coins: number[]): number {
  return coins.reduce((sum, coin) => sum + coin, 0);
}

const key = (coins: number[]): string => [...coins].sort((a, b) => b - a).join(',');

const meta: ItemTypeMeta = {
  id: 'change-maker',
  domain: 'Gq',
  icon: '¤',
  sprintable: false,
};

const MAX_ATTEMPTS = 200;

function generate(seed: string, difficulty: Difficulty, locale: Locale): Item {
  const t = dict(locale).gen.changeMaker;
  const money = dict(locale).money;
  const rng = createRng(`change-maker:${seed}:${difficulty}`);
  const plan = planFor(difficulty);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const change = rng.int(plan.change[0] / plan.grain, plan.change[1] / plan.grain) * plan.grain;
    const answer = makeChange(change);
    if (answer.length < plan.coins[0] || answer.length > plan.coins[1]) continue;
    // The check the format rests on: the coins named must come to the change asked for.
    if (totalOf(answer) !== change) continue;

    /*
     * The amount handed over is one of the figures people actually hand over, and the price is what
     * is left when the change is taken off it — derived from the change rather than drawn, so the
     * two can never disagree.
     *
     * The smallest such figure that leaves a *plausible* price is chosen, and plausibility is the
     * point: rounding the change up to the next pound gave "the bill comes to 57p, you hand over
     * £3", which nobody has ever done. Requiring the price to be most of what was handed over turns
     * the same item into "the bill comes to £2.57, you hand over £5", which is the transaction the
     * format is named after.
     */
    const tendered = TENDERS.find((note) => note - change >= note * 0.45);
    if (tendered === undefined) continue;
    const price = tendered - change;

    const distractors = wrongHandfuls(answer, change, rng);
    if (distractors.length < OPTION_COUNT - 1) continue;

    const picks = rng.shuffle([
      { coins: answer, errorType: 'correct' as ErrorType },
      ...distractors.slice(0, OPTION_COUNT - 1),
    ]);

    const options: Option[] = picks.map((p) => ({ kind: 'text', text: money.coins(p.coins) }));

    return {
      type: 'change-maker',
      seed,
      difficulty,
      prompt: t.prompt,
      stimulus: {
        kind: 'text',
        lines: [t.priceLine(money.amount(price)), t.tenderedLine(money.amount(tendered))],
      },
      responseMode: 'choice',
      options,
      answerIndex: picks.findIndex((p) => p.errorType === 'correct'),
      errorTypes: picks.map((p) => p.errorType),
      explanation: {
        summary: t.summary(money.amount(change), money.coins(answer)),
        rules: [
          t.ruleSubtract(money.amount(tendered), money.amount(price), money.amount(change)),
          t.ruleGreedy(money.coins(answer)),
          t.ruleSameCount(answer.length),
        ],
      },
      suggestedSeconds: 12 + answer.length * 3,
    };
  }

  throw new Error(
    `change-maker generator exhausted ${MAX_ATTEMPTS} attempts for seed "${seed}" d${difficulty}`,
  );
}

/**
 * Handfuls that are wrong, and wrong in a way somebody is actually wrong.
 *
 * Every one holds **the same number of coins as the answer**, which is what stops "count the
 * options" from working — see the module header. Two of them also exist to stop a subtler attack,
 * and the shape of the set is the whole defence.
 *
 * ## Why the set is two pairs and not three satellites
 *
 * The obvious construction is three perturbations of the answer, and it leaks. Every distractor
 * then resembles the answer and none of them resemble each other, so the answer is the option with
 * the most in common with the rest — the I-RAVEN attribute-wise mode, in coins. A blind solver
 * scored 39.6% against a 26% baseline on exactly that.
 *
 * So the set is built as **two pairs**: the answer with one coin swapped, and a handful for a
 * *nearby amount* with one coin swapped. Both members of each pair look alike, and the two pairs
 * look alike as pairs, so being resembled says nothing. It is the same repair as the figural
 * analogy's — the answer must not be the only member of its class — arrived at from the other end.
 *
 * Each option still names a real mistake: the swap is the greedy run taking a wrong step, and the
 * nearby amount is the subtraction going wrong before the decomposition ever started.
 */
function wrongHandfuls(
  answer: number[],
  change: number,
  rng: Rng,
): { coins: number[]; errorType: ErrorType }[] {
  const seen = new Set([key(answer)]);
  const valid = (coins: number[]) =>
    coins.length === answer.length &&
    coins.every((c) => DENOMINATIONS.includes(c as (typeof DENOMINATIONS)[number])) &&
    totalOf(coins) !== change &&
    !seen.has(key(coins));

  /**
   * Every one-coin substitution of a handful, in a drawn order — never touching the largest coin.
   *
   * That exclusion is the second half of the leakage fix, and it is about what the *strings* look
   * like rather than what the coins are worth. An option is read by a blind solver as its length and
   * its first character, and the first character is the leading coin's: swap a £1 for a 50p and the
   * handful stops starting with a pound sign, so it drops out of the group the other three are in
   * and the answer becomes the one they share a character with. Holding every option's leading coin
   * fixed empties that feature of information entirely.
   */
  const swaps = (coins: number[]): number[][] => {
    const out: number[][] = [];
    for (const index of rng.shuffle(coins.map((_, i) => i).slice(1))) {
      for (const step of rng.shuffle([1, -1])) {
        const at = DENOMINATIONS.indexOf(coins[index]! as (typeof DENOMINATIONS)[number]);
        const swapped = DENOMINATIONS[at + step];
        if (swapped === undefined) continue;
        // Nor may a swap promote a coin past the leader, which would move the leading coin anyway.
        if (swapped > coins[0]!) continue;
        const candidate = [...coins];
        candidate[index] = swapped;
        out.push(candidate);
      }
    }
    return out;
  };

  const take = (coins: number[], errorType: ErrorType) => {
    seen.add(key(coins));
    return { coins: [...coins].sort((a, b) => b - a), errorType };
  };

  // The answer's own satellite.
  const mine = swaps(answer).find(valid);
  if (!mine) return [];
  const out = [take(mine, 'wrong-rule')];

  /*
   * The other pair: a handful for an amount a few units out, and that handful with one coin swapped.
   * Both are needed, and an amount that cannot supply both is passed over rather than half-used —
   * a lone satellite on the answer's side is the arrangement this construction exists to avoid.
   */
  for (const delta of rng.shuffle([1, -1, 2, -2, 5, -5, 10, -10])) {
    if (change + delta <= 0) continue;
    const decoy = makeChange(change + delta);
    // Same leading coin as the answer, for the reason `swaps` gives: every option must start alike.
    if (!valid(decoy) || decoy[0] !== answer[0]) continue;
    const partner = swaps(decoy).find((c) => valid(c) && key(c) !== key(decoy));
    if (!partner) continue;
    out.push(take(decoy, Math.abs(delta) >= 10 ? 'carry' : 'off-by-one'));
    out.push(take(partner, 'wrong-rule'));
    break;
  }

  return out;
}

export const changeMakerGenerator: Generator = { meta, generate };
