import { describe, expect, it } from 'vitest';
import { PREVIEW_PINS, previewItem } from '@/lib/previews';
import { ogCard, OG_HEIGHT, OG_WIDTH } from '@/lib/og';
import { getItemText, getMeta, ITEM_TYPE_IDS } from '@/lib/generators';
import { dict, LOCALES } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import type { ItemTypeId } from '@/lib/types';

function card(id: ItemTypeId, locale: Locale): string {
  const t = dict(locale);
  const meta = getMeta(id);
  const text = getItemText(id, locale);
  return ogCard({
    item: previewItem(id, locale),
    name: text.name,
    blurb: text.blurb,
    domain: t.domains[meta.domain],
    domainCode: meta.domain,
    brand: t.nav.brand,
    disclaimer: t.og.disclaimer,
  });
}

describe('preview pins', () => {
  it('covers every format', () => {
    expect(Object.keys(PREVIEW_PINS).sort()).toEqual([...ITEM_TYPE_IDS].sort());
  });

  /** A card that changed on every build would read as an unstable site. */
  it('is deterministic', () => {
    for (const id of ITEM_TYPE_IDS) {
      expect(JSON.stringify(previewItem(id))).toBe(JSON.stringify(previewItem(id)));
    }
  });

  /**
   * The same structural item in both languages, exactly as anywhere else — a French reader
   * and an English reader must be looking at the same picture with different words on it.
   */
  it('draws the same item in every locale', () => {
    for (const id of ITEM_TYPE_IDS) {
      const en = previewItem(id, 'en');
      const fr = previewItem(id, 'fr');
      expect(JSON.stringify(fr.stimulus.kind === 'text' ? fr.options.length : fr.stimulus)).toBe(
        JSON.stringify(en.stimulus.kind === 'text' ? en.options.length : en.stimulus),
      );
      expect(fr.answerIndex).toBe(en.answerIndex);
    }
  });

  /**
   * Legibility, as a property. A thumbnail is ~5rem tall: a matrix whose cells each hold a
   * 3x3 arrangement of shapes, or a sequence of nineteen terms, would pass every generator
   * test and still be an unreadable card.
   */
  it('is legible at thumbnail size', () => {
    for (const id of ITEM_TYPE_IDS) {
      const item = previewItem(id);
      const s = item.stimulus;

      if (s.kind === 'matrix') {
        for (const cell of s.cells) {
          if (!cell) continue;
          expect(cell.layout, `${id} cell layout`).not.toBe('grid3x3');
          expect(cell.shapes.length, `${id} shapes per cell`).toBeLessThanOrEqual(4);
        }
      }
      if (s.kind === 'sequence') {
        expect(s.terms.length, `${id} terms`).toBeLessThanOrEqual(8);
        // The blank has to be in the tail the miniature actually shows.
        expect(s.terms.slice(-4).includes(null), `${id} blank is visible`).toBe(true);
      }
      if (s.kind === 'span') {
        expect(s.sequence.length, `${id} span length`).toBeLessThanOrEqual(6);
      }
      if (s.kind === 'text') {
        expect(s.lines.length, `${id} premise lines`).toBeLessThanOrEqual(3);
        for (const line of s.lines) {
          expect(line.length, `${id} premise "${line}" is too long to fit`).toBeLessThanOrEqual(44);
        }
      }
      if (s.kind === 'symbol-search') {
        expect(s.targets.length, `${id} targets`).toBeGreaterThanOrEqual(2);
      }
    }
  });
});

describe('social cards', () => {
  it('renders one well-formed card per format and locale', () => {
    for (const locale of LOCALES) {
      for (const id of ITEM_TYPE_IDS) {
        const svg = card(id, locale);
        expect(svg.startsWith('<svg'), `${id} ${locale}`).toBe(true);
        expect(svg.trimEnd().endsWith('</svg>'), `${id} ${locale}`).toBe(true);
        expect(svg).toContain(`width="${OG_WIDTH}" height="${OG_HEIGHT}"`);
        expect(svg).toContain(`data-og-type="${id}"`);
        // Every card draws something: a stage that silently produced nothing would still
        // be valid SVG and would ship as an empty grey rectangle.
        const stage = svg.match(/<g data-og-stage=""[^>]*>(.*?)<\/g>\s*<\/svg>/s)?.[1] ?? '';
        expect(stage.length, `${id} ${locale} has an empty stage`).toBeGreaterThan(120);
      }
    }
  });

  /**
   * Parity with the on-page renderer, which is the risk this module carries: `og.ts` is a
   * second serialiser, so a card must draw the shapes the item actually contains.
   */
  it('draws the shapes of the item it claims to show', () => {
    for (const id of ITEM_TYPE_IDS) {
      const item = previewItem(id);
      const svg = card(id, 'en');
      const s = item.stimulus;

      if (s.kind === 'matrix') {
        const drawn = s.cells.filter(Boolean).flatMap((c) => c!.shapes);
        for (const shape of drawn) {
          expect(svg, `${id} ${shape.type}`).toContain(`data-shape="${shape.type}"`);
        }
        // Eight figures and one blank.
        expect(svg.match(/data-figure=""/g)).toHaveLength(8);
      }
      if (s.kind === 'sequence') {
        for (const term of s.terms.slice(-4)) {
          if (term !== null) expect(svg, `${id} term ${term}`).toContain(`>${term}<`);
        }
      }
      if (s.kind === 'text') {
        for (const line of s.lines) expect(svg, `${id} premise`).toContain(line);
      }
      if (s.kind === 'grid') {
        expect(svg).toContain(`data-rows="${s.grid.rows}" data-cols="${s.grid.cols}"`);
      }
    }
  });

  /** The one thing that must never be missing from an image that travels on its own. */
  it('carries the no-score disclaimer in both languages', () => {
    for (const locale of LOCALES) {
      const svg = card('matrix', locale);
      expect(svg).toContain(dict(locale).og.disclaimer);
    }
  });

  it('escapes text rather than letting it break the document', () => {
    const svg = ogCard({
      item: previewItem('matrix'),
      name: 'A & B <script>',
      blurb: 'Quotes "here" and \'there\'',
      domain: 'Fluid & reasoning',
      domainCode: 'Gf',
      brand: 'Reason',
      disclaimer: 'No <IQ> score',
    });
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&amp;');
    expect(svg).toContain('&lt;script&gt;');
  });

  /** French copy is longer than English; the card must not silently overflow its column. */
  it('keeps translated headlines within the left column', () => {
    for (const locale of LOCALES) {
      for (const id of ITEM_TYPE_IDS) {
        const name = getItemText(id, locale).name;
        expect(name.length, `${id} ${locale} name is too long for the card`).toBeLessThanOrEqual(
          44,
        );
      }
    }
  });
});
