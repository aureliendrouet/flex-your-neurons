/**
 * Accuracy against median response time — one dot per item format.
 *
 * This is the one view on the page that says something neither number says alone. Accuracy
 * tells you whether a format is understood; median time tells you whether it is *fluent*.
 * Plotted against each other, a format that is 90% correct at nine seconds and one that is
 * 90% correct at forty seconds stop looking identical, and the speed/accuracy trade-off — the
 * thing a reader is actually managing — becomes visible.
 *
 * Design notes, each of them a rule rather than a taste:
 *
 * - **One hue, not ten.** Identity comes from a direct label on the extremes and from the
 *   tooltip and the table below, never from a ten-colour categorical palette: past about
 *   eight, adjacent hues are indistinguishable under colour-vision deficiency, and this site
 *   takes that constraint seriously enough to have banned hue inside its figures entirely.
 * - **One y-axis.** Two measures on one plot with two scales would invent a correlation
 *   that is not in the data. Both axes here are the plot's own dimensions, not a second
 *   scale bolted on.
 * - **Selective labels.** Ten labels collide; two do not. The quickest and the most accurate
 *   format are named on the plot, and everything else is a dot with a tooltip and a row in
 *   the table underneath.
 * - **A surface ring on every dot**, so overlapping formats stay countable.
 */
import { formatDuration, formatPercent } from '../../lib/scoring';
import { normalise } from '../../lib/charts';
import type { Locale } from '../../lib/i18n';

export interface SpeedPoint {
  key: string;
  name: string;
  accuracy: number;
  medianLatencyMs: number;
  attempts: number;
}

interface Props {
  points: SpeedPoint[];
  locale: Locale;
  label: string;
  axisX: string;
  axisY: string;
  emptyMessage: string;
  fastestLabel: string;
  mostAccurateLabel: string;
  describePoint: (name: string, accuracy: string, time: string, attempts: number) => string;
}

/**
 * A range that spans the data with a tenth of the span as margin at each end, so no point
 * ever sits on the axis line. Degenerate input — every format at the same median — widens to
 * a fixed window rather than collapsing to a zero-width scale that would divide by zero.
 */
function padScale(min: number, max: number): { min: number; max: number } {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1 };
  const span = max - min;
  if (span <= 0) return { min: Math.max(0, min - 1000), max: max + 1000 };
  const margin = span * 0.12;
  return { min: Math.max(0, min - margin), max: max + margin };
}

const W = 340;
const H = 220;
const PAD = { top: 12, right: 16, bottom: 34, left: 42 };
/** r = 5, so the mark clears the 8px minimum with its ring. */
const DOT = 5;

export default function SpeedAccuracy({
  points,
  locale,
  label,
  axisX,
  axisY,
  emptyMessage,
  fastestLabel,
  mostAccurateLabel,
  describePoint,
}: Props) {
  /*
   * Two formats is the minimum at which "against" means anything: a single dot has nothing
   * to trade off against and would read as a claim about one format's position on an
   * absolute scale, which these axes cannot support.
   */
  if (points.length < 2) {
    return (
      <p class="muted chart-empty" data-testid="speed-chart-empty">
        {emptyMessage}
      </p>
    );
  }

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  /*
   * The time axis spans the data with a margin, rather than starting at zero.
   *
   * Zero-baselining is the right default for a *length* encoding, where the bar's size is the
   * quantity — but here position is the encoding and the reading is comparative: with a
   * from-zero axis, ten formats between eight and twelve seconds all pile into the left third
   * and the chart says nothing. Both ends of the axis are labelled with their actual values,
   * so the scale is stated rather than implied.
   */
  const times = points.map((p) => p.medianLatencyMs);
  const timeScale = padScale(Math.min(...times), Math.max(...times));

  /*
   * Accuracy, by contrast, keeps its full 0–100% axis. It is a proportion with a meaningful
   * floor, and cropping it would magnify small differences into apparent gulfs — exactly the
   * overstatement this site exists not to make.
   */
  const accuracyScale = { min: 0, max: 1 };

  const at = (p: SpeedPoint) => ({
    x: PAD.left + normalise(p.medianLatencyMs, timeScale) * plotW,
    y: PAD.top + plotH - normalise(p.accuracy, accuracyScale) * plotH,
  });

  // The two extremes get names; the rest get the tooltip and the table row.
  const fastest = points.reduce((a, b) => (b.medianLatencyMs < a.medianLatencyMs ? b : a));
  const strongest = points.reduce((a, b) => (b.accuracy > a.accuracy ? b : a));
  const extremes = [
    { point: strongest, text: mostAccurateLabel },
    { point: fastest, text: fastestLabel },
    // If one format is both the quickest and the most accurate, name it once.
  ].filter((entry, i, all) => all.findIndex((e) => e.point.key === entry.point.key) === i);

  return (
    <figure class="scatter-figure">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        class="chart-svg"
        role="img"
        aria-label={label}
        data-testid="speed-accuracy-chart"
        data-points={String(points.length)}
      >
        {/* Hairline, solid, one step off the surface: a grid, not a threshold. */}
        {[0, 0.5, 1].map((tick) => {
          const y = PAD.top + plotH - tick * plotH;
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
                y={y + 3}
                text-anchor="end"
                font-size="9"
                fill="currentColor"
                opacity={0.6}
                font-variant-numeric="tabular-nums"
              >
                {formatPercent(tick, locale)}
              </text>
            </g>
          );
        })}

        {points.map((point) => {
          const { x, y } = at(point);
          const extreme = point.key === fastest.key || point.key === strongest.key;
          return (
            <g
              key={point.key}
              data-format={point.key}
              data-accuracy={point.accuracy.toFixed(3)}
              data-extreme={extreme ? '' : undefined}
            >
              <title>
                {describePoint(
                  point.name,
                  formatPercent(point.accuracy, locale),
                  formatDuration(point.medianLatencyMs, locale),
                  point.attempts,
                )}
              </title>
              {/*
               * A generous transparent target: the visible dot is 10px across, which is far
               * too small to have to land on dead-centre.
               */}
              <circle cx={x} cy={y} r={13} fill="transparent" />
              <circle cx={x} cy={y} r={DOT + 2} fill="var(--bg-raised)" />
              <circle cx={x} cy={y} r={DOT} fill="var(--accent)" />
              {/* The two named formats get a halo, so the caption below has something to
                  point at without any text crossing the plot. */}
              {extreme && (
                <circle
                  cx={x}
                  cy={y}
                  r={DOT + 4}
                  fill="none"
                  stroke="var(--accent)"
                  stroke-width={1.5}
                  stroke-opacity={0.55}
                />
              )}
            </g>
          );
        })}

        <line
          x1={PAD.left}
          y1={PAD.top + plotH}
          x2={W - PAD.right}
          y2={PAD.top + plotH}
          stroke="currentColor"
          stroke-opacity={0.2}
          stroke-width={1}
        />
        <text
          x={PAD.left}
          y={H - 16}
          font-size="9"
          fill="currentColor"
          opacity={0.6}
          font-variant-numeric="tabular-nums"
        >
          {formatDuration(timeScale.min, locale)}
        </text>
        <text
          x={W - PAD.right}
          y={H - 16}
          text-anchor="end"
          font-size="9"
          fill="currentColor"
          opacity={0.6}
          font-variant-numeric="tabular-nums"
        >
          {formatDuration(timeScale.max, locale)}
        </text>
        <text
          x={PAD.left + plotW / 2}
          y={H - 4}
          text-anchor="middle"
          font-size="9"
          fill="currentColor"
          opacity={0.55}
        >
          {axisX}
        </text>
        <text
          x={10}
          y={PAD.top + plotH / 2}
          text-anchor="middle"
          font-size="9"
          fill="currentColor"
          opacity={0.55}
          transform={`rotate(-90 10 ${PAD.top + plotH / 2})`}
        >
          {axisY}
        </text>
      </svg>

      {/*
       * The two extremes are named *beside* the plot rather than on it.
       *
       * Ten dots in a cluster leaves no reliable empty space for text: an in-plot label
       * either overlaps a neighbouring dot or gets clipped by the viewBox, and nudging it
       * clear detaches it from the dot it describes. A caption with a haloed marker keeps
       * the identity and cannot collide with anything.
       */}
      <figcaption class="scatter-caption subtle">
        {extremes.map(({ point, text }) => (
          <span class="scatter-note" key={point.key} data-extreme-note={point.key}>
            <span class="scatter-swatch" aria-hidden="true" />
            {`${point.name} — ${text}`}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
