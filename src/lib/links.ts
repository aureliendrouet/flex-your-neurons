/**
 * In-app links, from inside a client island.
 *
 * Both the base path and the active locale are stamped on `<html>` by the layout, so an
 * island can link correctly without needing to know the routing scheme — which it could not
 * work out for itself anyway, since the base path is a build-time setting.
 *
 * A module of its own rather than an export from a component: the progress page needs these
 * too, and importing them from `Quiz.tsx` would pull the entire quiz runner and every
 * generator into the dashboard's bundle for the sake of two lines of string concatenation.
 */

/** `localeHref('practice/')` -> `/iq/fr/practice/` */
export function localeHref(path: string): string {
  const root = document.documentElement;
  const base = (root.dataset.base ?? '/').replace(/\/$/, '');
  const locale = root.dataset.locale ?? 'en';
  return `${base}/${locale}/${path}`;
}

/** The practice page for one item format. */
export function practiceHref(id: string): string {
  return localeHref(`practice/${id}/`);
}
