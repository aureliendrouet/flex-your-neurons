/**
 * Matrix reasoning — a 3x3 grid of figures with the bottom-right cell missing.
 * The canonical Gf / culture-reduced format (Raven's Progressive Matrices).
 *
 * Implements the RAVEN attribute/rule scheme (docs/IQ-TESTS.md §5.1) with two guards
 * from docs/GENERATABILITY.md §4:
 *   Guard 1 — an independent solver proves exactly one answer is defensible;
 *   Guard 2 — the option set is an attribute-balanced cube, so the answer cannot be
 *             recovered from the options alone (the I-RAVEN fix for RAVEN's mode leak).
 */
import type { Rng } from '../rng';
import { createRng } from '../rng';
import {
  generateMatrix,
  ruleLabel,
  solveAttribute,
  type Matrix3,
  type Rule,
  type RuleName,
} from '../rules';
import { slotsFor } from '../geometry';
import { dict } from '../i18n';
import type { Locale } from '../i18n';
import type {
  ColorLevel,
  Difficulty,
  ErrorType,
  Figure,
  Generator,
  Item,
  ItemTypeMeta,
  Option,
  Shape,
  ShapeType,
  SizeLevel,
  SlotLayout,
} from '../types';

/**
 * Shape vocabulary for matrices. `type` is a *nominal* attribute, so it only ever takes
 * Constant or Distribute-Three — an ordinal rule like Progression over shape identity
 * would have no principled "next value".
 */
const MATRIX_SHAPES: ShapeType[] = ['triangle', 'square', 'pentagon', 'hexagon', 'circle', 'star'];

type Attr = 'number' | 'position' | 'type' | 'size' | 'color';

/**
 * The attributes whose values lie on a scale, so that "one step off" names a real mistake.
 *
 * `type` and `position` are nominal — the shape after a hexagon is only "after" it in the order this
 * file happens to declare, and a reader has no access to that order.
 */
const ORDINAL_ATTRS: Attr[] = ['number', 'size', 'color'];

const ALLOWED_RULES: Record<Attr, RuleName[]> = {
  number: ['constant', 'progression', 'arithmetic', 'distribute-three'],
  position: ['constant', 'distribute-three'],
  type: ['constant', 'distribute-three'],
  size: ['constant', 'progression', 'arithmetic', 'distribute-three'],
  color: ['constant', 'progression', 'arithmetic', 'distribute-three'],
};

interface Plan {
  layout: SlotLayout;
  /** Attribute count under a non-trivial rule. */
  ruledCount: number;
  /** Rules the generator may draw from at this difficulty. */
  ruleWeights: RuleName[];
}

/*
 * `constant` is not among the rules any level may draw as its *only* rule.
 *
 * An item whose single ruled attribute is "stays the same across the row", with every unruled
 * attribute globally fixed, is a cell identical to the two beside it — and 70% of difficulty 1 was
 * exactly that. It is a matching task wearing a matrix's clothes: nothing is inferred, the answer is
 * recognised. The easiest rung should be the easiest *inference*, which is a single progression.
 */
function planFor(difficulty: Difficulty): Plan {
  switch (difficulty) {
    case 1:
      return { layout: 'center', ruledCount: 1, ruleWeights: ['progression'] };
    case 2:
      return { layout: 'center', ruledCount: 2, ruleWeights: ['progression', 'distribute-three', 'constant'] };
    case 3:
      return { layout: 'grid2x2', ruledCount: 2, ruleWeights: ['progression', 'distribute-three', 'arithmetic'] };
    case 4:
      return { layout: 'grid2x2', ruledCount: 3, ruleWeights: ['progression', 'distribute-three', 'arithmetic', 'arithmetic'] };
    case 5:
      return { layout: 'grid3x3', ruledCount: 3, ruleWeights: ['distribute-three', 'arithmetic', 'arithmetic', 'progression'] };
  }
}

interface Domain {
  min: number;
  max: number;
}

function domainFor(attr: Attr, layout: SlotLayout): Domain {
  const slotCount = slotsFor(layout).length;
  switch (attr) {
    case 'number':
      return { min: 1, max: layout === 'grid3x3' ? 6 : slotCount };
    case 'position':
      return { min: 0, max: slotCount - 1 };
    case 'type':
      return { min: 0, max: MATRIX_SHAPES.length - 1 };
    case 'size':
      return { min: 1, max: 5 };
    case 'color':
      return { min: 0, max: 5 };
  }
}

/** All five attribute values for one cell. */
type CellAttrs = Record<Attr, number>;

function buildFigure(a: CellAttrs, layout: SlotLayout): Figure {
  const slots = slotsFor(layout);
  const count = layout === 'center' ? 1 : clamp(a.number, 1, slots.length);
  const offset = layout === 'center' ? 0 : mod(a.position, slots.length);
  const shapes: Shape[] = [];
  for (let i = 0; i < count; i++) {
    const slot = slots[(offset + i) % slots.length]!;
    shapes.push({
      type: MATRIX_SHAPES[mod(a.type, MATRIX_SHAPES.length)]!,
      size: clamp(a.size, 1, 5) as SizeLevel,
      color: clamp(a.color, 0, 5) as ColorLevel,
      rotation: 0,
      x: slot.x,
      y: slot.y,
    });
  }
  return { layout, shapes };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function mod(v: number, n: number): number {
  return ((v % n) + n) % n;
}

const ATTR_ORDER: Attr[] = ['number', 'position', 'type', 'size', 'color'];

function attrPool(layout: SlotLayout, rng: Rng): Attr[] {
  /*
   * `size` is dropped on the densest layout. Nine slots in one cell leave so little room
   * that adjacent size levels differ by a couple of pixels — asking the reader to infer a
   * Progression from that is a test of eyesight, not of reasoning. Type, shading and
   * count stay perfectly legible at that scale, and there are enough of them.
   */
  const base: Attr[] =
    layout === 'grid3x3' ? ['type', 'color'] : ['type', 'size', 'color'];
  if (layout === 'center') return base;
  // number and position both control slot occupancy, so only one may carry a rule;
  // letting both vary makes the figure unreadable and the rules mutually confounded.
  return [...base, rng.bool() ? 'number' : 'position'];
}

interface Built {
  values: Record<Attr, number[][]>;
  rules: Partial<Record<Attr, Rule>>;
  ruled: Attr[];
}

function attemptBuild(rng: Rng, plan: Plan): Built | null {
  const { layout } = plan;
  const pool = attrPool(layout, rng);
  const ruled = rng.sample(pool, Math.min(plan.ruledCount, pool.length));

  const values = {} as Record<Attr, number[][]>;
  const rules: Partial<Record<Attr, Rule>> = {};

  for (const attr of ATTR_ORDER) {
    const dom = domainFor(attr, layout);

    if (!ruled.includes(attr)) {
      // Unruled attributes are globally constant: they contribute no signal, and the
      // solver will trivially (and uniquely) predict the constant.
      const v = attr === 'number' && layout !== 'center'
        ? rng.int(1, Math.min(3, dom.max))
        : rng.int(dom.min, dom.max);
      values[attr] = [[v, v, v], [v, v, v], [v, v, v]];
      continue;
    }

    const allowed = plan.ruleWeights.filter((r) => ALLOWED_RULES[attr].includes(r));
    const names = allowed.length > 0 ? allowed : ALLOWED_RULES[attr];
    const name = rng.pick(names);
    const rule = instantiate(name, rng);
    const m: Matrix3 | null = generateMatrix(rule, dom.min, dom.max, rng);
    if (m === null) return null; // domain too narrow for this rule — caller retries
    values[attr] = m as unknown as number[][];
    rules[attr] = rule;
  }

  return { values, rules, ruled };
}

function instantiate(name: RuleName, rng: Rng): Rule {
  switch (name) {
    case 'progression':
      return { name, param: rng.pick([-2, -1, 1, 2]) };
    case 'arithmetic':
      return { name, param: rng.pick([1, -1]) };
    case 'distribute-three':
      return { name, param: rng.pick([1, -1]) };
    case 'constant':
      return { name, param: 0 };
  }
}

/**
 * Guard 1. Runs the solver over every attribute without being told which rules were used.
 * Returns the unique predicted cell, or `null` if any attribute is under-determined.
 */
function solveAll(values: Record<Attr, number[][]>): CellAttrs | null {
  const out = {} as CellAttrs;
  for (const attr of ATTR_ORDER) {
    const m = values[attr]!;
    const { predictions } = solveAttribute({
      rows: [
        [...m[0]!],
        [...m[1]!],
        [m[2]![0]!, m[2]![1]!],
      ],
    });
    if (predictions.length !== 1) return null; // ambiguous — two rules disagree
    out[attr] = predictions[0]!;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Guard 2 — attribute-balanced distractors
// ---------------------------------------------------------------------------

interface Perturbation {
  attr: Attr;
  alternate: number;
  errorType: ErrorType;
}

/**
 * Picks a plausible wrong value for `attr`, preferring values a real reasoning mistake
 * would produce (Wang & Su error types) over an arbitrary perturbation.
 */
function perturbationFor(
  attr: Attr,
  answer: CellAttrs,
  values: Record<Attr, number[][]>,
  ruled: Attr[],
  layout: SlotLayout,
  rng: Rng,
): Perturbation | null {
  const dom = domainFor(attr, layout);
  const correct = answer[attr];
  const m = values[attr]!;

  const candidates: { value: number; errorType: ErrorType }[] = [];

  if (ruled.includes(attr)) {
    // Applying the row rule down the column instead — the single commonest error.
    const colObs = {
      rows: [
        [m[0]![0]!, m[1]![0]!, m[2]![0]!],
        [m[0]![1]!, m[1]![1]!, m[2]![1]!],
        [m[0]![2]!, m[1]![2]!],
      ] as [number[], number[], number[]],
    };
    for (const p of solveAttribute(colObs).predictions) {
      candidates.push({ value: p, errorType: 'wrong-axis' });
    }
    /*
     * The rule applied but miscounted by one step — in a drawn direction.
     *
     * The order of these two lines was, for a long time, the largest defect on the site. `correct+1`
     * came first and the candidates ahead of it almost never survived, so whenever an attribute was
     * perturbed the distractor took the value *above* the answer. Across a whole option set that
     * made the answer reliably the smaller, paler, sparser figure: a solver shown only the eight
     * candidates and told to pick the one minimal on every varying attribute scored 39% against a
     * 12.5% chance baseline, and 56% at difficulty 5.
     *
     * Nothing about the diagnosis wanted that order. Miscounting is as easily short as long, and
     * `off-by-one` describes both.
     */
    const step = rng.bool() ? 1 : -1;
    /*
     * "One step too far" is only a description of a mistake on an attribute that *has* steps.
     * `type` and `position` are nominal: their values index a list of shapes and a list of slot
     * arrangements, and neighbouring entries are neighbours only in the source. Labelling those
     * `off-by-one` told 42% of the readers who saw that diagnosis to "count the steps rather than
     * eyeballing the end point" about a quantity with no steps to count — advice for a mistake they
     * could not have made.
     */
    const miscount: ErrorType = ORDINAL_ATTRS.includes(attr) ? 'off-by-one' : 'wrong-rule';
    candidates.push({ value: correct + step, errorType: miscount });
    candidates.push({ value: correct - step, errorType: miscount });
    // Simply repeating the cell to the left.
    candidates.push({ value: m[2]![1]!, errorType: 'copy' });
    candidates.push({ value: m[1]![2]!, errorType: 'copy' });
  }

  // Fallback: any other legal value for this attribute.
  for (const v of rng.shuffle(rangeInclusive(dom.min, dom.max))) {
    candidates.push({ value: v, errorType: ruled.includes(attr) ? 'wrong-rule' : 'wrong-attribute' });
  }

  for (const c of candidates) {
    if (c.value === correct) continue;
    if (c.value < dom.min || c.value > dom.max) continue;
    return { attr, alternate: c.value, errorType: c.errorType };
  }
  return null;
}

function rangeInclusive(min: number, max: number): number[] {
  const out: number[] = [];
  for (let i = min; i <= max; i++) out.push(i);
  return out;
}

interface Candidate {
  attrs: CellAttrs;
  /** Attributes that differ from the correct answer. */
  differs: Attr[];
  errorTypes: ErrorType[];
}

/**
 * Builds exactly 8 candidates as the corners of a 3-attribute cube around the answer.
 *
 * This is the leakage fix: because each of the 3 chosen attributes is perturbed in
 * exactly half the candidates, every attribute value appears in 4 of 8 options. The
 * correct answer is therefore never the attribute-wise mode, and no single-attribute
 * statistic over the option set identifies it — the exact flaw I-RAVEN found in RAVEN.
 */
function buildCandidates(
  answer: CellAttrs,
  values: Record<Attr, number[][]>,
  ruled: Attr[],
  layout: SlotLayout,
  rng: Rng,
): Candidate[] | null {
  // Prefer perturbing rule-bearing attributes: those distractors are genuinely tempting.
  const ordered = [...ruled, ...ATTR_ORDER.filter((a) => !ruled.includes(a))];
  const usable = layout === 'center'
    ? ordered.filter((a) => a !== 'number' && a !== 'position')
    : ordered;

  const answerKey = figureKey(buildFigure(answer, layout));
  const perturbations: Perturbation[] = [];
  for (const attr of usable) {
    if (perturbations.length === 3) break;
    const p = perturbationFor(attr, answer, values, ruled, layout, rng);
    if (!p) continue;
    // The flip must actually change the drawing. It sometimes does not — flipping
    // `position` is invisible when `number` already fills every slot.
    const flipped = figureKey(buildFigure({ ...answer, [p.attr]: p.alternate }, layout));
    if (flipped === answerKey) continue;
    perturbations.push(p);
  }
  if (perturbations.length < 3) return null;

  let candidates: Candidate[] = [{ attrs: { ...answer }, differs: [], errorTypes: [] }];
  for (const p of perturbations) {
    const mirrored = candidates.map((c) => ({
      attrs: { ...c.attrs, [p.attr]: p.alternate },
      differs: [...c.differs, p.attr],
      errorTypes: [...c.errorTypes, p.errorType],
    }));
    candidates = [...candidates, ...mirrored];
  }

  // A cube of 3 binary flips has 8 corners. They are distinct in attribute space by
  // construction, but attributes can interact, so distinctness is re-checked as drawn.
  if (candidates.length !== 8) return null;
  if (new Set(candidates.map((c) => attrKey(c.attrs))).size !== 8) return null;
  if (new Set(candidates.map((c) => figureKey(buildFigure(c.attrs, layout)))).size !== 8) {
    return null;
  }

  return rng.shuffle(candidates);
}

function attrKey(a: CellAttrs): string {
  return ATTR_ORDER.map((k) => a[k]).join('|');
}

/**
 * Identity of a figure *as drawn*. Distinctness must be checked here, not in attribute
 * space: `buildFigure` is lossy, so two different attribute tuples can render identically
 * (e.g. on a 2x2 layout with number = 4, every position offset fills all four slots).
 */
function figureKey(f: Figure): string {
  return (
    f.layout +
    '|' +
    f.shapes
      .map((s) => `${s.type},${s.size},${s.color},${s.x},${s.y}`)
      .sort()
      .join(';')
  );
}

function errorTypeOf(c: Candidate): ErrorType {
  if (c.differs.length === 0) return 'correct';
  if (c.differs.length === 1) return c.errorTypes[0]!;
  return 'plausible';
}

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

const meta: ItemTypeMeta = {
  id: 'matrix',
  domain: 'Gf',
  icon: '▦',
  sprintable: false,
};

const MAX_ATTEMPTS = 60;

function generate(seed: string, difficulty: Difficulty, locale: Locale): Item {
  const d = dict(locale);
  // Note the RNG seed does NOT include the locale: the same seed must yield the same
  // figures in every language, only described with different words.
  const rng = createRng(`matrix:${seed}:${difficulty}`);
  const plan = planFor(difficulty);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const built = attemptBuild(rng, plan);
    if (!built) continue;

    const answer = solveAll(built.values);
    if (!answer) continue; // Guard 1 rejected it: two rules disagree

    // The solver's prediction must match what the generator intended. If it does not,
    // the item is ill-formed regardless of uniqueness.
    const intended = {} as Record<Attr, number>;
    for (const attr of ATTR_ORDER) intended[attr] = built.values[attr]![2]![2]!;
    if (attrKey(answer) !== attrKey(intended as CellAttrs)) continue;

    const candidates = buildCandidates(answer, built.values, built.ruled, plan.layout, rng);
    if (!candidates) continue;

    const cells: (Figure | null)[] = [];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        if (r === 2 && c === 2) {
          cells.push(null);
          continue;
        }
        const a = {} as CellAttrs;
        for (const attr of ATTR_ORDER) a[attr] = built.values[attr]![r]![c]!;
        cells.push(buildFigure(a, plan.layout));
      }
    }

    const options: Option[] = candidates.map((c) => ({
      kind: 'figure',
      figure: buildFigure(c.attrs, plan.layout),
    }));
    const answerIndex = candidates.findIndex((c) => c.differs.length === 0);

    const rules = built.ruled
      .filter((a) => built.rules[a])
      .map((a) => ruleLabel(built.rules[a]!, d.gen.matrixAttr[a], locale));
    for (const attr of ATTR_ORDER) {
      if (built.ruled.includes(attr)) continue;
      if (attr === 'position') continue;
      if (attr === 'number' && plan.layout === 'center') continue;
      rules.push(d.gen.rules.sameEverywhere(d.gen.matrixAttr[attr]));
    }

    return {
      type: 'matrix',
      seed,
      difficulty,
      prompt: d.gen.matrix.prompt,
      stimulus: { kind: 'matrix', cells },
      responseMode: 'choice',
      options,
      answerIndex,
      errorTypes: candidates.map(errorTypeOf),
      explanation: {
        summary: d.gen.matrix.summary(answerIndex + 1),
        rules,
      },
      suggestedSeconds: 30 + difficulty * 15,
    };
  }

  // Difficulty 1 always succeeds quickly, so this is a genuinely unreachable state
  // rather than a silent quality downgrade — fail loudly instead of shipping a bad item.
  throw new Error(`matrix generator exhausted ${MAX_ATTEMPTS} attempts for seed "${seed}" d${difficulty}`);
}

export const matrixGenerator: Generator = { meta, generate };
