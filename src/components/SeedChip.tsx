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
 */
import { useCallback, useState } from 'preact/hooks';
import { dict, type Locale } from '../lib/i18n';

interface Props {
  /** The session seed. `?seed=` replays the whole run from its first item. */
  seed: string;
  locale: Locale;
  /** `compact` sits in the quiz header; `full` is the results-screen treatment. */
  variant?: 'compact' | 'full';
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

export default function SeedChip({ seed, locale, variant = 'compact' }: Props) {
  const t = dict(locale).seed;
  const [status, setStatus] = useState<Status>('idle');

  const copy = useCallback(async () => {
    try {
      // Requires a secure context. On an insecure origin — someone serving the built
      // files over plain http on a LAN — this throws, and saying so beats a button that
      // silently does nothing.
      await navigator.clipboard.writeText(shareLink(seed));
      setStatus('copied');
    } catch {
      setStatus('failed');
    }
  }, [seed]);

  return (
    <span class={`seed-chip seed-chip--${variant}`} data-testid="seed-chip" data-status={status}>
      <span class="seed-chip-label subtle">{t.label}</span>
      <code class="seed-chip-value" data-testid="seed-value">
        {seed}
      </code>
      <button
        type="button"
        class="seed-chip-copy"
        data-testid="seed-copy"
        onClick={copy}
        title={t.copy}
        aria-label={t.copy}
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
