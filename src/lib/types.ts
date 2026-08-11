import type { Locale } from './i18n';

/**
 * Core data model shared by every generator, renderer, and store.
 *
 * The central invariant: an `Item` is *derived* from a seed, never stored. `answerIndex`
 * is produced by construction (the generator knows the answer because it built it from a
 * rule), never hand-keyed. See docs/GENERATABILITY.md §1.
 */

export type Difficulty = 1 | 2 | 3 | 4 | 5;

export const DIFFICULTIES: readonly Difficulty[] = [1, 2, 3, 4, 5];

export type ItemTypeId =
  | 'matrix'
  | 'series-number'
  | 'series-letter'
  | 'odd-one-out'
  | 'analogy-figural'
  | 'syllogism'
  | 'rotation'
  | 'paper-folding'
  | 'span'
  | 'symbol-search'
  | 'coding'
  | 'n-back'
  | 'head-count'
  | 'figure-weights'
  | 'arithmetic'
  | 'interference'
  | 'trail-making'
  | 'block-span'
  | 'high-number'
  | 'serial-subtraction'
  | 'math-recall'
  | 'time-lapse'
  | 'clock-spin'
  | 'hand-game';

/**
 * CHC broad ability. See docs/IQ-TESTS.md §2.
 *
 * `Gq` arrived with the arithmetic format and is deliberately narrow: number series and figure
 * weights both involve numbers but are filed under `Gf`, because what they measure is the
 * inference of a rule with the arithmetic incidental. `Gq` is for formats where the calculation
 * *is* the task.
 */
export type ChcDomain = 'Gf' | 'Gv' | 'Gwm' | 'Gs' | 'Gq';

// ---------------------------------------------------------------------------
// Figures — the visual vocabulary shared by all figural item types.
// ---------------------------------------------------------------------------

export const SHAPE_TYPES = [
  'circle',
  'square',
  'triangle',
  'diamond',
  'pentagon',
  'hexagon',
  'star',
  'cross',
] as const;

export type ShapeType = (typeof SHAPE_TYPES)[number];

/** Fill intensity 0 (hollow) … 5 (solid). Rendered as an opacity ramp, never as hue. */
export type ColorLevel = 0 | 1 | 2 | 3 | 4 | 5;

/** Relative size 1 (smallest) … 5 (largest). */
export type SizeLevel = 1 | 2 | 3 | 4 | 5;

export interface Shape {
  type: ShapeType;
  size: SizeLevel;
  color: ColorLevel;
  /** Degrees clockwise. */
  rotation: number;
  /** Centre position within the unit box, both in [0, 1]. */
  x: number;
  y: number;
}

/** Where shapes may sit inside a figure's unit box. */
export type SlotLayout = 'center' | 'grid2x2' | 'grid3x3';

/**
 * A composite drawing: zero or more shapes laid out in a unit box.
 * `layout` is carried explicitly because it determines shape scale, and cannot be
 * recovered from the shapes themselves (a one-shape figure on a 2x2 layout must still
 * be drawn at 2x2 scale so it matches its siblings).
 */
export interface Figure {
  layout: SlotLayout;
  shapes: Shape[];
}

/** A filled-cell grid, used by paper-folding results and polyomino rotation. */
export interface CellGrid {
  rows: number;
  cols: number;
  /** Row-major, length `rows * cols`. */
  cells: boolean[];
}

// ---------------------------------------------------------------------------
// Stimuli — what the user is shown.
// ---------------------------------------------------------------------------

export type Stimulus =
  /** The options themselves are the stimulus (odd-one-out). */
  | { kind: 'none' }
  /** 3x3 matrix with the last cell missing (`null`). */
  | { kind: 'matrix'; cells: (Figure | null)[] }
  /** Number or letter sequence; `null` marks the blank to fill. */
  | { kind: 'sequence'; terms: (string | null)[] }
  /** Several figures, one of which violates the shared concept. */
  | { kind: 'figure-set'; figures: Figure[] }
  /** A : B :: C : ? */
  | { kind: 'analogy'; a: Figure; b: Figure; c: Figure }
  /** Premises rendered as text lines. */
  | { kind: 'text'; lines: string[] }
  /** A polyomino to be matched against rotations/reflections. */
  | { kind: 'grid'; grid: CellGrid }
  /** Folding steps then punches; the user predicts the unfolded sheet. */
  | { kind: 'paper-folding'; folds: Fold[]; punches: { x: number; y: number }[]; size: number }
  /** A sequence presented one element at a time, then recalled. */
  | { kind: 'span'; sequence: string[]; direction: 'forward' | 'backward' }
  /** Timed target detection: is any target present in the search set? */
  | { kind: 'symbol-search'; targets: Figure[]; search: Figure[] }
  /**
   * A digit↔symbol key, and the digit to look up in it. The key is shown in its own
   * order, which is what makes "read one column off" a mistake the format can diagnose.
   */
  | { kind: 'coding'; pairs: { digit: string; figure: Figure }[]; probe: string }
  /**
   * A stream presented one element at a time, of which the reader counts the elements
   * matching the one `n` places earlier. Transient, like `span`: it carries a
   * `presentation`, and the response controls stay locked until it has played.
   */
  | { kind: 'n-back'; sequence: string[]; n: number }
  /**
   * Figures arriving and leaving, one step at a time; the reader tracks the running total.
   * Each event is a signed count — positive arrives, negative leaves — and the partial sums
   * are never negative, because a room cannot hold fewer than nobody.
   */
  | { kind: 'head-count'; events: number[] }
  /**
   * An arithmetic expression to evaluate, pre-formatted for display. A string rather than a term
   * list because the reader's task is to read exactly what is shown: any reassembly in the view
   * would be a second place where the expression could differ from the one that was solved.
   */
  | { kind: 'expression'; expression: string }
  /**
   * A Stroop stimulus: several copies of one digit, where the task is to report *how many* rather
   * than to read them. The count is the array length rather than a separate field, so the number
   * drawn and the number keyed cannot come apart.
   */
  | { kind: 'interference'; glyphs: string[] }
  /**
   * A trail-making board. `nodes` is in the order they must be clicked, and each position is in the
   * unit box so the renderer owns the pixel geometry. The order is not a secret — the labels state
   * it — so there is nothing to hide by shuffling the array.
   */
  | { kind: 'trail'; nodes: TrailNode[] }
  /**
   * A block-span board: fixed, unlabelled positions, and the order in which they light.
   *
   * `sequence` holds indices into `blocks`, and it is the *stimulus* rather than the answer key —
   * the reader is shown it and then asked to reproduce it, so the same array is both what plays and
   * what is graded against. `blocks` is carried even though every item shares one layout, so an item
   * still describes everything drawn for it and the renderers need no second copy of the geometry.
   */
  | { kind: 'block-span'; blocks: BlockPosition[]; sequence: number[] }
  /**
   * Balance-scale algebra. Each premise is a pair of pans that balance, establishing the
   * shapes' relative weights; `target` is the pan the chosen option must balance.
   */
  | {
      kind: 'figure-weights';
      premises: { left: Figure; right: Figure }[];
      target: Figure;
    }
  /**
   * Two numbers printed at deliberately unrelated sizes, of which the reader picks the one worth
   * more. The conflict is the format: `scale` is how large the numeral is *drawn*, and it is
   * independent of what the numeral says.
   *
   * The candidates live on the stimulus rather than in the options, because "pick the larger" is
   * answerable from an option set that contains both of them — an answer recoverable without the
   * stimulus, which is exactly what Guard 2 forbids. The options name a side instead.
   */
  | { kind: 'high-number'; candidates: { value: number; scale: SizeLevel }[] }
  /**
   * Numbers arriving one at a time, to be added once they are gone. Transient, like `span`: the
   * response controls stay locked until the last term has been and left.
   */
  | { kind: 'math-recall'; terms: number[] }
  /**
   * One or more analogue clock faces. `rotation` is how far the whole face is turned clockwise,
   * which is a property of the drawing rather than of the time: a face at 90° shows the same time
   * it always did, to a reader willing to turn it back.
   */
  | { kind: 'clock'; faces: ClockFace[] }
  /**
   * A hand of rock-paper-scissors, and which way the reader has to answer it. `want` is carried on
   * the stimulus rather than only in the prompt because it changes from item to item — it is the
   * variable half of the task, not a standing instruction.
   */
  | { kind: 'hands'; hand: Hand; want: 'win' | 'lose' };

/** One analogue clock face. `hour` is 1–12 and `minute` is 0–59; `rotation` is degrees clockwise. */
export interface ClockFace {
  hour: number;
  minute: number;
  rotation: number;
}

export const HANDS = ['rock', 'paper', 'scissors'] as const;

export type Hand = (typeof HANDS)[number];

/** One target on a trail-making board. Centre position in the unit box, both in [0, 1]. */
export interface TrailNode {
  label: string;
  x: number;
  y: number;
}

/**
 * One block on a block-span board. Centre position in the unit box, both in [0, 1].
 *
 * Deliberately not a `TrailNode` without its label: a block has no label, and that absence is the
 * format. A trail states its own order on the targets; a block-span board states nothing, which is
 * why one is a search task and the other a memory task.
 */
export interface BlockPosition {
  x: number;
  y: number;
}

export type Fold = 'left' | 'right' | 'top' | 'bottom';

// ---------------------------------------------------------------------------
// Options — what the user picks between.
// ---------------------------------------------------------------------------

export type Option =
  | { kind: 'figure'; figure: Figure }
  | { kind: 'text'; text: string }
  /** `variant` picks the drawing style: filled blocks, or a sheet with punched holes. */
  | { kind: 'grid'; grid: CellGrid; variant?: 'solid' | 'holes' };

/**
 * Why a distractor is wrong, drawn from the Wang & Su error-type taxonomy
 * (docs/IQ-TESTS.md §5.1). Lets the review screen name the mistake the user made
 * rather than only saying "incorrect".
 */
export type ErrorType =
  | 'correct'
  | 'wrong-rule' // a different rule applied to the right attribute
  | 'wrong-axis' // the right rule applied column-wise instead of row-wise
  | 'off-by-one' // the right rule, miscounted by one step
  | 'copy' // simply repeats a visible cell
  | 'wrong-attribute' // the rule applied to the wrong attribute
  | 'mirror' // a reflection where a rotation was required
  /*
   * The right quantity applied the opposite way: a subtraction added, a departure counted as
   * an arrival. Distinct from `wrong-axis`, which is a confusion about *where* to read, and
   * from `off-by-one`, which is the right direction miscounted. Added for the running-count
   * formats, where reversing one step is the commonest single mistake.
   */
  | 'wrong-direction'
  /*
   * The units digit right and a higher place wrong — the carry slip. Named rather than lumped in
   * with `plausible` because it is the characteristic arithmetic error, and because the distractor
   * that expresses it is load-bearing: it is what stops an item being answerable by computing a
   * single digit.
   */
  | 'carry'
  /*
   * Every element recalled, in the wrong order — the classic serial-recall transposition. Named
   * because it is the one diagnosis a span task can offer that an accuracy figure cannot: it
   * separates "you did not encode the items" from "you encoded them and lost their order", which
   * are different failures with different remedies. Only reachable from the `tap` response mode,
   * where the response is a sequence and can therefore be compared as one.
   */
  | 'transposition'
  | 'plausible'; // a generic near-miss with no single diagnosis

export interface Explanation {
  /** One-sentence answer, e.g. "The next term is 26." */
  summary: string;
  /** The full rule set, one line per rule, shown after answering. */
  rules: string[];
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

/**
 * How the user responds. Recall formats (digit span) must not be turned into recognition
 * formats just to fit a multiple-choice model — that would measure a different construct —
 * so text entry is a first-class response mode.
 */
/**
 * `trail` is a third kind of response, and a different shape from the other two: not one decision
 * but a *sequence* of clicks that is timed as a unit. There is no option list and no expected
 * string — the item completes when the last target is reached, and what it records is how long that
 * took and how many clicks went astray.
 *
 * `tap` is also a sequence of clicks, and it is deliberately *not* the same mode. A trail is graded
 * on time because there is no wrong answer to give: the order is written on the targets. A tap is
 * graded on whether the sequence matches, because the order was shown once and then taken away.
 * That difference decides everything downstream — a trail must not end on a mistake, a tap must not
 * be corrected towards the right answer, and only one of the two has anything to diagnose.
 *
 * It reuses `answerText` and `chosenText` rather than inventing a parallel pair of fields, because
 * a tapped sequence really is a short string ("48213", one character per target) and comparing it is
 * exactly the comparison `text` already does. What differs is how the string is *collected*, which
 * is a fact about the response surface, not about the grading.
 */
export type ResponseMode = 'choice' | 'text' | 'trail' | 'tap';

/**
 * A stimulus shown only briefly before the response is collected, for formats where the
 * memory load *is* the construct.
 */
export interface Presentation {
  /** Milliseconds each element is shown. */
  stepMs: number;
  /** Milliseconds of blank between elements. */
  gapMs: number;
}

export interface Item {
  type: ItemTypeId;
  /** Reproduces this exact item via `generateItem(type, seed, difficulty)`. */
  seed: string;
  difficulty: Difficulty;
  prompt: string;
  stimulus: Stimulus;
  responseMode: ResponseMode;
  /** Empty for every mode but `choice`. */
  options: Option[];
  /** Index into `options`; `-1` for every mode but `choice`. Derived by construction. */
  answerIndex: number;
  /** The expected string for `text` and `tap`. Compared case-insensitively. */
  answerText?: string;
  /** Parallel to `options`; `errorTypes[answerIndex]` is always `'correct'`. */
  errorTypes: ErrorType[];
  explanation: Explanation;
  /** Suggested seconds for this item, used by timed tests. */
  suggestedSeconds: number;
  /** Present when the stimulus must be shown transiently rather than left on screen. */
  presentation?: Presentation;
}

/**
 * Language-neutral facts about an item type. The human-readable name, blurb, description
 * and "seen in" list live in the locale dictionaries, not here — otherwise every generator
 * would have to carry a copy of each translation.
 */
export interface ItemTypeMeta {
  id: ItemTypeId;
  domain: ChcDomain;
  /** Glyph used as a lightweight visual key. Language-neutral. */
  icon: string;
  /**
   * Whether this format may appear in a sprint — the continuous timed block, where items come
   * one after another under a single running clock.
   *
   * Required rather than optional, so that adding a format forces an answer instead of
   * inheriting a default. The test is narrow: **is one item of this format answerable in a
   * couple of seconds?** A sprint is a measure of sustained output, and a format whose items
   * take twenty seconds turns a sixty-second block into three items — which measures nothing
   * that the untimed loop does not measure better.
   *
   * A format carrying a `presentation` can never be sprintable: it has to play itself before it
   * can be answered, so most of the block would be spent watching. `tests/generators.test.ts`
   * asserts that.
   */
  sprintable: boolean;
}

export interface Generator {
  meta: ItemTypeMeta;
  /**
   * Must be pure: the same (seed, difficulty, locale) always yields a deep-equal Item.
   * Must guarantee exactly one defensible answer (docs/GENERATABILITY.md §4).
   *
   * `locale` must affect ONLY the text. It must never be read before or between RNG
   * draws, so that a seed produces structurally identical items in every language.
   */
  generate(seed: string, difficulty: Difficulty, locale: Locale): Item;
}

// ---------------------------------------------------------------------------
// Sessions & results — the persisted shape.
// ---------------------------------------------------------------------------

export interface Response {
  type: ItemTypeId;
  seed: string;
  difficulty: Difficulty;
  /** Index the user chose, or `null` if they skipped, timed out, or typed an answer. */
  chosenIndex: number | null;
  /**
   * What the user typed, for a `text` item — or the sequence they tapped, for a `tap` one.
   *
   * One field for both, because both are the same kind of evidence: the response itself rather
   * than a reference to one of a fixed set of options. A tapped sequence is stored as the target
   * numbers in the order they were touched, which is what makes a wrong answer reviewable at all.
   */
  chosenText?: string;
  answerIndex: number;
  correct: boolean;
  /** Milliseconds from item shown to answer submitted. */
  latencyMs: number;
  /**
   * The diagnosis for the option actually chosen, i.e. `item.errorTypes[chosenIndex]`.
   *
   * Stored rather than re-derived because it is the one thing about a response that the
   * seed cannot cheaply give back: recovering it would mean regenerating every item in
   * every session just to read one array element. Optional, so histories written before
   * the taxonomy was surfaced still load.
   */
  errorType?: ErrorType;
}

/**
 * `sprint` is the continuous timed block: many fast items under one running clock, ending when
 * the clock does rather than after a fixed count. It is a genuinely different measurement
 * regime from the other two, not a setting on them — see `summarise` in `scoring.ts` for why
 * that distinction has to be enforced rather than merely noted.
 */
export type SessionMode = 'practice' | 'test' | 'sprint';

export interface Session {
  id: string;
  mode: SessionMode;
  /** Session seed; each item's seed is derived from it. */
  seed: string;
  /** Item types included, in order of presentation for a test. */
  types: ItemTypeId[];
  startedAt: number;
  finishedAt: number | null;
  responses: Response[];
  /**
   * How long the block was *meant* to last, for sprints only.
   *
   * Recorded rather than derived from `finishedAt - startedAt`, because a score of "18 correct"
   * is meaningless without the window it was scored in, and the elapsed time is not that
   * window: it includes the moment before the first item painted and stops wherever the last
   * response landed. Two sprints are only comparable if their planned windows match.
   */
  plannedMs?: number;
  /**
   * The generator generation this session was played at — `ITEM_VERSION` at the time it started.
   *
   * A response stores a seed, not an item, so anything re-derived from the item later is re-derived
   * from today's generators. This records which ones the reader actually saw. Optional, because
   * sessions written before the stamp existed cannot have it; those are treated as unknown, which
   * is to say not re-derivable.
   */
  itemVersion?: number;
}

