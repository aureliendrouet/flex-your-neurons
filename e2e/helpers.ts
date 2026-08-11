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
 * No transient format plays itself on mount — a reader who is still orienting would lose the
 * stream, and there is no replay — so every test that waits for playback has to press start first.
 *
 * `gated` is the fix for a race that was latent here for a long time. Without it the only way to ask
 * "is there a gate?" is `isVisible()`, which is a single sample rather than a wait: in a run that
 * advances straight from one item to the next, that sample can happen before the new item has
 * painted, the click is skipped, and the response controls stay locked until the test times out ten
 * minutes later. It surfaced when a fourth gated format shipped and the full-test run got long
 * enough to hit it, on head count, at item fourteen of eighteen.
 *
 * When the caller has the item in hand it knows the answer — `item.presentation !== undefined` is
 * exactly what "this plays before you can answer" means — so it can ask for a real auto-waiting
 * click instead of a guess. Callers that do not know the type keep the lenient behaviour.
 */
export async function startSpanIfGated(page: Page, gated?: boolean): Promise<void> {
  const start = page.getByTestId('span-start');
  if (gated) {
    await start.click({ timeout: 30_000 });
    return;
  }
  if (await start.isVisible().catch(() => false)) await start.click();
}

/**
 * Walks a trail board's path in order.
 *
 * A trail has no options and no expected string, so neither of the other two answering routes
 * applies: the item completes when the last target is clicked, and that is the only way to finish it.
 * `misclickFirst` deliberately taps a target out of turn first, which is counted against the run
 * without ending it — the only way to make a trail score as "not clean".
 */
async function walkTrail(
  page: Page,
  nodes: { label: string }[],
  misclickFirst: boolean,
): Promise<void> {
  if (misclickFirst && nodes.length > 1) {
    await page.getByTestId(`trail-node-${nodes.at(-1)!.label}`).click();
  }
  for (const node of nodes) {
    await page.getByTestId(`trail-node-${node.label}`).click();
  }
}

/**
 * Taps a block-span board's sequence back.
 *
 * The board plays itself before it will accept anything, so the wait is on the phase attribute
 * rather than on a timeout: playback is about a second per block and grows with difficulty, and a
 * fixed sleep would either be too short at level 5 or waste seconds at level 1.
 *
 * `reversed` is how a block-span item is answered *wrongly* on purpose. It is a genuine wrong answer
 * for every sequence this format produces — blocks never repeat, so a sequence can never read the
 * same in both directions — and it is a mistake with a name, which the diagnosis test relies on.
 */
async function tapBlocks(page: Page, sequence: number[], reversed: boolean): Promise<void> {
  const board = page.getByTestId('block-span-board');
  await expect(board).toHaveAttribute('data-block-phase', 'recall', { timeout: 30_000 });
  for (const index of reversed ? [...sequence].reverse() : sequence) {
    await page.getByTestId(`block-${index + 1}`).click();
  }
}

/**
 * Fills a pyramid and submits it.
 *
 * `wrong` writes the right numbers with the last blank one out, which is a genuine wrong answer for
 * every pyramid this format produces and is also the *diagnosable* one — a single blank out by one
 * is what the fill diagnosis calls `off-by-one`, so the diagnosis tests get something to name.
 */
async function fillPyramid(page: Page, answerText: string, wrong: boolean): Promise<void> {
  const blanks = answerText.split(',');
  for (const [i, value] of blanks.entries()) {
    const last = i === blanks.length - 1;
    const typed = wrong && last ? String(Number(value) + 1) : value;
    await page.getByTestId(`pyramid-input-${i}`).fill(typed);
  }
  await page.getByTestId('submit-pyramid').click();
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
   * not a property of the response mode. Carrying a `presentation` is what gating *is*, so the
   * helper is told rather than left to guess — see the note on `startSpanIfGated`.
   */
  await startSpanIfGated(page, item.presentation !== undefined);
  if (item.responseMode === 'trail') {
    if (item.stimulus.kind !== 'trail') throw new Error('expected a trail stimulus');
    await walkTrail(page, item.stimulus.nodes, false);
    return;
  }
  if (item.responseMode === 'tap') {
    if (item.stimulus.kind !== 'block-span') throw new Error('expected a block-span stimulus');
    await tapBlocks(page, item.stimulus.sequence, false);
    return;
  }
  if (item.responseMode === 'fill') {
    await fillPyramid(page, item.answerText!, false);
    return;
  }
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
  await startSpanIfGated(page, item.presentation !== undefined);
  if (item.responseMode === 'trail') {
    if (item.stimulus.kind !== 'trail') throw new Error('expected a trail stimulus');
    // A trail always finishes; "wrong" means finishing with a click that went astray.
    await walkTrail(page, item.stimulus.nodes, true);
    return;
  }
  if (item.responseMode === 'tap') {
    if (item.stimulus.kind !== 'block-span') throw new Error('expected a block-span stimulus');
    await tapBlocks(page, item.stimulus.sequence, true);
    return;
  }
  if (item.responseMode === 'fill') {
    await fillPyramid(page, item.answerText!, true);
    return;
  }
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
