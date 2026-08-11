/**
 * Renders a CellGrid — a polyomino, or a punched sheet of paper — as inline SVG.
 *
 * Filled cells carry `data-filled="true"` so tests can read the pattern back exactly.
 *
 * Note that every presentation attribute below is kebab-case. Preact forwards unknown
 * camelCase props straight to `setAttribute`, and SVG attribute names are case-sensitive,
 * so `fillOpacity` would be silently ignored and every cell would paint solid.
 */
import { dict, type Locale } from '../lib/i18n';
import type { CellGrid } from '../lib/types';

interface Props {
  grid: CellGrid;
  /** 'solid' for polyominoes, 'holes' for punched paper (outline + circular holes). */
  variant?: 'solid' | 'holes';
  label?: string;
  className?: string;
}

const CELL = 20;
const PAD = 4;

export default function GridView({ grid, variant = 'solid', label, className }: Props) {
  const w = grid.cols * CELL + PAD * 2;
  const h = grid.rows * CELL + PAD * 2;

  const cells: preact.JSX.Element[] = [];
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      const filled = grid.cells[r * grid.cols + c] ?? false;
      const x = PAD + c * CELL;
      const y = PAD + r * CELL;

      if (variant === 'holes') {
        // The sheet itself is always drawn; a punch is a hole through it.
        cells.push(
          <rect
            key={`s${r}-${c}`}
            x={x}
            y={y}
            width={CELL}
            height={CELL}
            fill="none"
            stroke="currentColor"
            stroke-width={1}
            stroke-opacity={0.35}
            data-cell=""
            data-row={String(r)}
            data-col={String(c)}
            data-filled={String(filled)}
          />,
        );
        if (filled) {
          cells.push(
            <circle
              key={`h${r}-${c}`}
              cx={x + CELL / 2}
              cy={y + CELL / 2}
              r={CELL * 0.28}
              fill="currentColor"
              data-hole=""
            />,
          );
        }
        continue;
      }

      cells.push(
        <rect
          key={`${r}-${c}`}
          x={x}
          y={y}
          width={CELL}
          height={CELL}
          fill="currentColor"
          fill-opacity={filled ? 0.85 : 0}
          stroke="currentColor"
          stroke-width={filled ? 1.5 : 0.5}
          stroke-opacity={filled ? 1 : 0.15}
          data-cell=""
          data-row={String(r)}
          data-col={String(c)}
          data-filled={String(filled)}
        />,
      );
    }
  }

  return (
    <svg
      class={className ?? 'figure-svg'}
      viewBox={`0 0 ${w} ${h}`}
      role={label ? 'img' : 'presentation'}
      aria-label={label}
      aria-hidden={label ? undefined : 'true'}
      data-grid=""
      data-variant={variant}
      data-rows={String(grid.rows)}
      data-cols={String(grid.cols)}
      data-pattern={grid.cells.map((b) => (b ? 1 : 0)).join('')}
    >
      {cells}
    </svg>
  );
}

/**
 * A grid described row by row, for screen readers and test assertions.
 *
 * The sibling of `describeFigure`, and it exists for the same reason: the previous label was the
 * cell *count* alone, so every option of a rotation or paper-folding item read as "a shape of 6
 * cells" and the item could not be answered without seeing it. Position is the whole content of both
 * formats — a polyomino is a shape, a punched sheet is a set of places — so the description has to
 * carry it.
 */
export function describeGrid(grid: CellGrid, locale: Locale): string {
  const t = dict(locale).quiz;
  const rows: string[] = [];
  for (let r = 0; r < grid.rows; r++) {
    const columns: number[] = [];
    for (let c = 0; c < grid.cols; c++) {
      if (grid.cells[r * grid.cols + c]) columns.push(c + 1);
    }
    rows.push(columns.length === 0 ? '' : t.gridRowCells(columns));
  }
  return t.describeGrid(rows, grid.cells.filter(Boolean).length);
}
