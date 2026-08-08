/**
 * Odd one out (figural classification) — several figures share a concept; one violates it.
 *
 * This is the Cattell CFIT "Classification" subtest format. Unambiguity is the whole
 * problem here: if two figures are each unique on *some* attribute, two different answers
 * are defensible. So the generator emits a candidate set and then runs an independent
 * check — tally every attribute, find every figure that is unique on any attribute, and
 * require that set to be exactly the intended odd one.
 */
import { createRng, type Rng } from '../rng';
import { slotsFor } from '../geometry';
import { dict, type Locale } from '../i18n';
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

const SHAPES: ShapeType[] = ['circle', 'square', 'triangle', 'diamond', 'pentagon', 'hexagon', 'star', 'cross'];

/** The dimensions a figure can be "odd" on. Kept small so every one is clearly visible. */
type Dim = 'type' | 'size' | 'color' | 'count';

interface Spec {
  type: number;
  size: number;
  color: number;
  count: number;
}

function specKey(s: Spec): string {
  return `${s.type}|${s.size}|${s.color}|${s.count}`;
}

function buildFigure(s: Spec, layout: SlotLayout): Figure {
  const slots = slotsFor(layout);
  const shapes: Shape[] = [];
  for (let i = 0; i < Math.min(s.count, slots.length); i++) {
    const slot = slots[i]!;
    shapes.push({
      type: SHAPES[s.type % SHAPES.length]!,
      size: s.size as SizeLevel,
      color: s.color as ColorLevel,
      rotation: 0,
      x: slot.x,
      y: slot.y,
    });
  }
  return { layout, shapes };
}

/**
 * The independent check. Returns the indices of every figure that is unique on at least
 * one dimension — i.e. every figure a solver could defensibly call the odd one.
 */
function defensibleOddOnes(specs: Spec[]): number[] {
  const dims: Dim[] = ['type', 'size', 'color', 'count'];
  const odd = new Set<number>();
  for (const dim of dims) {
    const tally = new Map<number, number[]>();
    specs.forEach((s, i) => {
      const v = s[dim];
      tally.set(v, [...(tally.get(v) ?? []), i]);
    });
    // A figure is defensibly odd on this dimension when it holds a value no one else
    // holds AND every other figure agrees on a single common value.
    for (const [, idxs] of tally) {
      if (idxs.length !== 1) continue;
      const i = idxs[0]!;
      const others = specs.filter((_, j) => j !== i).map((s) => s[dim]);
      if (new Set(others).size === 1) odd.add(i);
    }
  }
  return [...odd].sort((a, b) => a - b);
}

interface Plan {
  count: number;
  layout: SlotLayout;
  /** How many dimensions vary among the conforming figures (noise). */
  noiseDims: number;
}

function planFor(difficulty: Difficulty): Plan {
  // At least one noise dimension is required at every difficulty. With none, the
  // conforming figures are pixel-identical to each other, so "which one differs" has no
  // visual referent and the item is unanswerable as drawn.
  switch (difficulty) {
    case 1:
      return { count: 5, layout: 'center', noiseDims: 1 };
    case 2:
      return { count: 5, layout: 'center', noiseDims: 2 };
    case 3:
      return { count: 6, layout: 'grid2x2', noiseDims: 2 };
    case 4:
      return { count: 6, layout: 'grid2x2', noiseDims: 2 };
    case 5:
      return { count: 6, layout: 'grid2x2', noiseDims: 3 };
  }
}

const meta: ItemTypeMeta = { id: 'odd-one-out', domain: 'Gf', icon: '◈' };

const MAX_ATTEMPTS = 300;

function generate(seed: string, difficulty: Difficulty, locale: Locale): Item {
  const t = dict(locale).gen.oddOneOut;
  const rng = createRng(`odd-one-out:${seed}:${difficulty}`);
  const plan = planFor(difficulty);
  const maxCount = plan.layout === 'center' ? 1 : slotsFor(plan.layout).length;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const dims: Dim[] = plan.layout === 'center'
      ? ['type', 'size', 'color']
      : ['type', 'size', 'color', 'count'];

    const oddDim = rng.pick(dims);
    // Dimensions allowed to vary as noise among conforming figures. The odd dimension is
    // held constant for them, since it is the concept being tested.
    const noisePool = dims.filter((d) => d !== oddDim);
    const noiseDims = rng.sample(noisePool, Math.min(plan.noiseDims, noisePool.length));

    const shared: Spec = {
      type: rng.int(0, SHAPES.length - 1),
      size: rng.int(2, 5),
      color: rng.int(1, 5),
      count: plan.layout === 'center' ? 1 : rng.int(2, maxCount),
    };

    const specs: Spec[] = [];
    for (let i = 0; i < plan.count - 1; i++) {
      const s = { ...shared };
      for (const d of noiseDims) s[d] = randomValueFor(d, rng, maxCount, plan.layout);
      specs.push(s);
    }

    // The odd figure keeps the noise profile of the others but breaks the concept.
    const odd: Spec = { ...shared };
    for (const d of noiseDims) odd[d] = randomValueFor(d, rng, maxCount, plan.layout);
    const before = odd[oddDim];
    for (let tries = 0; tries < 20 && odd[oddDim] === before; tries++) {
      odd[oddDim] = randomValueFor(oddDim, rng, maxCount, plan.layout);
    }
    if (odd[oddDim] === before) continue;

    const oddIndex = rng.int(0, plan.count - 1);
    specs.splice(oddIndex, 0, odd);

    // All figures must be visually distinct, else "which one" has no unique referent.
    if (new Set(specs.map(specKey)).size !== specs.length) continue;

    // Guard 1: exactly one figure may be defensibly called odd, and it must be ours.
    const defensible = defensibleOddOnes(specs);
    if (defensible.length !== 1 || defensible[0] !== oddIndex) continue;

    const options: Option[] = specs.map((s) => ({
      kind: 'figure',
      figure: buildFigure(s, plan.layout),
    }));

    const errorTypes: ErrorType[] = specs.map((_, i) =>
      i === oddIndex ? 'correct' : 'wrong-attribute',
    );

    return {
      type: 'odd-one-out',
      seed,
      difficulty,
      prompt: t.prompt,
      stimulus: { kind: 'none' },
      responseMode: 'choice',
      options,
      answerIndex: oddIndex,
      errorTypes,
      explanation: {
        summary: t.summary(oddIndex + 1, t.dims[oddDim]),
        rules: [
          t.shared(t.dims[oddDim]),
          ...(noiseDims.length > 0 ? [t.noise(noiseDims.map((d) => t.dims[d]))] : []),
        ],
      },
      suggestedSeconds: 20 + difficulty * 8,
    };
  }

  throw new Error(
    `odd-one-out generator exhausted ${MAX_ATTEMPTS} attempts for seed "${seed}" d${difficulty}`,
  );
}

function randomValueFor(dim: Dim, rng: Rng, maxCount: number, layout: SlotLayout): number {
  switch (dim) {
    case 'type':
      return rng.int(0, SHAPES.length - 1);
    case 'size':
      return rng.int(2, 5);
    case 'color':
      return rng.int(1, 5);
    case 'count':
      return layout === 'center' ? 1 : rng.int(1, maxCount);
  }
}

export const oddOneOutGenerator: Generator = { meta, generate };
