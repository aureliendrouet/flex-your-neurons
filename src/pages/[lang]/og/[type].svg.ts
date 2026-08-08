/**
 * Build-time social cards: one static SVG per format per locale.
 *
 * A static endpoint rather than a script under `scripts/`: the route is what emits the
 * file, so the card and the page that references it cannot get out of step, and the whole
 * thing stays inside the normal `astro build` with no extra step to remember. Twenty files,
 * a few kilobytes each, no runtime cost and no network.
 *
 * SVG rather than PNG. Rasterising would mean a headless browser or a font-embedding
 * library, and the plan this implements is explicit that no dependency is added. The
 * trade-off is real and worth stating: crawlers that refuse `image/svg+xml` fall back to
 * the page title, which is the behaviour today anyway.
 */
import type { APIRoute } from 'astro';
import { ALL_META, getItemText, getMeta } from '../../../lib/generators';
import { typeHue } from '../../../lib/identity';
import { previewItem } from '../../../lib/previews';
import { ogCard } from '../../../lib/og';
import { dict, LOCALES, type Locale } from '../../../lib/i18n';
import type { ItemTypeId } from '../../../lib/types';

export function getStaticPaths() {
  return LOCALES.flatMap((lang) => ALL_META.map((meta) => ({ params: { lang, type: meta.id } })));
}

export const GET: APIRoute = ({ params }) => {
  const locale = params.lang as Locale;
  const type = params.type as ItemTypeId;
  const t = dict(locale);
  const meta = getMeta(type);
  const text = getItemText(type, locale);

  const svg = ogCard({
    item: previewItem(type, locale),
    hue: typeHue(type),
    name: text.name,
    blurb: text.blurb,
    domain: t.domains[meta.domain],
    domainCode: meta.domain,
    brand: t.nav.brand,
    disclaimer: t.og.disclaimer,
  });

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      // Immutable in practice: the card is a pure function of a pinned seed.
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
};
