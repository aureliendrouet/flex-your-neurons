/**
 * The seed, as a thing you can see and pass on.
 *
 * Replaying an exact run in either language is this site's most distinctive capability, and
 * before this it surfaced only as a URL parameter — you had to notice `?seed=` in the
 * address bar to know it existed. A monospace chip with a copy affordance turns an
 * implementation detail into an offer.
 *
 * What is copied is a *link*, not the eight characters: a bare seed is useless without
 * knowing which page to paste it into, and the whole point is that the recipient just
 * opens it. The seed itself stays visible because it is short enough to read out loud,
 * which is the other way people share these.
 *
 * Except while an answer is being collected, where it is exactly as short to read out loud and
 * that is the problem. The seed *is* the item: `(type, seed, difficulty)` regenerates it exactly,
 * on any machine, in a few lines. On a reasoning format that is a laborious way to cheat at a
 * drill nobody is grading; on the memory formats it is not laborious at all, because the sequence
 * you are being asked to hold — and which has already been taken off the screen on purpose — comes
 * straight back out of a string sitting beside the input. A measurement that displays its own
 * answer key during the interval it measures is not measuring what it claims to.
 *
 * So the value is masked for the duration and returns on the reveal, where sharing a run is
 * something a reader might actually want to do. This cannot be airtight — a pinned run carries its
 * seed in the address bar, and the copy control would hand it over — so the mask is paired with
 * disabling that control, and the whole thing stops the *passive* leak rather than pretending to
 * defeat a determined reader. Nobody accidentally reads what is not on screen.
 */
import { useCallback, useState } from 'preact/hooks';
import { dict, type Locale } from '../lib/i18n';

interface Props {
  /** The session seed. `?seed=` replays the whole run from its first item. */
  seed: string;
  locale: Locale;
  /** `compact` sits in the quiz header; `full` is the results-screen treatment. */
  variant?: 'compact' | 'full';
  /**
   * Mask the value and disable copying, for as long as an answer is being collected.
   *
   * Passed rather than derived, because this component has no idea what phase anything is in — and
   * the rule belongs to the measurement, not to the chip.
   */
  concealed?: boolean;
}

type Status = 'idle' | 'copied' | 'failed';

/**
 * The link that reproduces this run.
 *
 * Built from the live location so it carries the base path and the locale segment without
 * this component having to know the routing scheme. Existing `d`/`n` overrides are kept —
 * a run pinned to level 4 does not reproduce at level 2 — while any previous `seed` is
 * replaced rather than appended.
 */
function shareLink(seed: string): string {
  if (typeof location === 'undefined') return '';
  const url = new URL(location.href);
  url.hash = '';
  url.searchParams.set('seed', seed);
  return url.toString();
}

export default function SeedChip({
  seed,
  locale,
  variant = 'compact',
  concealed = false,
}: Props) {
  const t = dict(locale).seed;
  const [status, setStatus] = useState<Status>('idle');

  const copy = useCallback(async () => {
    if (concealed) return; // the button is disabled; this is the belt to that pair of braces
    try {
      // Requires a secure context. On an insecure origin — someone serving the built
      // files over plain http on a LAN — this throws, and saying so beats a button that
      // silently does nothing.
      await navigator.clipboard.writeText(shareLink(seed));
      setStatus('copied');
    } catch {
      setStatus('failed');
    }
  }, [seed, concealed]);

  return (
    <span
      class={`seed-chip seed-chip--${variant}`}
      data-testid="seed-chip"
      data-status={status}
      data-concealed={concealed ? 'true' : undefined}
    >
      <span class="seed-chip-label subtle">{t.label}</span>
      <code class="seed-chip-value" data-testid="seed-value">
        {/*
         * One mark per character, so the chip keeps its width and the header does not reflow on
         * the reveal — and so nothing about the run's identity is inferable from how wide the
         * blank is. The marks are decorative; the reason they are there is what gets announced.
         */}
        {concealed ? (
          <>
            <span aria-hidden="true">{'•'.repeat(seed.length)}</span>
            <span class="sr-only">{t.concealed}</span>
          </>
        ) : (
          seed
        )}
      </code>
      <button
        type="button"
        class="seed-chip-copy"
        data-testid="seed-copy"
        onClick={copy}
        disabled={concealed}
        title={concealed ? t.concealed : t.copy}
        aria-label={concealed ? t.concealed : t.copy}
      >
        <span aria-hidden="true">⧉</span>
        {variant === 'full' && <span class="seed-chip-copy-text">{t.copyShort}</span>}
      </button>
      {/*
       * Announced rather than merely shown: the visible change is a few characters in a
       * corner, which a screen-reader user would otherwise never learn about.
       */}
      <span class="seed-chip-status" role="status" data-testid="seed-status">
        {status === 'copied' ? t.copied : status === 'failed' ? t.copyFailed : ''}
      </span>
    </span>
  );
}
