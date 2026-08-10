import { expect, type Page } from '@playwright/test';
import { generateItem } from '../src/lib/generators';
import { deriveSeed } from '../src/lib/rng';
import type { Locale } from '../src/lib/i18n';
import type { Difficulty, ItemTypeId } from '../src/lib/types';

/**
 * The tests import the generator directly, in Node, to work out what the *browser* should
 * be showing for a pinned seed. That makes them genuine end-to-end assertions rather than
 * "click something and hope": if the rendering, the seeding, the locale routing, or the
 * base path drifts, the expected answer index stops matching what the page marks correct.
 */
export function expectedItem(
  type: ItemTypeId,
  sessionSeed: string,
  index: number,
  difficulty: Difficulty,
  locale: Locale = 'en',
) {
  return generateItem(type, deriveSeed(sessionSeed, type, index), difficulty, locale);
}

export interface DrillOptions {
  seed: string;
  difficulty: Difficulty;
  length: number;
  /** Defaults to English; set to 'fr' to exercise the French routes. */
  locale?: Locale;
}

export function localeOf(opts: DrillOptions): Locale {
  return opts.locale ?? 'en';
}

/**
 * Relative on purpose: a leading slash would resolve against the origin and drop the base
 * path (see playwright.config.ts). Every page also carries a locale segment.
 */
export function practiceUrl(type: ItemTypeId, opts: DrillOptions): string {
  const { seed, difficulty, length } = opts;
  return `${localeOf(opts)}/practice/${type}/?seed=${seed}&d=${difficulty}&n=${length}`;
}

/** A locale-prefixed page path, e.g. `localePath('fr', 'progress/')`. */
export function localePath(locale: Locale, path = ''): string {
  return `${locale}/${path}`;
}

/**
 * Waits for the client-only quiz island to hydrate and render its first item.
 *
 * `data-hydrated` rather than mere visibility: the element is in the DOM one commit
 * before its effects run, and `page.keyboard.press` — unlike `click` — does not
 * auto-wait, so a key sent in that window is silently dropped.
 */
export async function waitForQuiz(page: Page): Promise<void> {
  await expect(page.getByTestId('quiz')).toBeVisible();
  await expect(page.getByTestId('quiz')).toHaveAttribute('data-hydrated', 'true');
}

/**
 * Starts playback if the current item is waiting on its gate.
 *
 * Neither transient format — span nor n-back — plays itself on mount: a reader who is still
 * orienting would lose the stream, and there is no replay. Every test that waits for playback
 * has to press start first. It is a no-op for the formats with no gate, so callers that do
 * not know the item type can call it unconditionally.
 */
export async function startSpanIfGated(page: Page): Promise<void> {
  const start = page.getByTestId('span-start');
  if (await start.isVisible().catch(() => false)) await start.click();
}

/** Answers the current item correctly, using the answer computed in Node. */
export async function answerCorrectly(
  page: Page,
  type: ItemTypeId,
  opts: DrillOptions,
  index: number,
): Promise<void> {
  const item = expectedItem(type, opts.seed, index, opts.difficulty, localeOf(opts));
  /*
   * Before the branch, not inside it: n-back is gated *and* answered by choice, so gating is
   * not a property of the response mode. A no-op for the formats with no gate.
   */
  await startSpanIfGated(page);
  if (item.responseMode === 'text') {
    const input = page.getByTestId('span-input');
    await expect(input).toBeEnabled({ timeout: 20_000 });
    await input.fill(item.answerText!);
    await page.getByTestId('submit-text').click();
    return;
  }
  await page.getByTestId(`option-${item.answerIndex}`).click();
}

/** Answers the current item with a deliberately wrong option. */
export async function answerIncorrectly(
  page: Page,
  type: ItemTypeId,
  opts: DrillOptions,
  index: number,
): Promise<void> {
  const item = expectedItem(type, opts.seed, index, opts.difficulty, localeOf(opts));
  await startSpanIfGated(page);
  if (item.responseMode === 'text') {
    const input = page.getByTestId('span-input');
    await expect(input).toBeEnabled({ timeout: 20_000 });
    await input.fill('ZZZZZZ');
    await page.getByTestId('submit-text').click();
    return;
  }
  const wrong = item.answerIndex === 0 ? 1 : 0;
  await page.getByTestId(`option-${wrong}`).click();
}

/**
 * The sRGB triple a computed colour actually paints, whatever colour space it was written
 * in.
 *
 * Needed because the palette is authored in OKLCH and Chromium's `getComputedStyle`
 * faithfully returns `oklch(0.977 0.005 286)` rather than converting to `rgb()`. Scraping
 * numbers out of that string would read a *lightness* as a red channel. Painting one pixel
 * and reading it back asks the browser to do the conversion, so the assertion is about what
 * the user sees rather than about how the value was spelled.
 */
export async function paintedColour(
  page: Page,
  selector: string,
  property: 'backgroundColor' | 'color' = 'backgroundColor',
): Promise<{ r: number; g: number; b: number }> {
  return page.evaluate(
    ({ selector, property }) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`no element matches ${selector}`);
      const value = getComputedStyle(element)[property as 'backgroundColor'];

      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext('2d')!;
      context.fillStyle = value;
      context.fillRect(0, 0, 1, 1);
      const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
      return { r: r!, g: g!, b: b! };
    },
    { selector, property },
  );
}

export async function readLocalStorageSessions(page: Page): Promise<unknown[]> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('iq:v1:sessions');
    return raw ? JSON.parse(raw) : [];
  });
}

export async function clearAppStorage(page: Page): Promise<void> {
  await page.evaluate(() => localStorage.clear());
}
