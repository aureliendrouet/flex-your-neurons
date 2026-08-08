/**
 * A small line chart, hand-written as inline SVG.
 *
 * No charting library, for the reason recorded in docs/LIBRARIES.md §3: a canvas is an
 * opaque bitmap to both Playwright and a screen reader, and these charts are simple enough
 * that the library would cost more than it saves. Every series is also exposed as
 * `data-points` so a test can read the values back.
 */
import { linePath, normalise, type Scale } from '../../lib/charts';

export interface Series {
  id: string;
  label: string;
  /** `null` leaves a gap rather than drawing through a missing value. */
  values: (number | null)[];
  /** CSS colour. Dashed series are drawn thinner and without dots. */
  dashed?: boolean;
  showDots?: boolean;
}

interface Props {
  series: Series[];
  scale: Scale;
  /** One label per x position; only the first and last are drawn. */
  xLabels: string[];
  /** Renders a y-axis tick value. */
  formatY: (value: number) => string;
  label: string;
  testid: string;
  /** Drawn when there is not enough history yet. */
  emptyMessage?: string;
  height?: number;
}

const W = 320;
const PAD = { top: 10, right: 8, bottom: 20, left: 38 };

export default function TrendChart({
  series,
  scale,
  xLabels,
  formatY,
  label,
  testid,
  emptyMessage,
  height = 130,
}: Props) {
  const H = height;
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const count = Math.max(...series.map((s) => s.values.length), 0);

  if (count === 0) {
    return (
      <p class="muted chart-empty" data-testid={`${testid}-empty`}>
        {emptyMessage}
      </p>
    );
  }

  // A single point has no line to draw, so it is placed in the middle of the plot.
  const xAt = (i: number) => (count === 1 ? PAD.left + plotW / 2 : PAD.left + (i / (count - 1)) * plotW);
  const yAt = (v: number) => PAD.top + (1 - normalise(v, scale)) * plotH;

  const ticks = [scale.min, (scale.min + scale.max) / 2, scale.max];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      class="chart-svg"
      role="img"
      aria-label={label}
      data-testid={testid}
      data-points={String(count)}
    >
      {ticks.map((tick) => {
        const y = yAt(tick);
        return (
          <g key={tick}>
            <line
              x1={PAD.left}
              y1={y}
              x2={W - PAD.right}
              y2={y}
              stroke="currentColor"
              stroke-opacity={0.12}
              stroke-width={1}
            />
            <text
              x={PAD.left - 6}
              y={y + 3.5}
              text-anchor="end"
              font-size="9"
              fill="currentColor"
              opacity={0.6}
            >
              {formatY(tick)}
            </text>
          </g>
        );
      })}

      {series.map((s) => {
        // Split on nulls so a gap in the data is a gap in the line, not a straight jump.
        const segments: { x: number; y: number }[][] = [];
        let current: { x: number; y: number }[] = [];
        s.values.forEach((v, i) => {
          if (v === null) {
            if (current.length > 0) segments.push(current);
            current = [];
            return;
          }
          current.push({ x: xAt(i), y: yAt(v) });
        });
        if (current.length > 0) segments.push(current);

        return (
          <g
            key={s.id}
            data-series={s.id}
            data-values={s.values.map((v) => (v === null ? '' : Math.round(v * 1000) / 1000)).join(',')}
          >
            {segments.map((points, i) =>
              points.length === 1 ? null : (
                <path
                  key={i}
                  d={linePath(points)}
                  fill="none"
                  stroke={s.dashed ? 'currentColor' : 'var(--accent)'}
                  stroke-opacity={s.dashed ? 0.45 : 1}
                  stroke-width={s.dashed ? 1.5 : 2}
                  stroke-dasharray={s.dashed ? '4 3' : undefined}
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              ),
            )}
            {(s.showDots ?? !s.dashed) &&
              segments.flat().map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={2.6} fill="var(--accent)" />
              ))}
          </g>
        );
      })}

      {xLabels.length > 0 && (
        <>
          <text x={PAD.left} y={H - 6} font-size="9" fill="currentColor" opacity={0.6}>
            {xLabels[0]}
          </text>
          {xLabels.length > 1 && (
            <text
              x={W - PAD.right}
              y={H - 6}
              text-anchor="end"
              font-size="9"
              fill="currentColor"
              opacity={0.6}
            >
              {xLabels[xLabels.length - 1]}
            </text>
          )}
        </>
      )}
    </svg>
  );
}
