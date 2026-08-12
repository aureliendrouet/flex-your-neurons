/**
 * Neurone, and the thing it says.
 *
 * The site is deliberately quiet — one accent hue rotated into families, figures drawn in
 * `currentColor`, motion that decelerates and never overshoots — and quiet reads as cold when
 * there is nothing on the page that acknowledges a person is doing something difficult. The
 * mascot is the acknowledgement. It is also the only thing here that is purely decorative, so it
 * is held to a stricter rule than everything else: it may not move, cover, or compete with an
 * item, and it may not appear during a measurement.
 *
 * Three constraints are structural rather than stylistic, and each is enforced below.
 *
 * *The drawing is decorative; the words are content.* The sprite is `alt=""` and
 * `aria-hidden` — describing a cartoon neuron to someone who cannot see it costs them time and
 * tells them nothing they need. The bubble is real text in the document: selectable, translated,
 * reflowable, and read out in reading order. Nothing about the verdict is carried by the picture
 * alone, which is the same rule the figures follow when they distinguish themselves by texture
 * rather than by hue.
 *
 * *The bubble is built, not drawn.* Baking the balloon into the artwork would fix its width in a
 * language whose strings run about a fifth longer, would put untranslatable pixels in front of a
 * screen reader, and would need a redraw for every line. It is a div with the site's own tokens.
 *
 * *The line is deterministic.* Picked by hashing a seed, never at random. A run on this site is
 * reproducible from `(type, seed, difficulty)` — that is the site's most distinctive property and
 * `tests/i18n.test.ts` exists to defend it. A mascot that said something different on each replay
 * of the same seed would be the one element on the page that broke it, and it would break the
 * end-to-end tests intermittently, which is the worst way to find out.
 */
import type { ComponentChildren } from 'preact';
import { dict, type Locale } from '../lib/i18n';
import { hashSeed } from '../lib/rng';

/**
 * The occasions the mascot speaks on.
 *
 * A moment, not a pose. The copy is keyed to the occasion because that is what has to be
 * translated; which drawing goes with it is this file's business, and the indirection is what
 * lets the artwork be redrawn or re-cast without touching two dictionaries.
 */
export type MascotMoment = 'home' | 'practice' | 'correct' | 'wrong' | 'results' | 'progressEmpty';

/**
 * Moment to sprite.
 *
 * `thinking` is drawn and built but deliberately unused: the only place it fits is beside a live
 * item, which is the one place the mascot is not allowed to be.
 */
const POSE: Record<MascotMoment, string> = {
  home: 'idle',
  practice: 'pointing',
  correct: 'correct',
  wrong: 'wrong',
  results: 'celebrate',
  progressEmpty: 'asleep',
};

/**
 * Rendered width in CSS pixels. The sprites are 360×420 device pixels, so every size here is
 * served at 2× or better and none is ever upscaled.
 */
const SIZE = { sm: 64, md: 96, lg: 140 } as const;

interface Props {
  locale: Locale;
  moment: MascotMoment;
  /**
   * Chooses the line, by hash. Pass the item or session seed and a replay says the same thing it
   * said the first time. Omitted — on pages with no seed to speak of, like the home page — the
   * first line of the bank is used, which is why the first entry in each bank is the one that
   * reads best cold.
   */
  seed?: string;
  size?: keyof typeof SIZE;
  /**
   * Content placed inside the bubble ahead of the line, rather than instead of it.
   *
   * The quiz uses this to put the verdict in the bubble. Its feedback panel has to state the
   * outcome in fixed, unambiguous words — a reader who got an item wrong needs to know that
   * without parsing a mascot's tone, and six end-to-end specs assert the exact string — so the
   * verdict leads and the rotating line follows it as a second sentence.
   *
   * A prefix rather than a replacement, so that choosing the line stays this component's job. The
   * first version let the caller pass whole bubble contents, which meant any caller wanting both
   * the verdict *and* a line had to reach into `t.mascot.lines` and index it themselves — putting
   * a second, quietly different copy of the seed-hashing rule in the quiz.
   */
  prefix?: ComponentChildren;
  /** Extra classes on the wrapper, for the handful of layouts that need to place it. */
  className?: string;
}

/** The bank entry for this moment and seed. */
function pickLine(lines: readonly string[], seed?: string): string {
  if (lines.length === 0) return '';
  /* The index is in range by construction; the fallback is for `noUncheckedIndexedAccess`. */
  return lines[seed === undefined ? 0 : hashSeed(seed) % lines.length] ?? '';
}

export default function Mascot({ locale, moment, seed, size = 'md', prefix, className }: Props) {
  const t = dict(locale);
  const line = pickLine(t.mascot.lines[moment], seed);
  const width = SIZE[size];

  /*
   * `import.meta.env.BASE_URL` rather than a bare `/mascot/…`: the site deploys under a path
   * prefix, and a root-absolute URL here 404s in production while working perfectly in dev.
   */
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');

  return (
    <div
      class={`mascot ${className ?? ''}`}
      data-moment={moment}
      data-testid={`mascot-${moment}`}
      /*
       * The size travels as a custom property rather than as an inline `width`. An inline width
       * is a specificity wall: the narrow-screen rule that has to shrink the figure could only
       * beat it with `!important`. As a property it is simply a default the stylesheet overrides.
       */
      style={`--mascot-width: ${width}px`}
    >
      <img
        class="mascot-figure"
        src={`${base}/mascot/neuron-${POSE[moment]}.webp`}
        /*
         * Intrinsic size, not display size, so the box is reserved before the sprite arrives and
         * the bubble beside it does not jump when it does. The height follows from the CSS.
         */
        width={360}
        height={420}
        alt=""
        aria-hidden="true"
        /* Never in the first paint of any page it appears on; the item always outranks it. */
        loading="lazy"
        decoding="async"
      />
      <div class="mascot-bubble">
        {prefix !== undefined && <>{prefix} </>}
        {line}
        {/*
         * The tail, as a shape rather than as a character. A CSS triangle inherits the bubble's
         * border and background tokens, so it stays correct in both themes and through any future
         * change to either — which a "◀" in the text never would, and which would also be read
         * out as a word.
         */}
        <span class="mascot-bubble-tail" aria-hidden="true" />
      </div>
    </div>
  );
}
