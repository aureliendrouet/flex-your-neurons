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

/** Order of rotational symmetry: a rotation by 360/order degrees is invisible. */
const SYMMETRY_ORDER: Record<ShapeType, number> = {
  circle: 360, // effectively continuous — never rotate a circle
  square: 4,
  triangle: 3,
  diamond: 2,
  pentagon: 5,
  hexagon: 6,
  star: 5,
  cross: 4,
};

const SHAPES: ShapeType[] = ['circle', 'square', 'triangle', 'diamond', 'pentagon', 'hexagon', 'star', 'cross'];

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
      const order = SYMMETRY_ORDER[spec.type];
      // The rotation must be visible for this shape, or the analogy is undetermined.
      if (t.amount % (360 / order) === 0) return null;
      return { ...spec, rotation: (spec.rotation + t.amount) % 360 };
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

/** Identity as drawn — rotation normalised by symmetry, so invisible spins collapse. */
function figureKey(spec: Spec): string {
  const order = SYMMETRY_ORDER[spec.type];
  const period = 360 / order;
  const rot = order >= 360 ? 0 : ((spec.rotation % period) + period) % period;
  return `${spec.type}|${spec.size}|${spec.color}|${Math.round(rot)}`;
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
      const amount = rng.pick([90, 180, 45]);
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
    const c: Spec = {
      type: used.has('type') ? a.type : rng.pick(SHAPES),
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

    // Distractors: each is the answer with one transformation done wrong — the errors a
    // real solver makes (applying the inverse, forgetting one step, copying B).
    const wrong: { spec: Spec; errorType: ErrorType }[] = [];
    for (const t of transforms) {
      const inverse = applyAll(c, [...transforms.filter((x) => x !== t), { ...t, amount: -t.amount }]);
      if (inverse) wrong.push({ spec: inverse, errorType: 'wrong-rule' });
      const skipped = applyAll(c, transforms.filter((x) => x !== t));
      if (skipped) wrong.push({ spec: skipped, errorType: 'off-by-one' });
    }
    wrong.push({ spec: b, errorType: 'copy' });
    wrong.push({ spec: c, errorType: 'copy' });
    const doubled = applyAll(d, transforms);
    if (doubled) wrong.push({ spec: doubled, errorType: 'off-by-one' });

    const seen = new Set<string>([figureKey(d)]);
    const distractors = rng.shuffle(wrong).filter((w) => {
      const k = figureKey(w.spec);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    if (distractors.length < 4) continue;

    const chosen = distractors.slice(0, 4);
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
