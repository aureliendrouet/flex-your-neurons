/**
 * Items answered per day, as a bar chart.
 *
 * Every day gets a slot whether or not anything happened in it, so an irregular habit
 * cannot be made to look continuous by omitting the gaps. A rest day is marked with a stub
 * on the baseline rather than a full-height track: a track tall enough to locate the day
 * is also tall enough to be misread as activity, which is the opposite of the point.
 */
import type { DayBucket } from '../../lib/charts';

interface Props {
  days: DayBucket[];
  label: string;
  /** Formats a day for the tooltip and the accessible label. */
  formatDay: (date: number) => string;
  /** "12 items, 9 correct" for the tooltip. */
  describeDay: (items: number, correct: number) => string;
  emptyMessage: string;
  xFirst: string;
  xLast: string;
}

const W = 320;
const H = 96;
const PAD = { top: 8, right: 4, bottom: 16, left: 4 };

export default function ActivityChart({
  days,
  label,
  formatDay,
  describeDay,
  emptyMessage,
  xFirst,
  xLast,
}: Props) {
  const max = Math.max(...days.map((d) => d.items), 0);

  if (max === 0) {
    return (
      <p class="muted" data-testid="activity-chart-empty" style={{ margin: 0, fontSize: '0.92rem' }}>
        {emptyMessage}
      </p>
    );
  }

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = plotW / days.length;
  const barW = Math.max(1.5, slot * 0.7);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height: 'auto', color: 'var(--text)', display: 'block' }}
      role="img"
      aria-label={label}
      data-testid="activity-chart"
      data-days={String(days.length)}
      data-max={String(max)}
    >
      <line
        x1={PAD.left}
        y1={PAD.top + plotH}
        x2={W - PAD.right}
        y2={PAD.top + plotH}
        stroke="currentColor"
        stroke-opacity={0.15}
        stroke-width={1}
      />
      {days.map((day) => {
        const i = days.indexOf(day);
        const x = PAD.left + i * slot + (slot - barW) / 2;
        const h = day.items === 0 ? 0 : Math.max(2, (day.items / max) * plotH);
        return (
          <g key={day.day} data-day={day.day} data-items={String(day.items)}>
            {day.items === 0 && (
              <rect
                x={x}
                y={PAD.top + plotH - 1.5}
                width={barW}
                height={1.5}
                fill="currentColor"
                fill-opacity={0.18}
                data-rest-day=""
              />
            )}
            {day.items > 0 && (
              <rect
                x={x}
                y={PAD.top + plotH - h}
                width={barW}
                height={h}
                rx={1.5}
                fill="var(--accent)"
              >
                <title>{`${formatDay(day.date)} — ${describeDay(day.items, day.correct)}`}</title>
              </rect>
            )}
          </g>
        );
      })}
      <text x={PAD.left} y={H - 4} font-size="9" fill="currentColor" opacity={0.6}>
        {xFirst}
      </text>
      <text
        x={W - PAD.right}
        y={H - 4}
        text-anchor="end"
        font-size="9"
        fill="currentColor"
        opacity={0.6}
      >
        {xLast}
      </text>
    </svg>
  );
}
