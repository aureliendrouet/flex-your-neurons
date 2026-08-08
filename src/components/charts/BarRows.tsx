/**
 * Horizontal bars for a handful of named categories.
 *
 * Used for both the CHC profile and the mistake breakdown, which are the same job — compare
 * magnitudes across a few labelled things — and so should be the same chart. Deliberate
 * choices, each of which is a rule from a checklist rather than a preference:
 *
 * - **One colour for every bar.** These are nominal categories, so shading each bar
 *   darker-where-bigger would double-encode bar length as hue, spend the only free channel
 *   on information the chart already shows, and read as an ordering that is not there.
 * - **No legend.** One series; the heading above already says what is plotted, and a box
 *   with a single swatch just restates it.
 * - **Value at the tip of each bar, label at the left.** Six or fewer rows, so every value
 *   fits outside the mark — nothing is clipped, and nothing is gated behind a tooltip.
 * - **A hairline baseline, solid.** A dashed rule reads as a threshold; there isn't one.
 * - **Thin bars with air around them**, and a track behind each one so a short bar still
 *   shows where its row is.
 */
interface Row {
  /** Category name, already translated. */
  label: string;
  /** 0..1. */
  value: number;
  /** Formatted value, drawn at the bar's tip. */
  display: string;
  /** Tooltip text: the value plus whatever qualifies it. */
  title: string;
  /**
   * `true` when the row has too little data to be read. Drawn faded rather than hidden —
   * hiding it would imply the category does not exist, and the honest report is "not enough
   * yet", which is a different statement.
   */
  provisional?: boolean;
  /** Stable key for `data-*` hooks. */
  key: string;
}

interface Props {
  rows: Row[];
  label: string;
  testid: string;
  /** Width reserved for the category names, in user units. */
  labelWidth?: number;
}

const ROW_HEIGHT = 34;
/** Capped rather than filling the row: the leftover band is the breathing room. */
const BAR_HEIGHT = 14;
const BAR_WIDTH = 300;
const VALUE_GUTTER = 56;

export default function BarRows({ rows, label, testid, labelWidth = 150 }: Props) {
  if (rows.length === 0) return null;
  const height = rows.length * ROW_HEIGHT + 8;
  const width = labelWidth + BAR_WIDTH + VALUE_GUTTER;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      class="bar-rows"
      role="img"
      aria-label={label}
      data-testid={testid}
      data-rows={String(rows.length)}
    >
      {rows.map((row, i) => {
        const y = i * ROW_HEIGHT + 4;
        const barY = y + (ROW_HEIGHT - BAR_HEIGHT) / 2 - 4;
        // A floor of 2px so a zero-valued row still reads as a row rather than as a gap.
        const filled = Math.max(2, BAR_WIDTH * row.value);
        return (
          <g
            key={row.key}
            data-bar={row.key}
            data-value={row.value.toFixed(3)}
            data-provisional={row.provisional ? 'true' : undefined}
            opacity={row.provisional ? 0.45 : 1}
          >
            <title>{row.title}</title>
            <text x={0} y={y + 17} font-size="12" fill="currentColor" opacity={0.75}>
              {row.label}
            </text>
            <rect
              x={labelWidth}
              y={barY}
              width={BAR_WIDTH}
              height={BAR_HEIGHT}
              rx={BAR_HEIGHT / 2}
              fill="currentColor"
              opacity={0.08}
            />
            {/*
             * Square at the baseline, rounded at the data end — the shape says which end is
             * the measurement and which end is the origin.
             */}
            <path
              d={roundedRight(labelWidth, barY, filled, BAR_HEIGHT, 4)}
              fill="var(--accent)"
            />
            <text
              x={labelWidth + BAR_WIDTH + 8}
              y={y + 17}
              font-size="12"
              fill="currentColor"
              opacity={0.75}
              font-variant-numeric="tabular-nums"
            >
              {row.display}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** A bar with its right-hand corners rounded and its left-hand ones square. */
function roundedRight(x: number, y: number, w: number, h: number, r: number): string {
  const radius = Math.min(r, w / 2, h / 2);
  return [
    `M ${x} ${y}`,
    `H ${x + w - radius}`,
    `A ${radius} ${radius} 0 0 1 ${x + w} ${y + radius}`,
    `V ${y + h - radius}`,
    `A ${radius} ${radius} 0 0 1 ${x + w - radius} ${y + h}`,
    `H ${x}`,
    'Z',
  ].join(' ');
}
