/**
 * A stable hue per item format.
 *
 * Ten formats, ten identities — used for a card's accent, its practice page, its progress
 * row and its social card, so a format is recognisable before its name is read.
 *
 * **Chrome only.** No hue produced here ever enters a figure: colour-blind solvability
 * depends on figures being `currentColor` plus a texture ramp, and that rule has no
 * exceptions (docs/DESIGN-PLAN.md §3.1). These values paint borders, rules and dots.
 *
 * Assignment is by position rather than by hashing the id. Hashing was the obvious move and
 * is the wrong one: with ten members drawn from 360 degrees, collisions and near-collisions
 * are likely, and two formats twelve degrees apart look like a mistake rather than like a
 * distinction. Even spacing guarantees 36 degrees of separation, and the ordering is already
 * meaningful — `GENERATORS` runs reasoning, then spatial, then memory and speed, so adjacent
 * hues belong to related formats.
 */
import { ITEM_TYPE_IDS } from './generators';
import type { ItemTypeId } from './types';

/**
 * The accent hue, so the set opens on the site's own indigo and the identity stays
 * continuous. Must match `--hue-accent` in `global.css`.
 */
export const BASE_HUE = 278.7;

/**
 * Perceptual lightness and chroma every format hue shares.
 *
 * The whole reason the palette moved to OKLCH: hold these two constant, rotate the third,
 * and ten swatches genuinely sit at the same visual weight. The same triple in sRGB would
 * have a yellow member glaring and a blue member receding.
 */
export const TYPE_LIGHTNESS = 54.1;
export const TYPE_CHROMA = 0.19;

/** Degrees between neighbours: a full turn divided evenly among the formats. */
const STEP = 360 / ITEM_TYPE_IDS.length;

/** Hue in degrees for a format. Deterministic, and stable as long as the order is. */
export function typeHue(id: ItemTypeId): number {
  const index = ITEM_TYPE_IDS.indexOf(id);
  // An unknown id falls back to the site accent rather than to hue 0, which is red and
  // would read as an error state.
  if (index < 0) return BASE_HUE;
  return (BASE_HUE + index * STEP) % 360;
}

/** The format's accent as an OKLCH string, for contexts with no CSS custom properties. */
export function typeColour(id: ItemTypeId, lightness = TYPE_LIGHTNESS): string {
  return `oklch(${lightness}% ${TYPE_CHROMA} ${typeHue(id).toFixed(1)})`;
}
