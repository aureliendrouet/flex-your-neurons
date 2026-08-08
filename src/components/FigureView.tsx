/**
 * Renders a Figure as inline SVG.
 *
 * Shapes carry `data-shape` / `data-size` / `data-color` attributes. That is not
 * decoration: it is how the end-to-end tests assert on what was actually drawn, and it is
 * what makes the choice of SVG over canvas pay off (docs/LIBRARIES.md §3).
 *
 * Shading levels are drawn as **textures**, not as steps on an opacity ramp. A ramp asks
 * the reader to make a fine contrast judgement, which is exactly what low vision and
 * reduced contrast sensitivity take away; a texture survives both. See `fillStyleFor`.
 */
import { useId } from 'preact/hooks';
import {
  PATTERN_TILE,
  VIEWBOX,
  fillStyleFor,
  pointsAttr,
  radiusIn,
  shapeOutline,
  type PatternName,
} from '../lib/geometry';
import { dict, type Locale } from '../lib/i18n';
import type { Figure, Shape } from '../lib/types';

interface Props {
  figure: Figure;
  /** Accessible description; omit inside an already-labelled control. */
  label?: string;
  className?: string;
}

/**
 * One tile of each texture. Strokes are near-full opacity so the *texture* carries the
 * information: the level is told apart by pattern and by background wash, not by how
 * faint the ink is.
 */
function PatternTile({ name, id }: { name: PatternName; id: string }) {
  const size = PATTERN_TILE[name];
  const common = {
    id,
    width: size,
    height: size,
    patternUnits: 'userSpaceOnUse' as const,
  };
  const stroke = {
    stroke: 'currentColor',
    'stroke-opacity': 0.95,
    'stroke-linecap': 'round' as const,
  };

  switch (name) {
    case 'dots':
      return (
        <pattern {...common}>
          <circle cx={size / 2} cy={size / 2} r={1.5} fill="currentColor" fill-opacity={0.95} />
        </pattern>
      );
    case 'hatch':
      return (
        <pattern {...common}>
          <line x1={0} y1={size} x2={size} y2={0} stroke-width={1.6} {...stroke} />
        </pattern>
      );
    case 'cross':
      return (
        <pattern {...common}>
          <line x1={0} y1={size} x2={size} y2={0} stroke-width={1.5} {...stroke} />
          <line x1={0} y1={0} x2={size} y2={size} stroke-width={1.5} {...stroke} />
        </pattern>
      );
    case 'dense':
      return (
        <pattern {...common}>
          <line x1={0} y1={size} x2={size} y2={0} stroke-width={1.7} {...stroke} />
        </pattern>
      );
  }
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function ShapeNode({ shape, layout, uid }: { shape: Shape; layout: Figure['layout']; uid: string }) {
  const cx = shape.x * VIEWBOX;
  const cy = shape.y * VIEWBOX;
  const r = radiusIn(shape.size, layout);
  const style = fillStyleFor(shape.color);

  /*
   * SVG presentation attributes must be written kebab-case. Preact passes unknown
   * camelCase props straight through to `setAttribute`, and SVG attribute names are
   * case-sensitive — so `fillOpacity` lands as a meaningless `fillOpacity="0.3"` and the
   * shape renders fully opaque. That silently erased the shading attribute from every
   * figure, which is one of the five attributes a matrix rule can act on.
   */
  const common = {
    'data-shape': shape.type,
    'data-size': String(shape.size),
    'data-color': String(shape.color),
    'stroke-width': 2.5,
    'stroke-linejoin': 'round' as const,
    'vector-effect': 'non-scaling-stroke',
  };

  const outline = shape.type === 'circle' ? null : shapeOutline(shape.type, cx, cy, r, shape.rotation);

  /** The shape is painted once per layer: the wash, then the texture over it. */
  const layers: { fill: string; opacity: number }[] =
    style.kind === 'none'
      ? [{ fill: 'none', opacity: 0 }]
      : style.kind === 'solid'
        ? [{ fill: 'currentColor', opacity: style.opacity }]
        : [
            { fill: 'currentColor', opacity: style.wash },
            { fill: `url(#${uid}-${style.pattern})`, opacity: 1 },
          ];

  return (
    <>
      {layers.map((layer, i) => {
        // Only the top layer carries the outline, so the stroke is not painted twice.
        const stroke = i === layers.length - 1 ? 'currentColor' : 'none';
        return outline === null ? (
          <circle
            key={i}
            cx={round(cx)}
            cy={round(cy)}
            r={round(r)}
            fill={layer.fill}
            fill-opacity={layer.opacity}
            stroke={stroke}
            {...common}
          />
        ) : (
          <polygon
            key={i}
            points={pointsAttr(outline)}
            fill={layer.fill}
            fill-opacity={layer.opacity}
            stroke={stroke}
            {...common}
          />
        );
      })}
    </>
  );
}

export default function FigureView({ figure, label, className }: Props) {
  // Pattern ids must be unique per document, and many figures share a page.
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');

  const usedPatterns = [
    ...new Set(
      figure.shapes
        .map((s) => fillStyleFor(s.color))
        .flatMap((style) => (style.kind === 'pattern' ? [style.pattern] : [])),
    ),
  ];

  return (
    <svg
      class={className ?? 'figure-svg'}
      viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
      role={label ? 'img' : 'presentation'}
      aria-label={label}
      aria-hidden={label ? undefined : 'true'}
      data-figure=""
      data-layout={figure.layout}
      data-shape-count={String(figure.shapes.length)}
    >
      {usedPatterns.length > 0 && (
        <defs>
          {usedPatterns.map((name) => (
            <PatternTile key={name} name={name} id={`${uid}-${name}`} />
          ))}
        </defs>
      )}
      {figure.shapes.map((shape, i) => (
        <ShapeNode key={i} shape={shape} layout={figure.layout} uid={uid} />
      ))}
    </svg>
  );
}

/** A short text description, used for screen readers and for test assertions. */
export function describeFigure(figure: Figure, locale: Locale): string {
  const t = dict(locale).quiz;
  if (figure.shapes.length === 0) return t.emptyCell;
  const first = figure.shapes[0]!;
  const shading = first.color === 0 ? t.unfilled : t.shadingLevel(first.color);
  return t.describeFigure(figure.shapes.length, t.shapeNames[first.type], first.size, shading);
}
