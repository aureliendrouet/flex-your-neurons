/**
 * The hand that was played at you, in rock-paper-scissors.
 *
 * The outlines live in `lib/hands.ts` and are shared with the social card, for the same reason the
 * clock geometry is shared: a hand drawn differently in two places is two different claims about
 * one item. Filled faintly and outlined firmly, in `currentColor` only — the three are told apart by
 * silhouette, never by hue.
 */
import { HAND_DRAWINGS } from '../lib/hands';
import { dict, type Locale } from '../lib/i18n';
import type { Hand } from '../lib/types';

export default function HandView({
  hand,
  locale,
  className,
}: {
  hand: Hand;
  locale: Locale;
  className?: string;
}) {
  const t = dict(locale).quiz.hands;
  const drawing = HAND_DRAWINGS[hand];
  return (
    <svg
      class={className ? `hand-figure ${className}` : 'hand-figure'}
      viewBox="0 0 100 100"
      role="img"
      aria-label={t.shownLabel(t[hand])}
      data-hand={hand}
    >
      <path
        d={drawing.body}
        fill="currentColor"
        fill-opacity="0.14"
        stroke="currentColor"
        stroke-width="3"
        stroke-linejoin="round"
      />
      <path
        d={drawing.detail}
        fill="none"
        stroke="currentColor"
        stroke-width="3"
        stroke-linecap="round"
        stroke-opacity="0.75"
      />
    </svg>
  );
}
