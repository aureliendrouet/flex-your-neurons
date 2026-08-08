/**
 * Locale plumbing.
 *
 * `Dict` is inferred from the English dictionary, so every other locale is checked at
 * compile time — a missing key is a build error, never a string that quietly falls back
 * to English in front of a French reader.
 *
 * Locale never touches the RNG. Generators take it only to produce text, so a given seed
 * yields the *same item* in every language: same figures, same options, same answer index,
 * different words. `tests/i18n.test.ts` asserts exactly that.
 */
import en from './en';
import fr from './fr';

export type Dict = typeof en;

export const LOCALES = ['en', 'fr'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

const DICTS: Record<Locale, Dict> = { en, fr };

export function isLocale(value: string | undefined): value is Locale {
  return value !== undefined && (LOCALES as readonly string[]).includes(value);
}

/** The dictionary for a locale. Unknown values fall back to the default rather than throw. */
export function dict(locale: Locale | string | undefined): Dict {
  return DICTS[isLocale(locale) ? locale : DEFAULT_LOCALE];
}

/** Every locale paired with how it names itself, for the language switcher. */
export function localeOptions(): { locale: Locale; nativeName: string }[] {
  return LOCALES.map((locale) => ({ locale, nativeName: DICTS[locale].locale.nativeName }));
}

/**
 * Extracts the locale from a pathname such as `/iq/fr/practice/matrix/`.
 * Returns the default when the path carries no known locale segment.
 */
export function localeFromPath(pathname: string, base = '/'): Locale {
  const withoutBase = pathname.startsWith(base) ? pathname.slice(base.length) : pathname;
  const first = withoutBase.split('/').filter(Boolean)[0];
  return isLocale(first) ? first : DEFAULT_LOCALE;
}

/**
 * Rewrites a path to a different locale, keeping the page.
 * `/iq/en/practice/matrix/` + 'fr' -> `/iq/fr/practice/matrix/`
 */
export function pathForLocale(pathname: string, target: Locale, base = '/'): string {
  const normalisedBase = base.endsWith('/') ? base : `${base}/`;
  const withoutBase = pathname.startsWith(normalisedBase)
    ? pathname.slice(normalisedBase.length)
    : pathname.replace(/^\//, '');
  const segments = withoutBase.split('/').filter(Boolean);
  if (isLocale(segments[0])) segments[0] = target;
  else segments.unshift(target);
  return `${normalisedBase}${segments.join('/')}/`.replace(/\/+$/, '/');
}

/**
 * Picks the best locale from an Accept-Language-style list, e.g. `navigator.languages`.
 * Matches on the primary subtag, so 'fr-CA' selects French.
 */
export function negotiateLocale(preferred: readonly string[]): Locale {
  for (const candidate of preferred) {
    const primary = candidate.toLowerCase().split('-')[0];
    if (isLocale(primary)) return primary;
  }
  return DEFAULT_LOCALE;
}

export { en, fr };
