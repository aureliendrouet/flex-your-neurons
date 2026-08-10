/**
 * Build-time social-preview cards, emitted as SVG strings.
 *
 * A shared link to a format currently previews as a bare title. These cards make it
 * preview as the *item*, which for this site is the only honest advertisement: the artwork
 * and the product are the same thing.
 *
 * Why strings rather than the Preact components that draw the on-page miniatures: a static
 * `.svg.ts` endpoint has no renderer, and reaching for `preact-render-to-string` would mean
 * depending directly on a package that is only a transitive dependency today — and the plan
 * this implements is explicit that `package.json` gains nothing. So the drawing here is a
 * second *serialiser* over the same geometry (`geometry.ts`) and the same generated items
 * (`previews.ts`); there is no second generator and no second set of shape maths.
 * `tests/og.test.ts` pins the parity that matters — every card draws the item its format
 * actually produces.
 *
 * Colours are baked rather than tokenised: an OG card is scraped by a crawler and shown
 * inside someone else's UI, so there is no theme to inherit and no `prefers-color-scheme`
 * to respond to. Figures stay greyscale here for the same reason they do everywhere else.
 */
import {
  PATTERN_TILE,
  VIEWBOX,
  fillStyleFor,
  pointsAttr,
  radiusIn,
  shapeOutline,
  type PatternName,
} from './geometry';
import { TYPE_CHROMA, TYPE_LIGHTNESS } from './identity';
import type { CellGrid, Figure, Item, Shape } from './types';

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

/** The light palette, frozen. See the module comment on why these are not tokens. */
const INK = '#14161f';
const MUTED = '#5c6070';
const SUBTLE = '#83879a';
const PAPER = '#f7f7fb';
const RAISED = '#ffffff';
const SUNKEN = '#eeeef5';
const LINE = '#dcdce8';
const ACCENT = '#5b53e8';

/** XML-escapes text drawn into the card. Format names and blurbs are translated copy. */
export function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Figures and grids, as SVG fragments
// ---------------------------------------------------------------------------

/**
 * One tile of each shading texture.
 *
 * Emitted once per document with a stable id, so every tile in the card shares them. The
 * `patternUnits="userSpaceOnUse"` here is relative to each *nested* `<svg>`'s user space,
 * which is what keeps a texture the same density whatever size the tile is drawn at.
 */
function patternDefs(): string {
  const tiles: Record<PatternName, string> = {
    dots: `<circle cx="${PATTERN_TILE.dots / 2}" cy="${PATTERN_TILE.dots / 2}" r="1.3" fill="${INK}" fill-opacity="0.95"/>`,
    hatch: `<line x1="0" y1="${PATTERN_TILE.hatch}" x2="${PATTERN_TILE.hatch}" y2="0" stroke="${INK}" stroke-opacity="0.95" stroke-width="1.6" stroke-linecap="round"/>`,
    cross:
      `<line x1="0" y1="${PATTERN_TILE.cross}" x2="${PATTERN_TILE.cross}" y2="0" stroke="${INK}" stroke-opacity="0.95" stroke-width="1.5" stroke-linecap="round"/>` +
      `<line x1="0" y1="0" x2="${PATTERN_TILE.cross}" y2="${PATTERN_TILE.cross}" stroke="${INK}" stroke-opacity="0.95" stroke-width="1.5" stroke-linecap="round"/>`,
    dense: `<line x1="0" y1="${PATTERN_TILE.dense}" x2="${PATTERN_TILE.dense}" y2="0" stroke="${INK}" stroke-opacity="0.95" stroke-width="1.7" stroke-linecap="round"/>`,
  };
  return (Object.keys(tiles) as PatternName[])
    .map(
      (name) =>
        `<pattern id="p-${name}" width="${PATTERN_TILE[name]}" height="${PATTERN_TILE[name]}" patternUnits="userSpaceOnUse">${tiles[name]}</pattern>`,
    )
    .join('');
}

/** One shape: a wash layer then a texture layer, exactly as `FigureView` paints it. */
function shapeSvg(shape: Shape, layout: Figure['layout']): string {
  const cx = shape.x * VIEWBOX;
  const cy = shape.y * VIEWBOX;
  const r = radiusIn(shape.size, layout);
  const style = fillStyleFor(shape.color);
  const outline = shape.type === 'circle' ? null : shapeOutline(shape.type, cx, cy, r, shape.rotation);

  const layers =
    style.kind === 'none'
      ? [{ fill: 'none', opacity: 0 }]
      : style.kind === 'solid'
        ? [{ fill: INK, opacity: style.opacity }]
        : [
            { fill: INK, opacity: style.wash },
            { fill: `url(#p-${style.pattern})`, opacity: 1 },
          ];

  return layers
    .map((layer, i) => {
      // Only the top layer is stroked, so the outline is not painted twice.
      const stroke = i === layers.length - 1 ? INK : 'none';
      const common = `fill="${layer.fill}" fill-opacity="${layer.opacity}" stroke="${stroke}" stroke-width="2.5" stroke-linejoin="round" data-shape="${shape.type}" data-size="${shape.size}" data-color="${shape.color}"`;
      return outline === null
        ? `<circle cx="${round(cx)}" cy="${round(cy)}" r="${round(r)}" ${common}/>`
        : `<polygon points="${pointsAttr(outline)}" ${common}/>`;
    })
    .join('');
}

/**
 * A figure in its own nested `<svg>` viewport.
 *
 * Nesting rather than a `transform` is what makes the layout arithmetic below trivial: the
 * inner coordinate system stays the generator's 100x100 box whatever box it is placed in,
 * so nothing has to be rescaled by hand.
 */
export function figureTile(figure: Figure, x: number, y: number, size: number): string {
  const shapes = figure.shapes.map((s) => shapeSvg(s, figure.layout)).join('');
  return `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 ${VIEWBOX} ${VIEWBOX}" data-figure="" data-layout="${figure.layout}">${shapes}</svg>`;
}

/** A polyomino ('solid') or a punched sheet ('holes'), scaled to fit the given box. */
export function gridTile(
  grid: CellGrid,
  x: number,
  y: number,
  box: number,
  variant: 'solid' | 'holes' = 'solid',
): string {
  const cell = 20;
  const pad = 4;
  const w = grid.cols * cell + pad * 2;
  const h = grid.rows * cell + pad * 2;
  const parts: string[] = [];

  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      const filled = grid.cells[r * grid.cols + c] ?? false;
      const cx = pad + c * cell;
      const cy = pad + r * cell;
      if (variant === 'holes') {
        parts.push(
          `<rect x="${cx}" y="${cy}" width="${cell}" height="${cell}" fill="none" stroke="${INK}" stroke-opacity="0.35" stroke-width="1"/>`,
        );
        if (filled) {
          parts.push(
            `<circle cx="${cx + cell / 2}" cy="${cy + cell / 2}" r="${cell * 0.28}" fill="${INK}"/>`,
          );
        }
        continue;
      }
      parts.push(
        `<rect x="${cx}" y="${cy}" width="${cell}" height="${cell}" fill="${INK}" fill-opacity="${filled ? 0.85 : 0}" stroke="${INK}" stroke-width="${filled ? 1.5 : 0.5}" stroke-opacity="${filled ? 1 : 0.15}"/>`,
      );
    }
  }

  // `meet` keeps the aspect ratio: a 2x4 sheet must not be squared up into a 4x4 one.
  return `<svg x="${x}" y="${y}" width="${box}" height="${box}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" data-grid="" data-rows="${grid.rows}" data-cols="${grid.cols}">${parts.join('')}</svg>`;
}

// ---------------------------------------------------------------------------
// The stage: what each format shows
// ---------------------------------------------------------------------------

/** Geometry of the right-hand stage the item is drawn into. */
const STAGE = { x: 640, y: 96, w: 480, h: 438 };

function chip(text: string, x: number, y: number, w: number, h: number): string {
  return (
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${RAISED}" stroke="${LINE}" stroke-width="2"/>` +
    `<text x="${x + w / 2}" y="${y + h / 2}" text-anchor="middle" dominant-baseline="central" font-family="ui-monospace, monospace" font-size="30" font-weight="650" fill="${INK}">${esc(text)}</text>`
  );
}

function blankChip(text: string, x: number, y: number, w: number, h: number): string {
  return (
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${SUNKEN}" stroke="${LINE}" stroke-width="2" stroke-dasharray="7 5"/>` +
    `<text x="${x + w / 2}" y="${y + h / 2}" text-anchor="middle" dominant-baseline="central" font-family="ui-monospace, monospace" font-size="30" font-weight="650" fill="${SUBTLE}">${esc(text)}</text>`
  );
}

/** Lays tiles out in a single centred row inside the stage. */
function row(count: number, box: number, gap: number): { x: number; y: number }[] {
  const total = count * box + (count - 1) * gap;
  const startX = STAGE.x + (STAGE.w - total) / 2;
  const y = STAGE.y + (STAGE.h - box) / 2;
  return Array.from({ length: count }, (_, i) => ({ x: startX + i * (box + gap), y }));
}

/**
 * The item, drawn.
 *
 * Each branch picks the smallest composition that still says what the format asks of you —
 * the same editorial judgement as the on-page miniatures, at a size where more detail
 * would survive but no more meaning would.
 */
function stage(item: Item): string {
  const s = item.stimulus;

  switch (s.kind) {
    /* The signature image of the whole genre: nine cells, one of them missing. */
    case 'matrix': {
      const box = Math.min(STAGE.w, STAGE.h) / 3;
      const originX = STAGE.x + (STAGE.w - box * 3) / 2;
      const originY = STAGE.y + (STAGE.h - box * 3) / 2;
      return s.cells
        .map((cell, i) => {
          const cx = originX + (i % 3) * box;
          const cy = originY + Math.floor(i / 3) * box;
          const frame = `<rect x="${cx}" y="${cy}" width="${box}" height="${box}" fill="${cell === null ? SUNKEN : RAISED}" stroke="${LINE}" stroke-width="2"/>`;
          const body =
            cell === null
              ? `<text x="${cx + box / 2}" y="${cy + box / 2}" text-anchor="middle" dominant-baseline="central" font-size="56" fill="${SUBTLE}">?</text>`
              : figureTile(cell, cx + box * 0.1, cy + box * 0.1, box * 0.8);
          return frame + body;
        })
        .join('');
    }

    case 'sequence': {
      const shown = s.terms.slice(-4);
      const w = 96;
      const h = 74;
      const gap = 16;
      const total = shown.length * w + (shown.length - 1) * gap;
      const startX = STAGE.x + (STAGE.w - total) / 2;
      const y = STAGE.y + (STAGE.h - h) / 2;
      return shown
        .map((term, i) =>
          term === null
            ? blankChip('?', startX + i * (w + gap), y, w, h)
            : chip(term, startX + i * (w + gap), y, w, h),
        )
        .join('');
    }

    case 'span': {
      const shown = s.sequence.slice(0, 5);
      const w = 70;
      const h = 74;
      const gap = 14;
      const total = shown.length * w + (shown.length - 1) * gap;
      const startX = STAGE.x + (STAGE.w - total) / 2;
      const y = STAGE.y + (STAGE.h - h) / 2;
      return shown.map((e, i) => chip(e, startX + i * (w + gap), y, w, h)).join('');
    }

    /*
     * The stream as chips, like span — but with the matching pair marked, because that pair
     * *is* what the format is about and a row of unrelated letters would advertise nothing.
     * The first n-back match in the shown window is highlighted at both ends.
     */
    case 'n-back': {
      const shown = s.sequence.slice(0, 6);
      const w = 62;
      const h = 74;
      const gap = 12;
      const total = shown.length * w + (shown.length - 1) * gap;
      const startX = STAGE.x + (STAGE.w - total) / 2;
      const y = STAGE.y + (STAGE.h - h) / 2;
      let pair: [number, number] | null = null;
      for (let i = s.n; i < shown.length && pair === null; i++) {
        if (shown[i] === shown[i - s.n]) pair = [i - s.n, i];
      }
      return shown
        .map((e, i) => {
          const x = startX + i * (w + gap);
          const marked = pair !== null && (i === pair[0] || i === pair[1]);
          return (
            chip(e, x, y, w, h) +
            (marked
              ? `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="none" stroke="${ACCENT}" stroke-width="4"/>`
              : '')
          );
        })
        .join('');
    }

    /*
     * The board, with the path drawn in. A scatter of labelled circles alone would not say what the
     * task is; the line through them in order is the whole idea, and it is the one card where the
     * *answer* is the illustration — there is nothing to spoil, since the labels state the order.
     */
    case 'trail': {
      const nodes = s.nodes;
      const r = 26;
      const pad = r + 6;
      const px = (n: { x: number; y: number }) => ({
        x: STAGE.x + pad + n.x * (STAGE.w - pad * 2),
        y: STAGE.y + pad + n.y * (STAGE.h - pad * 2),
      });
      const points = nodes.map(px);
      const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${round(p.x)} ${round(p.y)}`).join(' ');
      return (
        `<path d="${path}" fill="none" stroke="${ACCENT}" stroke-width="4" stroke-linejoin="round" stroke-opacity="0.55"/>` +
        points
          .map(
            (p, i) =>
              `<circle cx="${round(p.x)}" cy="${round(p.y)}" r="${r}" fill="${RAISED}" stroke="${INK}" stroke-width="2.5"/>` +
              `<text x="${round(p.x)}" y="${round(p.y)}" text-anchor="middle" dominant-baseline="central" font-family="ui-monospace, monospace" font-size="24" font-weight="700" fill="${INK}">${esc(nodes[i]!.label)}</text>`,
          )
          .join('')
      );
    }

    /*
     * The glyphs in a row, large. The card has to show both readings at once — several copies of a
     * digit, and nothing telling you which of the two numbers is wanted — because the tension
     * between them is the format.
     */
    case 'interference': {
      const glyphs = s.glyphs.slice(0, 6);
      const w = 74;
      const gap = 14;
      const total = glyphs.length * w + (glyphs.length - 1) * gap;
      const startX = STAGE.x + (STAGE.w - total) / 2;
      const y = STAGE.y + STAGE.h / 2;
      return glyphs
        .map(
          (glyph, i) =>
            `<text x="${startX + i * (w + gap) + w / 2}" y="${y}" text-anchor="middle" dominant-baseline="central" font-family="ui-monospace, monospace" font-size="86" font-weight="700" fill="${INK}">${esc(glyph)}</text>`,
        )
        .join('');
    }

    /*
     * The expression, drawn large and centred with a trailing blank. Nothing to lay out and
     * nothing to abbreviate: the whole item is one short line, which is the point of the format.
     */
    case 'expression': {
      const text = `${s.expression} =`;
      return (
        `<text x="${STAGE.x + STAGE.w / 2}" y="${STAGE.y + STAGE.h / 2}" text-anchor="middle" dominant-baseline="central" font-family="ui-monospace, monospace" font-size="72" font-weight="700" fill="${INK}">${esc(text)}</text>` +
        `<text x="${STAGE.x + STAGE.w / 2}" y="${STAGE.y + STAGE.h / 2 + 78}" text-anchor="middle" dominant-baseline="central" font-family="ui-monospace, monospace" font-size="48" font-weight="700" fill="${SUBTLE}">?</text>`
      );
    }

    /*
     * The script as signed chips, with the running total beneath each one. The totals are the
     * whole point: a row of "+3 −2 +4" is arithmetic, and it is only the line of totals under
     * it that says the quantity being held is rewritten at every step.
     */
    case 'head-count': {
      const shown = s.events.slice(0, 6);
      const w = 62;
      const h = 66;
      const gap = 12;
      const total = shown.length * w + (shown.length - 1) * gap;
      const startX = STAGE.x + (STAGE.w - total) / 2;
      // Both rows are centred as a block, so the pair sits on the stage's midline.
      const y = STAGE.y + (STAGE.h - (h + 44)) / 2;
      let running = 0;
      return shown
        .map((delta, i) => {
          running += delta;
          const x = startX + i * (w + gap);
          const label = delta > 0 ? `+${delta}` : String(delta);
          return (
            chip(label, x, y, w, h) +
            `<text x="${x + w / 2}" y="${y + h + 26}" text-anchor="middle" dominant-baseline="central" font-family="ui-monospace, monospace" font-size="27" font-weight="650" fill="${ACCENT}">${running}</text>`
          );
        })
        .join('');
    }

    /* Odd-one-out: the options are the question, so they are also the picture. */
    case 'none': {
      const figures = item.options.flatMap((o) => (o.kind === 'figure' ? [o.figure] : [])).slice(0, 4);
      const box = 108;
      return row(figures.length, box, 20)
        .map((at, i) => figureTile(figures[i]!, at.x, at.y, box))
        .join('');
    }

    case 'figure-set': {
      const figures = s.figures.slice(0, 4);
      const box = 108;
      return row(figures.length, box, 20)
        .map((at, i) => figureTile(figures[i]!, at.x, at.y, box))
        .join('');
    }

    case 'analogy': {
      // Four tiles and three operators is the densest row on any card. The operators sit
      // at the midpoint of each gap, so widening the tiles narrows the gaps rather than
      // letting a glyph drift over the tile beside it.
      const box = 104;
      const gap = 26;
      const at = row(4, box, gap);
      const mid = at[0]!.y + box / 2;
      const op = (x: number, glyph: string) =>
        `<text x="${x}" y="${mid}" text-anchor="middle" dominant-baseline="central" font-size="30" fill="${SUBTLE}">${esc(glyph)}</text>`;
      return [
        figureTile(s.a, at[0]!.x, at[0]!.y, box),
        op(at[0]!.x + box + gap / 2, '→'),
        figureTile(s.b, at[1]!.x, at[1]!.y, box),
        op(at[1]!.x + box + gap / 2, '::'),
        figureTile(s.c, at[2]!.x, at[2]!.y, box),
        op(at[2]!.x + box + gap / 2, '→'),
        `<rect x="${at[3]!.x}" y="${at[3]!.y}" width="${box}" height="${box}" rx="12" fill="${SUNKEN}" stroke="${LINE}" stroke-width="2" stroke-dasharray="7 5"/>`,
        `<text x="${at[3]!.x + box / 2}" y="${mid}" text-anchor="middle" dominant-baseline="central" font-size="46" fill="${SUBTLE}">?</text>`,
      ].join('');
    }

    /* The one format made of words. Showing the real premises is what distinguishes it. */
    case 'text': {
      const lineHeight = 58;
      const lines = [...s.lines, '?'];
      const startY = STAGE.y + (STAGE.h - lines.length * lineHeight) / 2 + lineHeight / 2;
      return lines
        .map(
          (line, i) =>
            `<text x="${STAGE.x}" y="${startY + i * lineHeight}" dominant-baseline="central" font-size="${i === lines.length - 1 ? 34 : 30}" fill="${i === lines.length - 1 ? SUBTLE : MUTED}">${esc(line)}</text>`,
        )
        .join('');
    }

    /* Target, then the same shape turned — the distinction the task rests on. */
    case 'grid': {
      const answer = item.options[item.answerIndex];
      const box = 180;
      const at = row(2, box, 56);
      const mid = at[0]!.y + box / 2;
      return [
        gridTile(s.grid, at[0]!.x, at[0]!.y, box),
        `<text x="${(at[0]!.x + box + at[1]!.x) / 2}" y="${mid}" text-anchor="middle" dominant-baseline="central" font-size="34" fill="${ACCENT}">↻</text>`,
        answer?.kind === 'grid' ? gridTile(answer.grid, at[1]!.x, at[1]!.y, box, answer.variant ?? 'solid') : '',
      ].join('');
    }

    /* The folded, punched sheet, then the sheet opened out again. */
    case 'paper-folding': {
      const answer = item.options[item.answerIndex];
      let rows = s.size;
      let cols = s.size;
      for (const fold of s.folds) {
        if (fold === 'left' || fold === 'right') cols = Math.max(1, cols / 2);
        else rows = Math.max(1, rows / 2);
      }
      const cells = new Array<boolean>(rows * cols).fill(false);
      for (const p of s.punches) {
        if (p.y < rows && p.x < cols) cells[p.y * cols + p.x] = true;
      }
      const box = 180;
      const at = row(2, box, 56);
      const mid = at[0]!.y + box / 2;
      return [
        gridTile({ rows, cols, cells }, at[0]!.x, at[0]!.y, box, 'holes'),
        `<text x="${(at[0]!.x + box + at[1]!.x) / 2}" y="${mid}" text-anchor="middle" dominant-baseline="central" font-size="34" fill="${ACCENT}">→</text>`,
        answer?.kind === 'grid' ? gridTile(answer.grid, at[1]!.x, at[1]!.y, box, 'holes') : '',
      ].join('');
    }

    case 'symbol-search': {
      const box = 96;
      const targets = s.targets.slice(0, 2);
      const search = s.search.slice(0, 4);
      const midY = STAGE.y + STAGE.h / 2;
      const place = (n: number, y: number) => {
        const total = n * box + (n - 1) * 18;
        const startX = STAGE.x + (STAGE.w - total) / 2;
        return Array.from({ length: n }, (_, i) => ({ x: startX + i * (box + 18), y }));
      };
      return [
        ...place(targets.length, midY - box - 42).map((at, i) => figureTile(targets[i]!, at.x, at.y, box)),
        `<line x1="${STAGE.x + STAGE.w / 2 - 90}" y1="${midY - 6}" x2="${STAGE.x + STAGE.w / 2 + 90}" y2="${midY - 6}" stroke="${LINE}" stroke-width="3"/>`,
        ...place(search.length, midY + 18).map((at, i) => figureTile(search[i]!, at.x, at.y, box)),
      ].join('');
    }

    /*
     * One premise scale over the target scale. Two rows is enough to say "these are
     * equations about weight"; the full premise set would shrink every pan past reading.
     */
    case 'figure-weights': {
      const box = 84;
      const gapX = 96; // room for the beam between the pans
      const rowGap = 34;
      const rows: { left: Figure; right: Figure | null }[] = [
        ...(s.premises[0] ? [s.premises[0]] : []),
        { left: s.target, right: null },
      ];
      const totalH = rows.length * box + (rows.length - 1) * rowGap;
      const startY = STAGE.y + (STAGE.h - totalH) / 2;
      const leftX = STAGE.x + (STAGE.w - (box * 2 + gapX)) / 2;
      const rightX = leftX + box + gapX;

      return rows
        .map((row, i) => {
          const y = startY + i * (box + rowGap);
          const midY = y + box / 2;
          const beamX = leftX + box + 16;
          const beamW = gapX - 32;
          return [
            figureTile(row.left, leftX, y, box),
            `<line x1="${beamX}" y1="${midY - 8}" x2="${beamX + beamW}" y2="${midY - 8}" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`,
            `<line x1="${beamX + beamW / 2}" y1="${midY - 8}" x2="${beamX + beamW / 2}" y2="${midY + 6}" stroke="${INK}" stroke-width="3"/>`,
            `<polygon points="${beamX + beamW / 2},${midY + 2} ${beamX + beamW / 2 + 9},${midY + 14} ${beamX + beamW / 2 - 9},${midY + 14}" fill="${INK}"/>`,
            row.right === null
              ? `<rect x="${rightX}" y="${y}" width="${box}" height="${box}" rx="14" fill="none" stroke="${LINE}" stroke-width="3" stroke-dasharray="8 7"/>` +
                `<text x="${rightX + box / 2}" y="${midY}" text-anchor="middle" dominant-baseline="central" font-size="40" fill="${SUBTLE}">?</text>`
              : figureTile(row.right, rightX, y, box),
          ].join('');
        })
        .join('');
    }

    /*
     * Digit over symbol, four columns at most. The card advertises the format rather than
     * posing the item, so it shows what a key *is* and drops the probe entirely — a lone
     * highlighted column would read as an answer already given.
     */
    case 'coding': {
      const box = 88;
      const gap = 22;
      const pairs = s.pairs.slice(0, 4);
      const total = pairs.length * box + (pairs.length - 1) * gap;
      const startX = STAGE.x + (STAGE.w - total) / 2;
      const y = STAGE.y + (STAGE.h - box) / 2 + 16;
      return pairs
        .map((pair, i) => {
          const x = startX + i * (box + gap);
          return (
            `<text x="${x + box / 2}" y="${y - 26}" text-anchor="middle" font-size="34" font-weight="600" fill="${INK}">${esc(pair.digit)}</text>` +
            figureTile(pair.figure, x, y, box)
          );
        })
        .join('');
    }
  }
}

// ---------------------------------------------------------------------------
// The card
// ---------------------------------------------------------------------------

/** Breaks a blurb into lines that fit the left column, by rough character count. */
function wrap(text: string, perLine: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > perLine && current) {
      lines.push(current);
      current = word;
      if (lines.length === maxLines) return lines;
    } else {
      current = next;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  return lines;
}

export interface OgCard {
  item: Item;
  /**
   * This format's hue in degrees, from `identity.ts`. Paints the card's chrome — the top
   * rule and the domain label — so a shared link is recognisable as *this* format before its
   * name is read. Never touches the figures: the same rule as everywhere else.
   */
  hue: number;
  /** Translated format name — the card's headline. */
  name: string;
  /** Translated one-line description. */
  blurb: string;
  /** Translated CHC domain name, e.g. "Fluid reasoning". */
  domain: string;
  /** The CHC code, e.g. "Gf". */
  domainCode: string;
  /** The site wordmark. Translated per locale; the URL slug stays English. */
  brand: string;
  /** The standing disclaimer. Shortened for the card. */
  disclaimer: string;
}

/**
 * A complete 1200x630 social card.
 *
 * The disclaimer is on the card deliberately. This site's whole position is that it
 * reports no score, and a preview image is the one piece of it that travels to places
 * where none of the surrounding text does.
 */
export function ogCard(card: OgCard): string {
  /*
   * The format's hue, written in OKLCH exactly as the stylesheet does — an SVG rendered by a
   * browser resolves it, and baking a converted hex here would let the two drift apart.
   */
  const identity = `oklch(${TYPE_LIGHTNESS}% ${TYPE_CHROMA} ${card.hue.toFixed(1)})`;
  const nameLines = wrap(card.name, 22, 2);
  const blurbLines = wrap(card.blurb, 40, 3);
  const nameSize = nameLines.length > 1 ? 58 : 68;
  /*
   * The left column reads top-down as wordmark / domain / name / blurb / disclaimer, with
   * the name block anchored well below the wordmark rather than crowding it. The numbers
   * are a rhythm, not a grid: the name is the only thing that changes height, so
   * everything under it is measured from `nameTop` and everything above it is fixed.
   */
  const nameTop = 204;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_WIDTH}" height="${OG_HEIGHT}" viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}" role="img" aria-label="${esc(card.name)}" data-og-type="${card.item.type}">
<defs>${patternDefs()}</defs>
<rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="${PAPER}"/>
<rect x="0" y="0" width="${OG_WIDTH}" height="6" fill="${identity}"/>

<g font-family="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif">
  <rect x="72" y="64" width="40" height="40" rx="11" fill="${identity}"/>
  <text x="92" y="84" text-anchor="middle" dominant-baseline="central" font-size="21" fill="${RAISED}">▦</text>
  <text x="126" y="84" dominant-baseline="central" font-size="27" font-weight="700" fill="${INK}">${esc(card.brand)}</text>

  <text x="72" y="168" font-size="21" font-weight="650" letter-spacing="2.4" fill="${identity}">${esc(card.domain.toUpperCase())} (${esc(card.domainCode)})</text>

  ${nameLines
    .map(
      (line, i) =>
        `<text x="72" y="${nameTop + 26 + i * (nameSize + 8)}" dominant-baseline="central" font-size="${nameSize}" font-weight="680" letter-spacing="-1.4" fill="${INK}">${esc(line)}</text>`,
    )
    .join('\n  ')}

  ${blurbLines
    .map(
      (line, i) =>
        `<text x="72" y="${nameTop + nameLines.length * (nameSize + 8) + 46 + i * 40}" dominant-baseline="central" font-size="29" fill="${MUTED}">${esc(line)}</text>`,
    )
    .join('\n  ')}

  <line x1="72" y1="${OG_HEIGHT - 104}" x2="520" y2="${OG_HEIGHT - 104}" stroke="${LINE}" stroke-width="2"/>
  <text x="72" y="${OG_HEIGHT - 66}" dominant-baseline="central" font-size="23" fill="${SUBTLE}">${esc(card.disclaimer)}</text>
</g>

<g data-og-stage="" font-family="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif">${stage(card.item)}</g>
</svg>
`;
}
