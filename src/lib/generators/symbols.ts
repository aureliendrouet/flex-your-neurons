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

/** Identity of a symbol, for the duplicate checks both generators depend on. */
export function symbolKey(s: Symbol): string {
  return `${s.type}|${s.color}|${s.rotation}`;
}

export function toFigure(s: Symbol, size: SizeLevel = 4): Figure {
  return {
    layout: 'center',
    shapes: [{ type: s.type, size, color: s.color, rotation: s.rotation, x: 0.5, y: 0.5 }],
  };
}

export function randomSymbol(rng: Rng): Symbol {
  return {
    type: rng.pick(SHAPES),
    color: rng.pick(SHADINGS),
    rotation: rng.pick(ROTATIONS),
  };
}

/** A symbol exactly one dimension away from `s` — the near-miss that costs a second look. */
export function confusableWith(s: Symbol, rng: Rng): Symbol {
  const dim = rng.pick(['type', 'color', 'rotation'] as const);
  if (dim === 'type') return { ...s, type: rng.pick(SHAPES.filter((t) => t !== s.type)) };
  if (dim === 'color') return { ...s, color: rng.pick(SHADINGS.filter((c) => c !== s.color)) };
  return { ...s, rotation: rng.pick(ROTATIONS.filter((r) => r !== s.rotation)) };
}
