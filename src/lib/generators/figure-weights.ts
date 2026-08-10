/**
 * Figure weights — balance-scale algebra.
 *
 * Premise scales establish what balances what; the last scale is missing the contents of one
 * pan, and the reader picks the group that balances it. A WAIS-IV Fluid Reasoning subtest,
 * and the closest this site comes to *quantitative* reasoning: the shapes are values and the
 * scales are equations, but nothing is written as arithmetic, so the item measures the
 * reasoning rather than the notation (`GENERATABILITY.md` §2 row 13).
 *
 * ## Why this one is provably unambiguous
 *
 * Most figural formats need care to have a single defensible answer. This one is decidable.
 * The premises assign every shape a weight, so each candidate group has *a number*, and
 * "balances" means "equal to the target's number". So the generator does not assert
 * uniqueness — it enumerates every group the vocabulary can express, computes the weight of
 * each, and refuses the item unless exactly one option matches. See `MAX_PER_PAN`.
 *
 * Two properties are enforced beyond that, and both are about the premises rather than the
 * answer:
 *
 * - **Every weight must be derivable.** Shapes are introduced in a chain — the first weighs
 *   one unit, and each later one is defined as a multiple of a shape already established. A
 *   shape whose weight the premises never pin down would make the item unanswerable however
 *   well-formed it looked.
 * - **The scales must be read as weights, not as counts.** One distractor always has the
 *   same *number* of objects as the answer and a different weight, so "I matched the piece
 *   count" is diagnosed as `wrong-attribute` rather than disappearing into `plausible`. It is
 *   the single commonest way to misread a balance.
 */
import { createRng, type Rng } from '../rng';
import { dict, type Locale } from '../i18n';
import { slotsFor } from '../geometry';
import type {
  Difficulty,
  ErrorType,
  Figure,
  Generator,
  Item,
  ItemTypeMeta,
  Option,
  ShapeType,
  SizeLevel,
} from '../types';

/**
 * Shapes distinct enough to be told apart while being counted.
 *
 * A deliberately small vocabulary: the reader has to hold "circle is one, square is three" in
 * mind, and every extra shape is another fact to carry that has nothing to do with the
 * reasoning being measured.
 */
const VOCABULARY: ShapeType[] = ['circle', 'square', 'triangle', 'hexagon', 'star'];

/**
 * Objects a pan can hold.
 *
 * Four, because a pan is drawn as a `grid2x2` figure and that is how many slots it has. It is
 * also about the limit of what reads as a quantity without being counted one by one.
 */
const MAX_PER_PAN = 4;

/** A multiset of shapes: how many of each, indexed against the item's shape list. */
type Group = number[];

interface Weights {
  shapes: ShapeType[];
  /** Weight of each shape, in units of the first. Parallel to `shapes`. */
  units: number[];
  /** `[heavier, lighter, ratio]` — ratio copies of `lighter` balance one `heavier`. */
  premises: [number, number, number][];
}

interface Plan {
  /** How many shapes the vocabulary of this item uses. */
  shapes: number;
  /** Multiplier range between a new shape and the one it is defined against. */
  ratio: [min: number, max: number];
  /** Objects in the target pan the reader has to match. */
  targetSize: [min: number, max: number];
}

/**
 * Options per item, the same at every difficulty.
 *
 * Constant on purpose. Varying it by level would change the guessing baseline between levels —
 * so a "harder" item with fewer options can be *easier* to get right by chance, and the
 * adaptive ladder would be reading partly its own option count. It also breaks the
 * answer-position sweep in tests/generators.test.ts, which is what caught it.
 */
const OPTION_COUNT = 4;

function planFor(difficulty: Difficulty): Plan {
  switch (difficulty) {
    case 1:
      return { shapes: 2, ratio: [2, 2], targetSize: [2, 2] };
    case 2:
      return { shapes: 2, ratio: [2, 3], targetSize: [2, 2] };
    case 3:
      return { shapes: 3, ratio: [2, 3], targetSize: [1, 2] };
    case 4:
      return { shapes: 3, ratio: [2, 3], targetSize: [2, 3] };
    case 5:
      return { shapes: 4, ratio: [2, 3], targetSize: [2, 3] };
  }
}

/**
 * A weight system and the premises that establish it.
 *
 * The chain construction is what guarantees derivability: shape 0 is the unit, and shape `i`
 * is always defined against some shape already in the chain, so reading the premises in order
 * determines every weight. Building the premises *from* the weights, rather than checking
 * afterwards that some set of premises happens to determine them, is what makes this
 * a property of the construction rather than a hope.
 */
function buildWeights(plan: Plan, rng: Rng): Weights {
  const shapes = rng.shuffle(VOCABULARY).slice(0, plan.shapes);
  const units = [1];
  const premises: [number, number, number][] = [];

  for (let i = 1; i < shapes.length; i++) {
    const against = rng.int(0, i - 1);
    const ratio = rng.int(plan.ratio[0], plan.ratio[1]);
    units.push(units[against]! * ratio);
    premises.push([i, against, ratio]);
  }
  return { shapes, units, premises };
}

/** Every group of 1..MAX_PER_PAN objects over `count` shapes. */
function allGroups(count: number): Group[] {
  const out: Group[] = [];
  const walk = (index: number, left: number, current: Group) => {
    if (index === count) {
      if (current.some((n) => n > 0)) out.push([...current]);
      return;
    }
    for (let n = 0; n <= left; n++) {
      walk(index + 1, left - n, [...current, n]);
    }
  };
  walk(0, MAX_PER_PAN, []);
  return out;
}

function weightOf(group: Group, units: number[]): number {
  return group.reduce((sum, n, i) => sum + n * units[i]!, 0);
}

function sizeOf(group: Group): number {
  return group.reduce((sum, n) => sum + n, 0);
}

function groupKey(group: Group): string {
  return group.join(',');
}

/** A pan, drawn as a `grid2x2` figure so the existing figure renderer draws it unchanged. */
function toFigure(group: Group, shapes: ShapeType[]): Figure {
  const slots = slotsFor('grid2x2');
  const items: ShapeType[] = [];
  group.forEach((n, i) => {
    for (let k = 0; k < n; k++) items.push(shapes[i]!);
  });
  return {
    layout: 'grid2x2',
    shapes: items.map((type, i) => ({
      type,
      // Uniform: size is a weight cue the reader has not been given, so varying it would
      // be a lie about the item. Every object of every shape is drawn the same size.
      size: 3 as SizeLevel,
      color: 0,
      rotation: 0,
      x: slots[i]!.x,
      y: slots[i]!.y,
    })),
  };
}

const meta: ItemTypeMeta = {
  id: 'figure-weights',
  domain: 'Gf',
  icon: '⚖',
  sprintable: false,
};

const MAX_ATTEMPTS = 200;

function generate(seed: string, difficulty: Difficulty, locale: Locale): Item {
  const t = dict(locale).gen.figureWeights;
  const rng = createRng(`figure-weights:${seed}:${difficulty}`);
  const plan = planFor(difficulty);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { shapes, units, premises } = buildWeights(plan, rng);
    const groups = allGroups(shapes.length);

    // The pan the reader has to match.
    const targets = groups.filter((g) => {
      const size = sizeOf(g);
      return size >= plan.targetSize[0] && size <= plan.targetSize[1];
    });
    if (targets.length === 0) continue;
    const target = rng.pick(targets);
    const goal = weightOf(target, units);

    /*
     * Candidate answers: a *different* arrangement of the same weight. Excluding the target
     * itself matters — "the same pan again" is trivially balanced and teaches nothing about
     * reading the premises.
     */
    const balancing = groups.filter(
      (g) => weightOf(g, units) === goal && groupKey(g) !== groupKey(target),
    );
    if (balancing.length === 0) continue;

    /*
     * Prefer an answer that is not simply one of the premise pans copied out.
     *
     * With a single-object target, the only group of the right weight is often the other pan
     * of the premise that defines that object — so the item reduces to "find the matching
     * picture", and reads the premises as images rather than as equations. It is still a
     * legitimate (very easy) item, so it is a preference and not a rejection: some weight
     * systems admit nothing else, and refusing those would thin the item space for no gain.
     */
    const premisePans = new Set(
      premises.flatMap(([heavier, lighter, ratio]) => [
        groupKey(unit(shapes.length, heavier, 1)),
        groupKey(unit(shapes.length, lighter, ratio)),
      ]),
    );
    const fresh = balancing.filter((g) => !premisePans.has(groupKey(g)));
    const answer = rng.pick(fresh.length > 0 ? fresh : balancing);

    /*
     * Distractors, in order of how diagnostic they are:
     *
     * 1. Same object count as the answer, different weight — the count-not-weight misread.
     * 2. One unit heavier or lighter than the goal — an arithmetic slip.
     * 3. Anything else of the wrong weight, to fill the grid.
     *
     * `balancing` is excluded wholesale rather than just the chosen answer: any other group
     * of the correct weight is *also* a defensible answer, and two right answers is the
     * ambiguity this whole format is supposed to be free of.
     */
    const balancingKeys = new Set(balancing.map(groupKey));
    balancingKeys.add(groupKey(target));
    const usable = groups.filter((g) => !balancingKeys.has(groupKey(g)));

    const answerSize = sizeOf(answer);
    const sameCount = rng.shuffle(usable.filter((g) => sizeOf(g) === answerSize));
    const offByOne = rng.shuffle(
      usable.filter((g) => Math.abs(weightOf(g, units) - goal) === 1 && sizeOf(g) !== answerSize),
    );
    const rest = rng.shuffle(usable);

    const distractors: Group[] = [];
    const taken = new Set<string>();
    for (const pool of [sameCount.slice(0, 1), offByOne, rest]) {
      for (const g of pool) {
        if (distractors.length >= OPTION_COUNT - 1) break;
        if (taken.has(groupKey(g))) continue;
        taken.add(groupKey(g));
        distractors.push(g);
      }
    }
    if (distractors.length < OPTION_COUNT - 1) continue;

    const picks = rng.shuffle([answer, ...distractors]);
    const answerIndex = picks.findIndex((g) => groupKey(g) === groupKey(answer));

    /*
     * The independent check. Every option is weighed, and the item is thrown away unless
     * exactly one of them balances. This is what makes the format decidable rather than
     * merely carefully built — see the module comment.
     */
    const balanced = picks.filter((g) => weightOf(g, units) === goal);
    if (balanced.length !== 1) continue;
    if (groupKey(balanced[0]!) !== groupKey(answer)) continue;

    const errorTypes: ErrorType[] = picks.map((g) => {
      if (groupKey(g) === groupKey(answer)) return 'correct';
      if (sizeOf(g) === answerSize) return 'wrong-attribute';
      if (Math.abs(weightOf(g, units) - goal) === 1) return 'off-by-one';
      return 'plausible';
    });

    const name = (i: number) => dict(locale).quiz.shapeNames[shapes[i]!];

    return {
      type: 'figure-weights',
      seed,
      difficulty,
      prompt: t.prompt,
      stimulus: {
        kind: 'figure-weights',
        premises: premises.map(([heavier, lighter, ratio]) => ({
          left: toFigure(unit(shapes.length, heavier, 1), shapes),
          right: toFigure(unit(shapes.length, lighter, ratio), shapes),
        })),
        target: toFigure(target, shapes),
      },
      responseMode: 'choice',
      options: picks.map<Option>((g) => ({ kind: 'figure', figure: toFigure(g, shapes) })),
      answerIndex,
      errorTypes,
      explanation: {
        summary: t.summary(describe(answer, shapes, locale)),
        rules: [
          ...premises.map(([heavier, lighter, ratio]) =>
            t.rulePremise(name(heavier), ratio, name(lighter)),
          ),
          t.ruleTarget(describe(target, shapes, locale), goal),
          t.ruleCount,
        ],
      },
      suggestedSeconds: 20 + plan.shapes * 8,
    };
  }

  throw new Error(
    `figure-weights generator exhausted ${MAX_ATTEMPTS} attempts for seed "${seed}" d${difficulty}`,
  );
}

/** A group holding `n` copies of one shape and nothing else. */
function unit(size: number, index: number, n: number): Group {
  const group = new Array(size).fill(0);
  group[index] = n;
  return group;
}

/** "two circles and one square", for the explanation. */
function describe(group: Group, shapes: ShapeType[], locale: Locale): string {
  const d = dict(locale);
  const parts = group.flatMap((n, i) =>
    n > 0 ? [d.gen.figureWeights.quantity(n, d.quiz.shapeNames[shapes[i]!])] : [],
  );
  return d.gen.figureWeights.join(parts);
}

export const figureWeightsGenerator: Generator = { meta, generate };
