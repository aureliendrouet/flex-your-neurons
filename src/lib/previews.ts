/**
 * Pinned preview items — one real, generated item per format, drawn at build time.
 *
 * These exist because of a plain usability failure: an emoji and a sentence do not tell
 * you what a "paper folding" item *looks like*, so choosing a format was guesswork until
 * you had committed to one. The fix is to show the thing itself.
 *
 * The seed and difficulty are pinned rather than random for three reasons: the cards must
 * be byte-identical on every build (a shifting home page reads as instability), the
 * preview must be legible at ~10rem rather than merely valid, and a pinned pair can be
 * tuned by hand when a format draws badly. Difficulty sits low on purpose — a level-5
 * matrix carries five simultaneous rules, which at thumbnail size is noise.
 *
 * Nothing here is a second renderer or a second generator: `previewItem` calls the same
 * `generateItem` the quiz does, so a card cannot drift from the product it advertises.
 */
import { generateItem } from './generators';
import { DEFAULT_LOCALE, type Locale } from './i18n';
import type { Difficulty, Item, ItemTypeId } from './types';

interface Pin {
  seed: string;
  difficulty: Difficulty;
}

/**
 * Hand-picked so each miniature reads at card size.
 *
 * `tests/previews.test.ts` guards the properties that make them legible — a matrix that
 * drew nine 3x3-layout cells, or a nineteen-term sequence, would pass every generator test
 * and still be an unreadable thumbnail.
 */
export const PREVIEW_PINS: Record<ItemTypeId, Pin> = {
  matrix: { seed: 'PRVMATRX', difficulty: 2 },
  'series-number': { seed: 'PRVNUMBR', difficulty: 2 },
  'series-letter': { seed: 'PRVLETTR', difficulty: 2 },
  'odd-one-out': { seed: 'PRVODDIE', difficulty: 2 },
  'analogy-figural': { seed: 'PRVANLGY', difficulty: 2 },
  syllogism: { seed: 'PRVSYLLO', difficulty: 2 },
  rotation: { seed: 'PRVROTAT', difficulty: 2 },
  'paper-folding': { seed: 'PRVFOLDS', difficulty: 1 },
  span: { seed: 'PRVSPANS', difficulty: 2 },
  // Level 3 rather than 1: this format only draws its *two* targets from level 3 up, and
  // "is either of these two in the group" is the whole shape of the task.
  'symbol-search': { seed: 'PRVSYMBL', difficulty: 3 },
  // Level 1: four pairs. A nine-pair key is the same task with more scanning, and at card
  // size the extra columns are illegible rather than informative.
  // Level 1: a 1-back over seven elements. The card shows the stream's shape; a 3-back over
  // fourteen would be the same picture with more letters in it.
  /*
   * Hand-picked, and the pin matters more here than elsewhere. With a small weight system the
   * only group of the right weight is often the other pan of the premise that defines it, so
   * the answer is the premise copied out — a legitimate item, but one whose miniature reads as
   * "find the matching picture" rather than as algebra. This seed's answer is three of a shape
   * that appears nowhere as a pan, so the card shows the format doing its actual work.
   */
  'figure-weights': { seed: 'PRVWGHT1', difficulty: 2 },
  'n-back': { seed: 'PRVNBACK', difficulty: 1 },
  /*
   * Level 1, and chosen by looking at candidates rather than by taking the first that worked.
   * This one runs +3 −1 +2 −1, so its totals go 3, 2, 4, 3 — the directions alternate and the
   * held value visibly rises *and* falls. Most seeds open with a run of arrivals, which draws a
   * card that reads as counting; the whole claim of the format is that the total is rewritten in
   * both directions, so the card has to show that.
   */
  'head-count': { seed: 'PRVROOM2', difficulty: 1 },
  coding: { seed: 'PRVCODNG', difficulty: 1 },
  // Level 3, where multiplication first appears: an addition of two small numbers advertises the
  // format as easier than it is, and the card is the only thing a reader sees before choosing.
  arithmetic: { seed: 'PRVMATHS', difficulty: 3 },
  // Level 3, where most trials are incongruent: a congruent card (three 3s) advertises the format
  // as "count these", which is the one reading the task is built to defeat.
  interference: { seed: 'PRVSTROO', difficulty: 3 },
  // Level 1, eight nodes: enough for the wandering path to read as a search, few enough that the
  // labels are still legible at card size.
  'trail-making': { seed: 'PRVTRAIL', difficulty: 1 },
  /*
   * Level 2, four blocks. Long enough that the numbered path visibly wanders — a three-block card
   * reads as a corner rather than as an order — and short enough that five of the nine blocks stay
   * blank, which is what says the board is bigger than the sequence.
   */
  'block-span': { seed: 'PRVBLOCK', difficulty: 2 },
  /*
   * Level 3, where most trials are incongruent — the same call as the interference pin. A congruent
   * card shows the big number winning, which advertises the format as "pick the bigger one": the
   * one reading the task exists to defeat.
   */
  'high-number': { seed: 'PRVHIGHN', difficulty: 3 },
  'hand-game': { seed: 'PRVHANDS', difficulty: 3 },
  // Level 2: a four-step chain. Long enough to read as a chain, short enough to fit the card.
  'serial-subtraction': { seed: 'PRVSERIA', difficulty: 2 },
  // Level 1: two terms. Three chips and a blank is the whole idea; a four-term card is the same
  // picture with less room in it.
  'math-recall': { seed: 'PRVRECAL', difficulty: 1 },
  'time-lapse': { seed: 'PRVLAPSE', difficulty: 2 },
  // Level 3, where the rotation is large enough to be unmistakable at card size.
  'clock-spin': { seed: 'PRVSPINC', difficulty: 3 },
  // Level 2: forwards, inside one month. The card has to fit two short lines, and the crossing
  // variant needs a third clause that pushes the second line past what the miniature can show.
  'calendar-count': { seed: 'PRVCALND', difficulty: 2 },
  // Level 3: three or four coins. Two is not visibly a decomposition, and six does not fit the card.
  'change-maker': { seed: 'PRVCHNGE', difficulty: 3 },
  // Level 1: a three-wide base of single digits. The pyramid's *shape* is what the card has to
  // show, and a four-wide base of two-digit numbers is the same shape with less room for it.
  'triangle-math': { seed: 'PRVTRIAN', difficulty: 1 },
};

/** The pinned item for a format. Pure: same format and locale always give the same item. */
export function previewItem(id: ItemTypeId, locale: Locale = DEFAULT_LOCALE): Item {
  const pin = PREVIEW_PINS[id];
  return generateItem(id, pin.seed, pin.difficulty, locale);
}
