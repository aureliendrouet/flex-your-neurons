/**
 * The abstract-symbol vocabulary shared by the two processing-speed formats.
 *
 * Symbol search and digit–symbol coding both need "a meaningless mark you can tell from
 * another meaningless mark at a glance", and both need near-misses that differ on exactly
 * one dimension — that near-miss is what makes a speed task effortful rather than trivial.
 * The vocabulary lives here so the two formats cannot drift apart: a symbol that is
 * confusable in one is confusable in the other, which is what makes their latencies
 * comparable at all.
 *
 * Three dimensions, deliberately: shape, shading and orientation. Colour is not among them
 * — hue is never load-bearing anywhere on this site, because roughly one man in twelve
 * would be answering a different question.
 */
import { canonicalRotation } from '../geometry';
import type { Rng } from '../rng';
import type { ColorLevel, Figure, ShapeType, SizeLevel } from '../types';

const SHAPES: ShapeType[] = [
  'circle',
  'square',
  'triangle',
  'diamond',
  'pentagon',
  'hexagon',
  'star',
  'cross',
];

/**
 * Orientations far enough apart to be told apart at speed.
 *
 * 30° steps: a finer step would make "same shape, different angle" a perceptual coin-flip
 * on shapes with rotational symmetry, and the task is meant to measure speed, not acuity.
 */
const ROTATIONS = [0, 30, 60, 90, 120, 150];

/** Shadings that stay distinct as textures — hollow, mid, dense. See `fillStyleFor`. */
const SHADINGS: ColorLevel[] = [0, 2, 4];

export interface Symbol {
  type: ShapeType;
  color: ColorLevel;
  rotation: number;
}

/**
 * Identity of a symbol, for the duplicate checks both generators depend on.
 *
 * Keyed on the rotation the shape is *drawn* at, not the one it stores. A hexagon at 60° and one at
 * 120° are the same picture, and a key that separated them would let a coding key hold the same
 * symbol under two digits, or let a symbol-search trial hide a target in plain sight and call it
 * absent. See `canonicalRotation`.
 */
export function symbolKey(s: Symbol): string {
  return `${s.type}|${s.color}|${canonicalRotation(s.type, s.rotation)}`;
}

/** The orientations that produce a *visibly* different mark for a given shape. */
function rotationsFor(type: ShapeType): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const r of ROTATIONS) {
    const c = canonicalRotation(type, r);
    if (seen.has(c)) continue;
    seen.add(c);
    out.push(c);
  }
  return out;
}

export function toFigure(s: Symbol, size: SizeLevel = 4): Figure {
  return {
    layout: 'center',
    shapes: [{ type: s.type, size, color: s.color, rotation: s.rotation, x: 0.5, y: 0.5 }],
  };
}

export function randomSymbol(rng: Rng): Symbol {
  const type = rng.pick(SHAPES);
  return {
    type,
    color: rng.pick(SHADINGS),
    /* Stored already reduced, so the record and the ink never disagree. The draw is still made from
       the full ladder, so the RNG stream is unchanged by the reduction. */
    rotation: canonicalRotation(type, rng.pick(ROTATIONS)),
  };
}

/**
 * A symbol exactly one dimension away from `s` — the near-miss that costs a second look.
 *
 * "One dimension away" has to mean one *visible* dimension. Rotation is not a usable dimension on
 * every shape: on a circle it is not drawn at all, and on a hexagon only two of the six orientations
 * are distinct. Offering it anyway produced near-misses that were pixel-identical to the symbol they
 * were supposed to be confusable with — the opposite of a near-miss, and the source of items whose
 * correct answer appeared twice.
 */
export function confusableWith(s: Symbol, rng: Rng): Symbol {
  const rotations = rotationsFor(s.type).filter((r) => r !== canonicalRotation(s.type, s.rotation));
  const dims: ('type' | 'color' | 'rotation')[] = ['type', 'color'];
  if (rotations.length > 0) dims.push('rotation');
  const dim = rng.pick(dims);
  if (dim === 'type') {
    const type = rng.pick(SHAPES.filter((t) => t !== s.type));
    return { ...s, type, rotation: canonicalRotation(type, s.rotation) };
  }
  if (dim === 'color') return { ...s, color: rng.pick(SHADINGS.filter((c) => c !== s.color)) };
  return { ...s, rotation: rng.pick(rotations) };
}
