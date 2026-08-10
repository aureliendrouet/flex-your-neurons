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
  symbolSearchGenerator,
  figureWeightsGenerator,
  nBackGenerator,
  headCountGenerator,
  codingGenerator,
  arithmeticGenerator,
];

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
