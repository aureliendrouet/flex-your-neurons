/**
 * One analogue clock face.
 *
 * Its own component because three surfaces draw a clock — the live stimulus, the format-card
 * miniature, and the social card, which is a second serialiser in plain strings — and a dial whose
 * hands disagreed between them would be a dial that lies about the item. The geometry itself lives
 * in `lib/clock.ts`; this is the drawing of it.
 *
 * The rotation is applied to the *layout* rather than with a transform on a finished upright clock.
 * That would have been fewer lines and wrong for one reason that matters: the numerals would come
 * out lying on their sides, so a reader would be identifying turned glyphs as well as a turned dial,
 * and glyph identification is not what `clock-spin` measures. Each numeral is placed at its rotated
 * position and drawn upright.
 */
import { handAngles, pointAt, tickAngles } from '../lib/clock';
import { dict, type Locale } from '../lib/i18n';
import type { ClockFace } from '../lib/types';

const R = 46;
const C = 50;

export default function ClockFaceView({
  face,
  locale,
  caption,
  className,
}: {
  face: ClockFace;
  locale: Locale;
  /** Shown under the dial when there is more than one, so "earlier" and "later" are not positional. */
  caption?: string | null;
  className?: string;
}) {
  const t = dict(locale).clock;
  const angles = handAngles(face);
  /*
   * An upright face is named by the time it shows; a turned one by its geometry. Naming the time on
   * a turned face would hand a screen reader the answer, since undoing the rotation *is* the item —
   * while the hand angles are exactly what the picture carries, and leave the same work to do.
   */
  const label =
    face.rotation === 0
      ? t.faceLabel(t.time(face.hour, face.minute))
      : t.turnedFaceLabel(face.rotation, Math.round(angles.hour), Math.round(angles.minute));

  const hourHand = pointAt(C, C, angles.hour, R * 0.52);
  const minuteHand = pointAt(C, C, angles.minute, R * 0.78);

  return (
    <figure class="clock-figure">
      <svg
        class={className ? `clock-face ${className}` : 'clock-face'}
        viewBox="0 0 100 100"
        role="img"
        aria-label={label}
        data-clock-face=""
        data-rotation={String(face.rotation)}
      >
        <circle
          cx={C}
          cy={C}
          r={R}
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-opacity="0.55"
        />
        {tickAngles(face.rotation).map((angle, i) => {
          const quarter = i % 3 === 0;
          const from = pointAt(C, C, angle, R - (quarter ? 9 : 5));
          const to = pointAt(C, C, angle, R - 2);
          const numeral = pointAt(C, C, angle, R - 17);
          return (
            <g key={i}>
              <line
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke="currentColor"
                stroke-width={quarter ? 2.6 : 1.4}
                stroke-opacity={quarter ? 0.85 : 0.45}
                stroke-linecap="round"
              />
              {/*
                * Only the quarters are numbered. Twelve numerals at this size is a smudge, and four
                * is already enough to state the rotation unambiguously — which is the one thing the
                * numerals are here for.
                */}
              {quarter && (
                <text
                  x={numeral.x}
                  y={numeral.y}
                  text-anchor="middle"
                  dominant-baseline="central"
                  font-size="13"
                  font-weight="650"
                  fill="currentColor"
                  data-clock-numeral={String(i === 0 ? 12 : i)}
                >
                  {i === 0 ? 12 : i}
                </text>
              )}
            </g>
          );
        })}
        {/*
          * Short and thick against long and thin: the only thing that says which hand is which, and
          * it is deliberately not colour.
          */}
        <line
          x1={C}
          y1={C}
          x2={hourHand.x}
          y2={hourHand.y}
          stroke="currentColor"
          stroke-width="4.5"
          stroke-linecap="round"
          data-clock-hand="hour"
        />
        <line
          x1={C}
          y1={C}
          x2={minuteHand.x}
          y2={minuteHand.y}
          stroke="currentColor"
          stroke-width="2.4"
          stroke-linecap="round"
          data-clock-hand="minute"
        />
        <circle cx={C} cy={C} r="3" fill="currentColor" />
      </svg>
      {caption && <figcaption class="subtle clock-caption">{caption}</figcaption>}
    </figure>
  );
}
