/**
 * The generator registry. Items are never stored — a `(type, seed, difficulty, locale)`
 * tuple reproduces one exactly, which is what lets a whole session be persisted in a few
 * bytes and replayed later for review, in whichever language the reader prefers.
 */
import type { Difficulty, Generator, Item, ItemTypeId, ItemTypeMeta } from '../types';
import { DEFAULT_LOCALE, dict, type Locale } from '../i18n';
import { matrixGenerator } from './matrix';
import { numberSeriesGenerator } from './series-number';
import { letterSeriesGenerator } from './series-letter';
import { oddOneOutGenerator } from './odd-one-out';
import { figuralAnalogyGenerator } from './analogy-figural';
import { syllogismGenerator } from './syllogism';
import { rotationGenerator } from './rotation';
import { paperFoldingGenerator } from './paper-folding';
import { spanGenerator } from './span';
import { symbolSearchGenerator } from './symbol-search';
import { codingGenerator } from './coding';
import { nBackGenerator } from './n-back';
import { headCountGenerator } from './head-count';
import { figureWeightsGenerator } from './figure-weights';
import { arithmeticGenerator } from './arithmetic';
import { interferenceGenerator } from './interference';
import { trailMakingGenerator } from './trail-making';
import { blockSpanGenerator } from './block-span';

/**
 * Presentation order: reasoning first, then spatial, then memory, then speed, with the
 * quantitative format last. The order is cosmetic but not arbitrary — `typeHue` derives a
 * format's colour from its index here, so reordering re-spaces the whole wheel.
 */
export const GENERATORS: Generator[] = [
  matrixGenerator,
  numberSeriesGenerator,
  letterSeriesGenerator,
  oddOneOutGenerator,
  figuralAnalogyGenerator,
  syllogismGenerator,
  rotationGenerator,
  paperFoldingGenerator,
  spanGenerator,
  blockSpanGenerator,
  symbolSearchGenerator,
  figureWeightsGenerator,
  nBackGenerator,
  headCountGenerator,
  codingGenerator,
  interferenceGenerator,
  trailMakingGenerator,
  arithmeticGenerator,
];

/**
 * Which generation of the generators produced an item. Bump on any change that alters what
 * `(type, seed, difficulty)` yields.
 *
 * Items are not stored, only their seeds — which is what keeps history small, and also what makes
 * history only as stable as the generators. A response records the tuple, so anything derived from
 * the item *afterwards* is derived from whatever the generators produce today. Two read-outs do
 * exactly that: `interferenceScore` recovers each Stroop trial's congruency by regenerating it, and
 * `switchCostScore` recovers each trail's form the same way. Change a plan and those old responses
 * are silently sorted into the wrong condition — a Stroop effect computed from a coin flip, with no
 * outward sign that anything is wrong.
 *
 * This is the outward sign. Sessions carry the version they were played at, and the two re-derived
 * contrasts read only sessions matching the current one. Everything a response records directly —
 * accuracy, latency, the chosen error type — stays valid across a bump and keeps being counted.
 *
 * Not the same thing as `SCHEMA_VERSION` in `store.ts`, which is about the persisted *shape*: a
 * schema bump discards the old key entirely, whereas an item bump keeps every session and narrows
 * what may be inferred from it.
 *
 * History:
 *  1 — original.
 *  2 — 2026-08: the distractor-leakage pass reworked twelve formats' option sets. Neither
 *      `interference` nor `trail-making` was among them, so no contrast actually lost data at
 *      this bump — the stamp exists so that the next one is not silent.
 */
export const ITEM_VERSION = 2;

const BY_ID = new Map<ItemTypeId, Generator>(GENERATORS.map((g) => [g.meta.id, g]));

export const ITEM_TYPE_IDS: ItemTypeId[] = GENERATORS.map((g) => g.meta.id);

export function getGenerator(id: ItemTypeId): Generator {
  const g = BY_ID.get(id);
  if (!g) throw new Error(`unknown item type: ${id}`);
  return g;
}

/** Language-neutral facts: id, CHC domain, icon. */
export function getMeta(id: ItemTypeId): ItemTypeMeta {
  return getGenerator(id).meta;
}

export interface ItemTypeText {
  name: string;
  blurb: string;
  description: string;
  seenIn: string;
}

/** The translated name, blurb, description and "seen in" list for an item type. */
export function getItemText(id: ItemTypeId, locale: Locale): ItemTypeText {
  return dict(locale).items[id];
}

export function isItemTypeId(value: string): value is ItemTypeId {
  return BY_ID.has(value as ItemTypeId);
}

export function generateItem(
  id: ItemTypeId,
  seed: string,
  difficulty: Difficulty,
  locale: Locale = DEFAULT_LOCALE,
): Item {
  return getGenerator(id).generate(seed, difficulty, locale);
}

export const ALL_META: ItemTypeMeta[] = GENERATORS.map((g) => g.meta);

/** Every item type paired with its translated text, in presentation order. */
export function allItemTypes(locale: Locale): (ItemTypeMeta & ItemTypeText)[] {
  return ALL_META.map((meta) => ({ ...meta, ...getItemText(meta.id, locale) }));
}
