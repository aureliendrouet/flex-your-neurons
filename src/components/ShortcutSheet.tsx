/**
 * The `?` shortcuts sheet.
 *
 * Pure discoverability: every shortcut listed here has worked since the quiz was written, and
 * nothing told anyone about them. The feature was finished; the affordance was missing.
 *
 * It lives inside the quiz island on purpose. The shortcuts are implemented by the quiz's own
 * key handler, so a sheet rendered anywhere else could drift from what the handler actually
 * does — and there is nothing to document on a page with no live item.
 */
import { dict, type Locale } from '../lib/i18n';

interface Props {
  locale: Locale;
  open: boolean;
  /** Highest option key in play, so the sheet says 1–5 on a five-option item. */
  optionCount: number;
  onClose: () => void;
}

export default function ShortcutSheet({ locale, open, optionCount, onClose }: Props) {
  const t = dict(locale).shortcuts;

  /*
   * No key listener of its own — deliberately. Both `?` and Escape are handled by the quiz's
   * single always-attached listener.
   *
   * A listener registered by this component in an effect would only exist from the render
   * *after* the sheet appears, leaving a window in which an Escape pressed immediately after
   * `?` is silently dropped. That is the same defect the quiz's own comment records about
   * re-registering its handler per render, and it showed up here as an intermittently failing
   * test rather than as a theory.
   */
  if (!open) return null;

  const rows: { keys: string[]; label: string }[] = [
    { keys: ['1', String(Math.max(1, optionCount))], label: t.keys.numbers },
    { keys: ['Enter'], label: t.keys.enter },
    { keys: ['Tab'], label: t.keys.tab },
    { keys: ['?'], label: t.keys.question },
    { keys: ['Esc'], label: t.keys.escape },
  ];

  return (
    <div class="card shortcut-sheet" role="dialog" aria-label={t.heading} data-testid="shortcut-sheet">
      <div class="cluster cluster--between shortcut-head">
        <h3 class="section-heading section-heading--xs">{t.heading}</h3>
        <button class="btn shortcut-close" onClick={onClose} data-testid="shortcut-close">
          {t.close}
        </button>
      </div>
      <p class="subtle small flush">{t.lede}</p>
      <dl class="shortcut-list">
        {rows.map((row) => (
          <div class="shortcut-row" key={row.label}>
            <dt>
              {/*
               * Two keys means a range — "1 to 8" — rather than a chord, so they are joined
               * by a dash. Everything else is a single cap.
               */}
              {row.keys.length === 2 ? (
                <>
                  <kbd>{row.keys[0]}</kbd>
                  <span class="subtle shortcut-dash" aria-hidden="true">
                    –
                  </span>
                  <kbd>{row.keys[1]}</kbd>
                </>
              ) : (
                <kbd>{row.keys[0]}</kbd>
              )}
            </dt>
            <dd>{row.label}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
