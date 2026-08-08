/**
 * A tiny inline trend, for the per-type rows of the progress table.
 *
 * No axes and no labels: at this size they would be unreadable, and the row already says
 * what the numbers are. The sparkline answers one question — is this getting better? — so
 * it also draws a faint 50% reference line to anchor the shape.
 */
interface Props {
  /** Accuracy per bucket, 0..1, oldest first. */
  values: number[];
  label: string;
  testid?: string;
}

const W = 64;
const H = 20;
const PAD = 2;

export default function Sparkline({ values, label, testid }: Props) {
  if (values.length < 2) {
    return (
      <span class="subtle" aria-label={label} data-testid={testid} data-points={String(values.length)}>
        —
      </span>
    );
  }

  const plotW = W - PAD * 2;
  const plotH = H - PAD * 2;
  const x = (i: number) => PAD + (i / (values.length - 1)) * plotW;
  const y = (v: number) => PAD + (1 - Math.min(1, Math.max(0, v))) * plotH;

  const path = values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const last = values[values.length - 1]!;
  const first = values[0]!;
  const rising = last >= first;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      role="img"
      aria-label={label}
      data-testid={testid}
      data-points={String(values.length)}
      data-trend={rising ? 'up' : 'down'}
      style={{ color: 'var(--text)', verticalAlign: 'middle' }}
    >
      <line
        x1={PAD}
        y1={y(0.5)}
        x2={W - PAD}
        y2={y(0.5)}
        stroke="currentColor"
        stroke-opacity={0.12}
        stroke-width={1}
        stroke-dasharray="2 2"
      />
      <path
        d={path}
        fill="none"
        stroke={rising ? 'var(--correct)' : 'var(--text-muted)'}
        stroke-width={1.6}
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <circle cx={x(values.length - 1)} cy={y(last)} r={1.9} fill={rising ? 'var(--correct)' : 'var(--text-muted)'} />
    </svg>
  );
}
