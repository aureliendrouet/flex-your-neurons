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
 *
 * Two readings count, and only the first used to.
 *
 * **Unique against a consensus.** One figure holds a value nobody else holds, and every other
 * figure agrees on one value. This is the cleanest case and the one the generator builds towards.
 *
 * **The loner among groups.** One figure holds a value nobody else holds, and the rest fall into
 * two or more groups of at least two. This is *also* how classification works — the reader sees
 * three squares, two circles and one star, and the star is the odd one — and requiring a unanimous
 * remainder missed it entirely. A second defensible answer existed in a third to a half of all items
 * above difficulty 1, and in about 3% of them it was the *more* salient reading: the keyed answer
 * differed by one shading step while some other figure was the only single-shape figure among
 * figures of three and four. The user-facing copy promised "exactly one figure is defensibly odd, on
 * exactly one dimension", which is a promise the guard was not keeping.
 *
 * A group of one among singletons is not a reading: if every figure holds a different value on a
 * dimension, nothing about that dimension is shared, so nothing violates it.
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

    for (const [, idxs] of tally) {
      if (idxs.length !== 1) continue;
      const i = idxs[0]!;
      const otherGroups = [...tally.values()].filter((g) => g[0] !== i || g.length > 1);
      const remainder = otherGroups.filter((g) => !(g.length === 1 && g[0] === i));
      if (remainder.length === 0) continue;
      // Every remaining figure sits in a group of two or more — one consensus, or several.
      if (remainder.every((g) => g.length >= 2)) odd.add(i);
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
    /* Levels 3 and 4 were byte-identical plans, so they drew from one pool and differed only in the
       seconds suggested for them. A third varying dimension is the format's own dial. */
    case 4:
      return { count: 6, layout: 'grid2x2', noiseDims: 3 };
    /* The last rung changes the layout rather than adding a seventh figure: nine slots give the
       count dimension a wider range to hide in, and keeping the option count at six across the top
       three levels keeps the answer's position comparable between them. */
    case 5:
      return { count: 6, layout: 'grid3x3', noiseDims: 3 };
  }
}

const meta: ItemTypeMeta = {
  id: 'odd-one-out',
  domain: 'Gf',
  icon: '◈',
  sprintable: false,
};

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
      /*
       * The same range the shared count is drawn from — see the draw in `generate`.
       *
       * These two disagreed: the conforming majority was drawn from 2..max while the odd figure and
       * the noise were drawn from 1..max, so a single-shape figure could never be the majority and a
       * sparse pan was disproportionately the violator. "Pick the figure with the fewest shapes"
       * scored around 50% against a 17% base rate, which is a shortcut that needs no concept at all.
       */
      return layout === 'center' ? 1 : rng.int(2, maxCount);
  }
}

export const oddOneOutGenerator: Generator = { meta, generate };
