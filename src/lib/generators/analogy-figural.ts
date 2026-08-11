/**
 * Figural analogy — A is to B as C is to ?
 *
 * A transformation is inferred from the A→B pair and applied to C. The subtle failure
 * mode is *invisible* transformations: rotating a square by 90 degrees, or a circle by
 * anything, produces an identical drawing, so the A→B pair would not determine the
 * transformation at all. Rotations are therefore only ever applied to shapes whose
 * rotational symmetry makes the change visible, and the generator verifies that the
 * rendered B genuinely differs from A.
 */
import { createRng, type Rng } from '../rng';
import { dict, type Locale } from '../i18n';
import { canonicalRotation, figureSignature, ROTATION_PERIOD } from '../geometry';

type T = ReturnType<typeof dict>['gen']['analogy'];
import type {
  ColorLevel,
  Difficulty,
  ErrorType,
  Figure,
  Generator,
  Item,
  ItemTypeMeta,
  ShapeType,
  SizeLevel,
} from '../types';

const SHAPES: ShapeType[] =['circle', 'square', 'triangle', 'diamond', 'pentagon', 'hexagon', 'star', 'cross'];

interface Spec {
  type: ShapeType;
  size: SizeLevel;
  color: ColorLevel;
  rotation: number;
}

type TransformKind = 'size' | 'color' | 'rotation' | 'type';

interface Transform {
  kind: TransformKind;
  /** Delta for size/color/rotation; target shape index offset for type. */
  amount: number;
  label: string;
}

function apply(spec: Spec, t: Transform): Spec | null {
  switch (t.kind) {
    case 'size': {
      const v = spec.size + t.amount;
      if (v < 1 || v > 5) return null;
      return { ...spec, size: v as SizeLevel };
    }
    case 'color': {
      const v = spec.color + t.amount;
      if (v < 0 || v > 5) return null;
      return { ...spec, color: v as ColorLevel };
    }
    case 'rotation': {
      /*
       * The rotation must be visible for this shape, or the analogy is undetermined. Asked of the
       * outline the renderer will draw rather than of a hand-kept symmetry table — the table said a
       * diamond had order 2, when it is drawn as a regular 4-gon, so quarter turns of it were
       * emitted as "rotations" that changed nothing on screen.
       */
      const turned = canonicalRotation(spec.type, spec.rotation + t.amount);
      if (turned === canonicalRotation(spec.type, spec.rotation)) return null;
      return { ...spec, rotation: turned };
    }
    case 'type': {
      const i = SHAPES.indexOf(spec.type);
      const next = SHAPES[(i + t.amount + SHAPES.length) % SHAPES.length]!;
      if (next === spec.type) return null;
      return { ...spec, type: next };
    }
  }
}

function applyAll(spec: Spec, ts: Transform[]): Spec | null {
  let out: Spec | null = spec;
  for (const t of ts) {
    if (!out) return null;
    out = apply(out, t);
  }
  return out;
}

function toFigure(spec: Spec): Figure {
  return {
    layout: 'center',
    shapes: [
      {
        type: spec.type,
        size: spec.size,
        color: spec.color,
        rotation: spec.rotation,
        x: 0.5,
        y: 0.5,
      },
    ],
  };
}

/**
 * Identity as drawn.
 *
 * Delegates to the rendered outline, which collapses two things a per-shape symmetry table cannot:
 * an invisible spin, and the cross-type coincidence that a square turned 45° *is* an upright
 * diamond. Both used to reach the option list, where they put the answer on screen twice.
 */
function figureKey(spec: Spec): string {
  return figureSignature(toFigure(spec));
}

/** Figures offered per item: the answer and four wrong readings of the rule. */
const OPTION_COUNT = 5;

const BISECT_ATTRS = ['type', 'size', 'color', 'rotation'] as const;
type BisectAttr = (typeof BISECT_ATTRS)[number];

/** Another legal value for one attribute, or `null` where the attribute has no room to move. */
function shift(spec: Spec, attr: BisectAttr, rng: Rng): Spec | null {
  switch (attr) {
    /*
     * The numeric attributes step at least two levels, not one.
     *
     * A shared value one step away leaves the distractors sitting either side of the answer, and
     * the answer at the centre of mass of the set — so "pick the option closest to the average of
     * the others" still found it above chance even once the counts were balanced. Moving further
     * puts the wrong values together on one side, where they say nothing about what is between them.
     */
    case 'size': {
      const far = [1, 2, 3, 4, 5].filter((v) => Math.abs(v - spec.size) >= 2);
      const options = far.length > 0 ? far : [1, 2, 3, 4, 5].filter((v) => v !== spec.size);
      return { ...spec, size: rng.pick(options) as SizeLevel };
    }
    case 'color': {
      const far = [0, 1, 2, 3, 4, 5].filter((v) => Math.abs(v - spec.color) >= 2);
      const options = far.length > 0 ? far : [0, 1, 2, 3, 4, 5].filter((v) => v !== spec.color);
      return { ...spec, color: rng.pick(options) as ColorLevel };
    }
    case 'type': {
      /* Stay within the same rotational symmetry, so a shifted shape cannot make a turn that was
         visible on the original invisible on it. */
      const options = SHAPES.filter(
        (s) => s !== spec.type && ROTATION_PERIOD[s] === ROTATION_PERIOD[spec.type],
      );
      return options.length > 0 ? { ...spec, type: rng.pick(options) } : null;
    }
    case 'rotation': {
      const period = ROTATION_PERIOD[spec.type];
      if (period === 0) return null;
      const current = canonicalRotation(spec.type, spec.rotation);
      const options: number[] = [];
      for (let r = 0; r < 360; r += 15) {
        const c = canonicalRotation(spec.type, r);
        if (c !== current && !options.includes(c)) options.push(c);
      }
      return options.length > 0 ? { ...spec, rotation: rng.pick(options) } : null;
    }
  }
}

/**
 * Nudge distractors until no attribute carries the answer's value in a majority of the options.
 *
 * The I-RAVEN repair, in the smallest form that fits this format. Returns `null` when the spread
 * cannot be achieved without colliding — the caller redraws, which is cheaper than shipping a set
 * that can be read without the stimulus.
 */
function bisect(
  answer: Spec,
  distractors: { spec: Spec; errorType: ErrorType }[],
  rng: Rng,
): { spec: Spec; errorType: ErrorType }[] | null {
  const out = distractors.map((w) => ({ ...w }));
  const total = out.length + 1;

  /*
   * Moving distractors *away* from the answer is not enough, and getting that wrong made things
   * three times worse before it made them better. If each distractor simply takes its own fresh
   * value on the shared attributes, every one of them disagrees with every other, and the answer —
   * which still matches whichever distractors were left alone — holds the largest count of agreeing
   * neighbours on every attribute at once. It becomes *more* identifiable, not less.
   *
   * What is needed is for the distractors to agree with **each other**. On every attribute at most
   * one distractor is allowed to keep the answer's value, and the rest are given one shared
   * alternative — so the modal value on each attribute belongs to the distractors, and reading off
   * the majority builds a figure that is not the answer.
   */
  for (const attr of BISECT_ATTRS) {
    const same = rng.shuffle(out.filter((w) => keyOfAttr(w.spec, attr) === keyOfAttr(answer, attr)));
    const diff = out.filter((w) => keyOfAttr(w.spec, attr) !== keyOfAttr(answer, attr));

    /*
     * Only attributes that already vary are touched.
     *
     * An attribute every option agrees on carries no information — it is the item's constant
     * background, not part of what is being asked. Spreading it would *create* a difference where
     * there was none, and a created difference is correlated with the answer by construction,
     * because the answer is the one figure that was not moved.
     */
    if (diff.length === 0 || same.length <= 1) continue;

    /*
     * The target shape is a *balanced* count, not a minimal or maximal one, and both extremes were
     * tried before this. Leaving the answer's value in the majority let "take the commonest value on
     * every attribute" rebuild it (42%, then 32% after a partial fix). Moving every distractor off
     * the answer's value inverted the tell rather than removing it — the answer became the lone
     * outlier and "pick the one furthest from its neighbours" found it 41% of the time.
     *
     * So exactly one distractor keeps the answer's value, one joins a value some other distractor
     * already holds, and any remainder takes a fresh one. The answer's value ends up held by two
     * options and so does a wrong value: whichever way a reader reads the majority, it does not
     * single out the answer.
     */
    const [, ...excess] = same;
    for (let i = 0; i < excess.length; i++) {
      const w = excess[i]!;
      const donor = i === 0 ? diff[i % diff.length]! : null;
      const value = donor ? donor.spec[attr] : shift(w.spec, attr, rng)?.[attr];
      if (value === undefined) continue;
      w.spec = { ...w.spec, [attr]: value } as Spec;
    }
  }

  /*
   * And then check the shape that was aimed at, rather than trusting the aim.
   *
   * The loop above spreads an attribute only when more than one distractor still carries the
   * answer's value on it, which quietly leaves the two cases where the answer is *already* alone in
   * how it sits — and being alone is a tell of exactly the same kind as being the mode:
   *
   *  - exactly one distractor shares the answer's value while the other three are all different.
   *    The answer's value is then the only one held twice, so "pick either option from the one
   *    matched pair" is a coin flip on a five-option item. Measured on shape type at level 5: 30%
   *    against a 20% chance, and the largest surviving leak in the format.
   *  - no distractor shares it and the others agree among themselves, which is the same tell
   *    upside down — the answer is the only option not part of a crowd.
   *
   * So each varying attribute is now *verified* to place the answer's value in a class whose size
   * some wrong value also has, and repaired by a single move where it does not. What a reader can
   * see, at best, is a class — never which class holds the answer.
   */
  /*
   * Twice, because the attributes are not independent: a move that balances shape type changes the
   * figure's rotation key with it, since a turn is only visible relative to the shape being turned.
   * Two passes settle every case seen in practice, and the check that follows is what the item is
   * actually held to — an unbalanced set is discarded rather than shipped half-repaired.
   */
  for (let pass = 0; pass < 2; pass++) {
    for (const attr of BISECT_ATTRS) {
      if (!balanced(answer, out, attr)) repair(answer, out, attr, rng);
    }
  }
  for (const attr of BISECT_ATTRS) {
    if (!balanced(answer, out, attr)) return null;
  }

  const keys = new Set([figureKey(answer), ...out.map((w) => figureKey(w.spec))]);
  return keys.size === total ? out : null;
}

/**
 * True when the answer's value on this attribute is held by as many options as some wrong value is.
 *
 * The invariant is about *class sizes*, not about which value wins. A set where the answer's shape
 * type is held by two options and a wrong one is held by two others is balanced; so is a set where
 * every option has its own. What is not balanced is any set where counting how many options share a
 * value picks the answer's group out — whether because it is the biggest group, the smallest, or the
 * only group at all.
 *
 * An attribute every option agrees on is balanced by definition: there is one class, it holds the
 * answer, and it holds everything else too, so nothing about it distinguishes anything.
 */
function balanced(answer: Spec, out: { spec: Spec }[], attr: BisectAttr): boolean {
  const answerKey = keyOfAttr(answer, attr);
  const sizes = new Map<string, number>();
  for (const key of [answerKey, ...out.map((w) => keyOfAttr(w.spec, attr))]) {
    sizes.set(key, (sizes.get(key) ?? 0) + 1);
  }
  if (sizes.size === 1) return true;
  const answerSize = sizes.get(answerKey)!;
  for (const [key, size] of sizes) {
    if (key !== answerKey && size === answerSize) return true;
  }
  return false;
}

/**
 * Move one distractor onto some other value until the attribute balances. Reports whether it could.
 *
 * A single move is enough for every unbalanced shape a five-option set can take, so this enumerates
 * candidate moves and takes the first that works rather than searching: each distractor in turn,
 * against the answer's value, every other distractor's value, and a handful of fresh ones. Shuffled,
 * so the repair does not always fall on the same distractor and become a tell of its own.
 *
 * Returning `false` — no single move balances it, which the shifts being unavailable can cause, since
 * a triangle has no other shape of its symmetry to become — makes the caller redraw the whole set.
 * That is the right answer: a set that cannot be balanced is a set that should not be shown.
 */
function repair(answer: Spec, out: { spec: Spec }[], attr: BisectAttr, rng: Rng): boolean {
  for (const w of rng.shuffle(out.map((x, i) => i))) {
    const target = out[w]!;
    const before = target.spec;
    const candidates: Spec[] = [answer, ...out.filter((_, i) => i !== w).map((x) => x.spec)];
    for (let i = 0; i < 4; i++) {
      const shifted = shift(before, attr, rng);
      if (shifted) candidates.push(shifted);
    }
    for (const candidate of rng.shuffle(candidates)) {
      target.spec = { ...before, [attr]: candidate[attr] } as Spec;
      if (balanced(answer, out, attr)) return true;
    }
    target.spec = before;
  }
  return false;
}

/** One attribute of a spec, as drawn — rotation reduced by the shape's symmetry. */
function keyOfAttr(spec: Spec, attr: BisectAttr): string {
  if (attr === 'rotation') return String(canonicalRotation(spec.type, spec.rotation));
  return String(spec[attr]);
}

function transformCount(difficulty: Difficulty): number {
  if (difficulty <= 2) return 1;
  if (difficulty <= 4) return 2;
  return 3;
}

const ALL_TRANSFORM_KINDS: TransformKind[] = ['size', 'color', 'rotation', 'type'];

function randomTransform(rng: Rng, exclude: Set<TransformKind>, t: T): Transform {
  const remaining = ALL_TRANSFORM_KINDS.filter((k) => !exclude.has(k));
  // At most three transformations are ever requested, so `remaining` cannot be empty;
  // falling back to the full set keeps the function total rather than relying on that.
  const kind: TransformKind = rng.pick(remaining.length > 0 ? remaining : ALL_TRANSFORM_KINDS);
  switch (kind) {
    case 'size': {
      const amount = rng.pick([-2, -1, 1, 2]);
      return { kind, amount, label: t.sizeChange(amount) };
    }
    case 'color': {
      const amount = rng.pick([-2, -1, 1, 2]);
      return { kind, amount, label: t.colorChange(amount) };
    }
    case 'rotation': {
      /*
       * No 45° step. It is visible on the quarter-turn shapes and on nothing else — and on exactly
       * those shapes it is the one angle that turns a square into an upright diamond, so the item
       * showed a rotation and read as a change of shape.
       */
      const amount = rng.pick([90, 180]);
      return { kind, amount, label: t.rotationChange(amount) };
    }
    case 'type': {
      const amount = rng.pick([1, 2, -1, 3]);
      return { kind, amount, label: t.typeChange(amount) };
    }
  }
}

const meta: ItemTypeMeta = {
  id: 'analogy-figural',
  domain: 'Gf',
  icon: '⇉',
  sprintable: false,
};

const MAX_ATTEMPTS = 300;

function generate(seed: string, difficulty: Difficulty, locale: Locale): Item {
  const t = dict(locale).gen.analogy;
  const rng = createRng(`analogy-figural:${seed}:${difficulty}`);
  const n = transformCount(difficulty);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const transforms: Transform[] = [];
    const used = new Set<TransformKind>();
    for (let i = 0; i < n; i++) {
      const transform = randomTransform(rng, used, t);
      used.add(transform.kind);
      transforms.push(transform);
    }

    const a: Spec = {
      type: rng.pick(SHAPES),
      size: rng.int(2, 4) as SizeLevel,
      color: rng.int(1, 4) as ColorLevel,
      rotation: 0,
    };
    /*
     * When the rule turns the figure, C must share A's rotational symmetry.
     *
     * A turn is only ever inferable *modulo the symmetry of the shape it was shown on*: a hexagon
     * turned 90° is equally a hexagon turned 30°, 150° or 270°. That is harmless while the reader
     * stays on one shape, and fatal the moment the rule is carried to a shape with a different
     * period — each reading of A→B then predicts a different answer for C, and more than one of them
     * was reaching the option list.
     */
    const rotationShapes = SHAPES.filter(
      (s) => ROTATION_PERIOD[s] === ROTATION_PERIOD[a.type] && ROTATION_PERIOD[s] !== 0,
    );
    // A circle has no orientation to read, so it can never carry a turn — redraw rather than pick.
    if (used.has('rotation') && rotationShapes.length === 0) continue;
    const c: Spec = {
      type: used.has('type')
        ? a.type
        : rng.pick(used.has('rotation') ? rotationShapes : SHAPES),
      size: rng.int(2, 4) as SizeLevel,
      color: rng.int(1, 4) as ColorLevel,
      rotation: 0,
    };
    // C must not simply be A, or the analogy collapses into "copy B".
    if (figureKey(a) === figureKey(c)) continue;

    const b = applyAll(a, transforms);
    const d = applyAll(c, transforms);
    if (!b || !d) continue;

    // Every transformation must be visible in BOTH pairs, else the rule is not inferable.
    if (figureKey(a) === figureKey(b)) continue;
    if (figureKey(c) === figureKey(d)) continue;
    if (figureKey(b) === figureKey(d)) continue;

    /*
     * Distractors are the rule applied the *wrong number of times*, over a window that decides where
     * the answer falls.
     *
     * "Applied once" is the answer; zero times is C copied unchanged, twice is one application too
     * many, minus once is the rule run backwards. Every one of those is a mistake a reader really
     * makes, so the set stays diagnostic — but taken as a fixed collection they arrange themselves
     * around the answer, one short and one long, and leave it at the centre of mass of the option
     * set. That was still readable after the attribute counts were balanced: "pick the figure
     * closest to the average of the others" ran at 30% against a 20% baseline on the level with a
     * single transformation, where the pool is small enough that the arrangement is forced.
     *
     * Drawing the answer's rank in the window and building outward from there keeps the same wrong
     * answers available and stops their arrangement from naming the right one.
     */
    /*
     * "The rule applied k times", with a fallback to "one of the rules applied k times".
     *
     * Scaling every transformation at once runs some attribute off its scale as soon as there is
     * more than one of them — size and shading each have five or six levels, so a compound rule
     * tripled is almost always out of range. Over-applying a *single* rule while getting the rest
     * right is just as real a mistake, and it keeps the window populated on the compound levels
     * where the pool would otherwise collapse back to a fixed arrangement.
     */
    const scaled = (k: number): Spec | null => {
      if (k === 1) return d;
      const all = applyAll(c, transforms.map((t) => ({ ...t, amount: t.amount * k })));
      if (all) return all;
      for (const target of transforms) {
        const one = applyAll(
          c,
          transforms.map((t) => (t === target ? { ...t, amount: t.amount * k } : t)),
        );
        if (one) return one;
      }
      return null;
    };

    const diagnose = (k: number): ErrorType => {
      if (k === 0) return 'copy';
      if (k === -1) return 'wrong-direction';
      if (k === 2) return 'off-by-one';
      return 'plausible';
    };

    const keys = new Set<string>([figureKey(d)]);
    const feasible: { k: number; spec: Spec; errorType: ErrorType }[] = [];
    for (const k of [0, 2, -1, 3, -2, 4, -3, 5]) {
      const spec = scaled(k);
      if (!spec) continue;
      const key = figureKey(spec);
      if (keys.has(key)) continue;
      keys.add(key);
      feasible.push({ k, spec, errorType: diagnose(k) });
    }

    /* Fewer applications than the answer on one side, more on the other. Ordered by how close each
       is to the answer, so a rank is realised with the most plausible readings available. */
    const fewer = feasible.filter((f) => f.k < 1).sort((x, y) => y.k - x.k);
    const more = feasible.filter((f) => f.k > 1).sort((x, y) => x.k - y.k);

    const need = OPTION_COUNT - 1;
    const ranks: number[] = [];
    for (let r = 0; r <= need; r++) {
      if (fewer.length >= r && more.length >= need - r) ranks.push(r);
    }

    let distractors: { spec: Spec; errorType: ErrorType }[];
    if (ranks.length > 0) {
      const rank = rng.pick(ranks);
      distractors = [...fewer.slice(0, rank), ...more.slice(0, need - rank)];
    } else {
      /*
       * Fallback for the compound rules. With three transformations, scaling all of them together
       * runs some attribute off its scale for almost every multiple, so the window above rarely
       * has both sides to draw from. Those items fall back to the per-transformation mistakes —
       * one rule inverted, one rule forgotten, a visible cell copied — which is a richer pool
       * precisely because there are more rules to get individually wrong, and whose arrangement is
       * therefore far less regular than the single-transformation case that needed the window.
       */
      const wrong: { spec: Spec; errorType: ErrorType }[] = [];
      for (const t of transforms) {
        const inverse = applyAll(c, [
          ...transforms.filter((x) => x !== t),
          { ...t, amount: -t.amount },
        ]);
        if (inverse) wrong.push({ spec: inverse, errorType: 'wrong-direction' });
        const skipped = applyAll(c, transforms.filter((x) => x !== t));
        if (skipped) wrong.push({ spec: skipped, errorType: 'off-by-one' });
      }
      wrong.push({ spec: b, errorType: 'copy' });
      wrong.push({ spec: c, errorType: 'copy' });
      const doubled = applyAll(d, transforms);
      if (doubled) wrong.push({ spec: doubled, errorType: 'off-by-one' });

      const fallbackSeen = new Set<string>([figureKey(d)]);
      const usable = rng.shuffle(wrong).filter((w) => {
        const key = figureKey(w.spec);
        if (fallbackSeen.has(key)) return false;
        fallbackSeen.add(key);
        return true;
      });
      if (usable.length < need) continue;
      distractors = usable.slice(0, need);
    }

    /*
     * Spread the distractors' attributes so the answer is not the attribute-wise mode.
     *
     * Every distractor above is the answer with *one* thing done wrong, which is exactly what makes
     * it diagnostic — and exactly what made the option set answerable on its own. Four figures each
     * agreeing with the answer on all but one attribute leave the answer holding the majority value
     * everywhere, so "take the commonest shape, the commonest size, the commonest shading" rebuilds
     * it without the analogy being read at all. Measured at 42% against a 20% baseline, and it is the
     * original RAVEN defect, which `docs/GENERATABILITY.md` §1 names and I-RAVEN fixed by bisecting
     * the attributes instead of perturbing one at a time.
     *
     * The repair keeps each distractor's headline mistake and nudges a *second*, non-diagnostic
     * attribute on some of them, until no attribute has the answer's value in the majority. The
     * error type still describes the transformation that was got wrong, which is what the review
     * screen reports.
     */
    const chosen = bisect(d, distractors.slice(0, 4), rng);
    if (!chosen) continue;

    const all = rng.shuffle([
      { spec: d, errorType: 'correct' as ErrorType },
      ...chosen,
    ]);

    const answerIndex = all.findIndex((x) => x.errorType === 'correct');
    return {
      type: 'analogy-figural',
      seed,
      difficulty,
      prompt: t.prompt,
      stimulus: { kind: 'analogy', a: toFigure(a), b: toFigure(b), c: toFigure(c) },
      responseMode: 'choice',
      options: all.map((x) => ({ kind: 'figure', figure: toFigure(x.spec) })),
      answerIndex,
      errorTypes: all.map((x) => x.errorType),
      explanation: {
        summary: t.summary(answerIndex + 1, transforms.map((x) => x.label)),
        rules: transforms.map((x) => t.rule(x.label)),
      },
      suggestedSeconds: 25 + difficulty * 10,
    };
  }

  throw new Error(
    `analogy-figural generator exhausted ${MAX_ATTEMPTS} attempts for seed "${seed}" d${difficulty}`,
  );
}

export const figuralAnalogyGenerator: Generator = { meta, generate };
