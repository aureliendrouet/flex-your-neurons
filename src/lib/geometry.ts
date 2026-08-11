/**
 * Pure geometry for the figural vocabulary.
 *
 * Everything renders to inline SVG rather than canvas: an SVG node carries semantic
 * `data-*` attributes that Playwright can assert on and a screen reader can be given a
 * label for, whereas a canvas is an opaque bitmap (docs/LIBRARIES.md §3).
 */
import type { CellGrid, ColorLevel, Figure, Shape, ShapeType, SizeLevel, SlotLayout } from './types';

/** Every figure is drawn in a 100x100 user-space box. */
export const VIEWBOX = 100;

/**
 * Ratio between the radii of adjacent size levels, per layout.
 *
 * Size is judged *relatively*: the reader compares one shape against its neighbours, so
 * what has to be legible is the ratio between adjacent levels, not the absolute range. A
 * geometric ramp anchored at the layout's cap gives every neighbouring pair the same
 * ratio — which is exactly what Progression and Distribute-Three ask the reader to read.
 *
 * The ratios are the largest each layout can afford while keeping level 1 above the
 * visibility floor of ~8 units, since `radiusIn` divides down from the cap.
 *
 * This replaced a linear interpolation into a floor..cap band, which was fine at `center`
 * (~30-37% steps) but produced only 17-20% steps at `grid2x2` — below what a reader can
 * reliably call apart when the two shapes sit in different cells and other attributes are
 * changing at the same time. Odd-one-out uses `grid2x2` with size as an oddness dimension,
 * so a size-odd item there was close to unanswerable.
 *
 * `grid3x3` cannot reach the same step: nine slots cap the radius at 14, and 14/1.25^4
 * falls under the floor. That is precisely why the matrix generator drops `size` from the
 * ruled attributes at 3x3 (see `generators/matrix.ts`), and no generator varies size
 * there — so its ratio only governs incidental appearance, never an answer.
 */
const SIZE_RATIO: Record<SlotLayout, number> = {
  center: 1.32,
  grid2x2: 1.25,
  grid3x3: 1.14,
};

/** Number of vertices for the regular polygons. `star` and `cross` are special-cased. */
const POLYGON_SIDES: Partial<Record<ShapeType, number>> = {
  triangle: 3,
  square: 4,
  diamond: 4,
  pentagon: 5,
  hexagon: 6,
};

/** Rotation applied so each shape sits "upright" at rotation 0. */
const BASE_ANGLE: Partial<Record<ShapeType, number>> = {
  triangle: -90,
  square: -45,
  diamond: 0,
  pentagon: -90,
  hexagon: -90,
};

/**
 * The angle after which a shape's drawing repeats itself.
 *
 * This is the bridge between the data model, where `rotation` is a free number, and the page, where
 * a regular polygon turned by one of its own symmetry steps is *the same picture*. Two symbols that
 * differ only by such a step are distinct records and identical ink, and every format that asks
 * "are these two the same?" has to mean the ink — otherwise a key holds two entries a reader cannot
 * tell apart, a "target absent" trial displays the target, and a correct answer is scored wrong.
 *
 * `circle` is 0, meaning no rotation is ever drawn: it is emitted as an SVG primitive that takes no
 * angle at all, so all six of the vocabulary's orientations are one circle.
 *
 * Derived from `POLYGON_SIDES` for the regular polygons (360/sides), and by inspection for the two
 * special-cased outlines: `star` has five arms (72°) and `cross` is a plus sign (90°).
 */
export const ROTATION_PERIOD: Record<ShapeType, number> = {
  circle: 0,
  square: 90,
  diamond: 90,
  cross: 90,
  triangle: 120,
  pentagon: 72,
  star: 72,
  hexagon: 60,
};

/**
 * The rotation a shape is actually *drawn* at: the requested angle reduced into its first period.
 *
 * Use this — never the raw `rotation` field — anywhere two shapes are compared for sameness, keyed
 * for de-duplication, or described to a reader.
 */
export function canonicalRotation(type: ShapeType, rotation: number): number {
  const period = ROTATION_PERIOD[type];
  if (period === 0) return 0;
  return ((rotation % period) + period) % period;
}

export type Point = readonly [number, number];

function regularPolygon(cx: number, cy: number, r: number, sides: number, angleDeg: number): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i < sides; i++) {
    const a = ((angleDeg + (360 / sides) * i) * Math.PI) / 180;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

/**
 * A five-pointed star.
 *
 * The inner radius is the arm thickness. At 0.42 the arms were narrow enough that a fill
 * texture had almost nowhere to land — the star read as an outline whatever its shading
 * level, which silently cost one of the five attributes a rule can act on. 0.5 is still
 * unmistakably a star (the classic pentagram sits near 0.38, decorative stars run to 0.55)
 * and gives the pattern real area to show in.
 */
function starPolygon(cx: number, cy: number, r: number, angleDeg: number): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 === 0 ? r : r * 0.5;
    const a = ((angleDeg + 36 * i) * Math.PI) / 180;
    pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]);
  }
  return pts;
}

function crossPolygon(cx: number, cy: number, r: number, angleDeg: number): Point[] {
  // A plus sign built from 12 vertices, then rotated as a whole.
  const t = r * 0.36; // half arm thickness
  const raw: Point[] = [
    [-t, -r], [t, -r], [t, -t], [r, -t],
    [r, t], [t, t], [t, r], [-t, r],
    [-t, t], [-r, t], [-r, -t], [-t, -t],
  ];
  const a = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return raw.map(([x, y]) => [cx + x * cos - y * sin, cy + x * sin + y * cos] as Point);
}

/** Vertices of a shape outline, or `null` for shapes drawn as a primitive (circle). */
export function shapeOutline(
  type: ShapeType,
  cx: number,
  cy: number,
  r: number,
  rotation: number,
): Point[] | null {
  if (type === 'circle') return null;
  if (type === 'star') return starPolygon(cx, cy, r, rotation - 90);
  if (type === 'cross') return crossPolygon(cx, cy, r, rotation);
  const sides = POLYGON_SIDES[type];
  if (sides === undefined) return null;
  return regularPolygon(cx, cy, r, sides, rotation + (BASE_ANGLE[type] ?? 0));
}

/**
 * What a shape *looks like*, as a comparable string.
 *
 * Built from the outline the renderer will actually emit, so it collapses every way two records can
 * describe one picture — a symmetry step (`hexagon@60` and `hexagon@120`), and the cross-type case a
 * per-shape symmetry table cannot see at all: a square turned 45° is drawn as the same four points
 * as an upright diamond.
 *
 * Vertices are rounded and sorted, so winding order and starting vertex do not enter the identity;
 * a shape drawn at a fixed radius here compares by form alone, with `size` carried alongside.
 */
export function shapeSignature(shape: Shape): string {
  const pts = shapeOutline(shape.type, 0, 0, 100, shape.rotation);
  const form =
    pts === null
      ? 'circle'
      : pts
          .map(([x, y]) => `${Math.round(x)},${Math.round(y)}`)
          .sort()
          .join(' ');
  return `${form}|${shape.size}|${shape.color}`;
}

/** What a whole figure looks like. See `shapeSignature` — same argument, one level up. */
export function figureSignature(figure: Figure): string {
  return `${figure.layout}:${figure.shapes
    .map((s) => `${shapeSignature(s)}@${s.x.toFixed(3)},${s.y.toFixed(3)}`)
    .sort()
    .join(';')}`;
}

export function pointsAttr(points: Point[]): string {
  // Rounded to 2dp so SSR markup is stable and snapshot-friendly.
  return points.map(([x, y]) => `${round(x)},${round(y)}`).join(' ');
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Textures used to distinguish shading levels without relying on contrast alone. */
export type PatternName = 'dots' | 'hatch' | 'cross' | 'dense';

export type FillStyle =
  | { kind: 'none' }
  | { kind: 'solid'; opacity: number }
  | { kind: 'pattern'; pattern: PatternName; wash: number };

/**
 * How a shading level is painted.
 *
 * Never a hue ramp — that would exclude colour-blind readers. It used to be a pure opacity
 * ramp, which excluded a different group: at 0.12 vs 0.31 the two lightest levels are
 * separable only by fine contrast discrimination, and at grid-3x3 sizes they were not
 * separable at all. Each level now carries **two** redundant cues: a distinct texture and a
 * distinct background wash. Density still increases monotonically with the level, so the
 * Progression and Arithmetic rules remain perceptible as an ordering.
 */
export function fillStyleFor(color: ColorLevel): FillStyle {
  switch (color) {
    case 0:
      return { kind: 'none' };
    case 1:
      return { kind: 'pattern', pattern: 'dots', wash: 0.05 };
    case 2:
      return { kind: 'pattern', pattern: 'hatch', wash: 0.1 };
    case 3:
      return { kind: 'pattern', pattern: 'cross', wash: 0.16 };
    case 4:
      return { kind: 'pattern', pattern: 'dense', wash: 0.24 };
    case 5:
      return { kind: 'solid', opacity: 0.9 };
  }
}

// ---------------------------------------------------------------------------
// Slot layouts — where shapes sit inside the unit box.
// ---------------------------------------------------------------------------

export function slotsFor(layout: SlotLayout): { x: number; y: number }[] {
  switch (layout) {
    case 'center':
      return [{ x: 0.5, y: 0.5 }];
    case 'grid2x2':
      return [
        { x: 0.28, y: 0.28 }, { x: 0.72, y: 0.28 },
        { x: 0.28, y: 0.72 }, { x: 0.72, y: 0.72 },
      ];
    case 'grid3x3': {
      const at = [0.2, 0.5, 0.8];
      const out: { x: number; y: number }[] = [];
      for (const y of at) for (const x of at) out.push({ x, y });
      return out;
    }
  }
}

/** Max radius that keeps a shape inside its slot without colliding with neighbours. */
export function maxRadiusFor(layout: SlotLayout): number {
  switch (layout) {
    case 'center':
      return 33;
    case 'grid2x2':
      return 21;
    case 'grid3x3':
      return 14;
  }
}

/**
 * Radius for a shape given the layout it sits in.
 *
 * Level 5 sits at the layout's cap — large enough to fill its slot without colliding with
 * the neighbours — and each level below divides by `SIZE_RATIO`, so adjacent levels differ
 * by a constant, legible proportion rather than by whatever a linear ramp left over.
 */
export function radiusIn(size: SizeLevel, layout: SlotLayout): number {
  return maxRadiusFor(layout) * SIZE_RATIO[layout] ** (size - 5);
}

/**
 * Geometry of one pattern tile, in figure user units.
 *
 * The tiles are sized so their *ink coverage* forms an even ramp, because coverage is what
 * the reader actually perceives as "more filled". A 9-unit dots tile carrying a 1.5-unit
 * dot covered 8.7% of its area against hatch's 28% — three times lighter than the next
 * step up, which made level 1 read as empty rather than as the lightest fill. It failed
 * worst inside a star, whose arms are narrow enough that a 9-unit lattice could miss them
 * entirely. A 5-unit tile puts roughly four times as many dots in the same area, so even a
 * thin arm catches several.
 *
 * `patternUnits` is `userSpaceOnUse`, so tiles do not scale with the shape: a small tile
 * also means a small shape still gets enough repetitions to read as textured.
 */
export const PATTERN_TILE: Record<PatternName, number> = {
  dots: 5,
  hatch: 8,
  cross: 8,
  dense: 4.5,
};

export type { SlotLayout };

// ---------------------------------------------------------------------------
// Cell grids — polyominoes and unfolded paper sheets.
// ---------------------------------------------------------------------------

export function makeGrid(rows: number, cols: number, fill = false): CellGrid {
  return { rows, cols, cells: new Array(rows * cols).fill(fill) };
}

export function gridGet(g: CellGrid, r: number, c: number): boolean {
  if (r < 0 || c < 0 || r >= g.rows || c >= g.cols) return false;
  return g.cells[r * g.cols + c] ?? false;
}

export function gridSet(g: CellGrid, r: number, c: number, v: boolean): void {
  if (r < 0 || c < 0 || r >= g.rows || c >= g.cols) return;
  g.cells[r * g.cols + c] = v;
}

export function cloneGrid(g: CellGrid): CellGrid {
  return { rows: g.rows, cols: g.cols, cells: [...g.cells] };
}

/** Rotates 90 degrees clockwise. */
export function rotateGrid(g: CellGrid): CellGrid {
  const out = makeGrid(g.cols, g.rows);
  for (let r = 0; r < g.rows; r++) {
    for (let c = 0; c < g.cols; c++) {
      // (r, c) -> (c, rows - 1 - r)
      gridSet(out, c, g.rows - 1 - r, gridGet(g, r, c));
    }
  }
  return out;
}

export function rotateGridTimes(g: CellGrid, times: number): CellGrid {
  let out = cloneGrid(g);
  const n = ((times % 4) + 4) % 4;
  for (let i = 0; i < n; i++) out = rotateGrid(out);
  return out;
}

/** Mirrors left-to-right. */
export function mirrorGrid(g: CellGrid): CellGrid {
  const out = makeGrid(g.rows, g.cols);
  for (let r = 0; r < g.rows; r++) {
    for (let c = 0; c < g.cols; c++) {
      gridSet(out, r, g.cols - 1 - c, gridGet(g, r, c));
    }
  }
  return out;
}

/** Trims empty border rows/columns so shape identity is position-independent. */
export function normaliseGrid(g: CellGrid): CellGrid {
  let minR = g.rows;
  let maxR = -1;
  let minC = g.cols;
  let maxC = -1;
  for (let r = 0; r < g.rows; r++) {
    for (let c = 0; c < g.cols; c++) {
      if (gridGet(g, r, c)) {
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
        if (c < minC) minC = c;
        if (c > maxC) maxC = c;
      }
    }
  }
  if (maxR < 0) return makeGrid(0, 0);
  const out = makeGrid(maxR - minR + 1, maxC - minC + 1);
  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      gridSet(out, r - minR, c - minC, gridGet(g, r, c));
    }
  }
  return out;
}

export function gridKey(g: CellGrid): string {
  const n = normaliseGrid(g);
  return `${n.rows}x${n.cols}:${n.cells.map((b) => (b ? 1 : 0)).join('')}`;
}

/**
 * A grid's identity *including where it sits in its frame*.
 *
 * `gridKey` crops to the bounding box first, which is right for a polyomino — a shape is the same
 * shape wherever it is drawn — and wrong for anything whose frame is part of the answer. A punched
 * sheet is the second kind: two sheets with the same holes in different places are different
 * answers, and cropping made them compare equal, so a whole option set could collapse to a couple of
 * distinct entries and the item would be discarded as unbuildable.
 */
export function gridCellsKey(g: CellGrid): string {
  return `${g.rows}x${g.cols}:${g.cells.map((b) => (b ? 1 : 0)).join('')}`;
}

export function gridsEqual(a: CellGrid, b: CellGrid): boolean {
  return gridKey(a) === gridKey(b);
}

/** The four rotations of a grid, as canonical keys. */
export function rotationKeys(g: CellGrid): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < 4; i++) out.add(gridKey(rotateGridTimes(g, i)));
  return out;
}

/** True if `b` is some rotation of `a` (reflections excluded). */
export function isRotationOf(a: CellGrid, b: CellGrid): boolean {
  return rotationKeys(a).has(gridKey(b));
}

/** True if `b` is a reflection of `a` that is NOT also a plain rotation of it. */
export function isProperMirrorOf(a: CellGrid, b: CellGrid): boolean {
  if (isRotationOf(a, b)) return false;
  return rotationKeys(mirrorGrid(a)).has(gridKey(b));
}

/** A grid is chiral when its mirror image is not one of its own rotations. */
export function isChiral(g: CellGrid): boolean {
  return !rotationKeys(g).has(gridKey(mirrorGrid(g)));
}

export function countFilled(g: CellGrid): number {
  return g.cells.reduce((n, b) => n + (b ? 1 : 0), 0);
}

/** True if all filled cells form one edge-connected region. */
export function isConnected(g: CellGrid): boolean {
  const total = countFilled(g);
  if (total === 0) return false;
  const start = g.cells.findIndex(Boolean);
  const seen = new Set<number>([start]);
  const queue = [start];
  while (queue.length > 0) {
    const idx = queue.pop()!;
    const r = Math.floor(idx / g.cols);
    const c = idx % g.cols;
    const neighbours: [number, number][] = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
    for (const [nr, nc] of neighbours) {
      if (!gridGet(g, nr, nc)) continue;
      const nIdx = nr * g.cols + nc;
      if (seen.has(nIdx)) continue;
      seen.add(nIdx);
      queue.push(nIdx);
    }
  }
  return seen.size === total;
}
