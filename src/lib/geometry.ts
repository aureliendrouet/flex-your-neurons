/**
 * Pure geometry for the figural vocabulary.
 *
 * Everything renders to inline SVG rather than canvas: an SVG node carries semantic
 * `data-*` attributes that Playwright can assert on and a screen reader can be given a
 * label for, whereas a canvas is an opaque bitmap (docs/LIBRARIES.md §3).
 */
import type { CellGrid, ColorLevel, ShapeType, SizeLevel, SlotLayout } from './types';

/** Every figure is drawn in a 100x100 user-space box. */
export const VIEWBOX = 100;

/**
 * Radius in user units for each size level.
 *
 * Roughly geometric, with a ~1.3x ratio between adjacent levels. A linear ramp made the
 * top of the scale nearly indistinguishable (26 vs 33 is a 27% step at the largest sizes,
 * where it is hardest to judge), and adjacent levels are what the Progression rule
 * actually asks the reader to tell apart.
 */
const SIZE_RADIUS: Record<SizeLevel, number> = { 1: 11, 2: 15, 3: 20.5, 4: 27, 5: 35 };

export function radiusFor(size: SizeLevel): number {
  return SIZE_RADIUS[size];
}

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

export type Point = readonly [number, number];

function regularPolygon(cx: number, cy: number, r: number, sides: number, angleDeg: number): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i < sides; i++) {
    const a = ((angleDeg + (360 / sides) * i) * Math.PI) / 180;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

function starPolygon(cx: number, cy: number, r: number, angleDeg: number): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 === 0 ? r : r * 0.42;
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
 * Smallest radius a layout will draw, as a fraction of its cap.
 *
 * Scaling the full 11..35 range down by the layout cap made the smallest shapes vanish:
 * at 3x3 a level-1 shape came out at ~4 user units, a handful of pixels on screen. The
 * size *ordering* is what the Size rule needs, not the full dynamic range, so tighter
 * layouts compress the range upwards from a floor instead.
 */
const SIZE_FLOOR: Record<SlotLayout, number> = {
  center: 0.31,
  grid2x2: 0.5,
  grid3x3: 0.62,
};

/**
 * Radius for a shape given the layout it sits in. Sizes stay *relatively* ordered
 * (which is what the Size rule depends on) while being scaled down enough that
 * neighbouring slots never collide, and never below a visible floor.
 */
export function radiusIn(size: SizeLevel, layout: SlotLayout): number {
  const cap = maxRadiusFor(layout);
  const floor = cap * SIZE_FLOOR[layout];
  const span = SIZE_RADIUS[5] - SIZE_RADIUS[1];
  const t = (SIZE_RADIUS[size] - SIZE_RADIUS[1]) / span;
  return floor + t * (cap - floor);
}

/** Geometry of one pattern tile, in figure user units. */
export const PATTERN_TILE: Record<PatternName, number> = {
  dots: 9,
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
