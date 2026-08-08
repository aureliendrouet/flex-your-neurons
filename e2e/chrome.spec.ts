import { expect, test } from '@playwright/test';
import { paintedColour } from './helpers';
import { ALL_META } from '../src/lib/generators';
import { typeHue } from '../src/lib/identity';

test.describe('the live hero', () => {
  /**
   * The hero is a real generated matrix, not a picture of one. The point of asserting this
   * is that the home page cannot advertise a generator it is not actually running: if the
   * matrix generator broke, this test fails on the home page as well as in the drill.
   */
  test('is a genuine nine-cell matrix with one cell missing', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('en/');

    const hero = page.locator('.hero-matrix');
    await expect(hero).toHaveAttribute('data-hero-seed', 'HERO151');
    await expect(hero.locator('.hero-cell')).toHaveCount(9);
    await expect(hero.locator('.hero-cell[data-blank="true"]')).toHaveCount(1);
    await expect(hero.locator('svg[data-figure]')).toHaveCount(8);
  });

  /** Decoration for the eye. A screen reader must not be read nine figures before the lede. */
  test('is hidden from assistive technology', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('en/');
    await expect(page.locator('.page-hero')).toHaveAttribute('aria-hidden', 'true');
    // No figure inside it carries an accessible name.
    const labelled = await page.locator('.hero-matrix svg[role="img"]').count();
    expect(labelled).toBe(0);
  });

  /** No hue inside a figure, hero included. */
  test('paints no hue', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('en/');
    const paints = await page
      .locator('.hero-matrix svg [fill], .hero-matrix svg [stroke]')
      .evaluateAll((els) =>
        els.flatMap((e) => [e.getAttribute('fill'), e.getAttribute('stroke')].filter(Boolean)),
      );
    expect(paints.length).toBeGreaterThan(8);
    for (const value of paints) {
      expect(value, `the hero paints "${value}"`).toMatch(/^(currentColor|none|url\(#)/);
    }
  });

  /** Beside the heading or not at all — never overlapping the words. */
  test('is dropped on a narrow viewport', async ({ page }) => {
    await page.setViewportSize({ width: 480, height: 800 });
    await page.goto('en/');
    await expect(page.locator('.page-hero')).toBeHidden();
  });

  test('only the home page has one', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    for (const path of ['en/practice/', 'en/test/', 'en/about/', 'en/terms/', 'en/progress/']) {
      await page.goto(path);
      await expect(page.locator('.page-hero'), path).toHaveCount(0);
    }
  });
});

test.describe('per-format identity', () => {
  /**
   * Ten formats, ten hues, evenly spaced. Asserted as *painted* colour rather than as the
   * `--type-hue` string, because the trap this guards against is real and silent: a
   * `--type-accent: oklch(… var(--type-hue))` declared on `:root` resolves against `:root`,
   * so every card would set its own hue and every card would still paint indigo.
   */
  test('each card paints its own accent', async ({ page }) => {
    await page.goto('en/');

    const painted = new Set<string>();
    for (const meta of ALL_META) {
      const card = page.getByTestId(`type-card-${meta.id}`);
      await expect(card, meta.id).toHaveAttribute(
        'style',
        new RegExp(`--type-hue:\\s*${typeHue(meta.id)}`),
      );

      // The accent is painted by a pseudo-element, so read its resolved background.
      const rule = await page.evaluate((id) => {
        const el = document.querySelector(`[data-testid="type-card-${id}"] .type-card-name`)!;
        return getComputedStyle(el, '::after').backgroundColor;
      }, meta.id);
      expect(rule, `${meta.id} paints no accent`).toBeTruthy();
      painted.add(rule);
    }

    // Ten distinct colours, not ten copies of the accent.
    expect(painted.size, `only ${painted.size} distinct format accents`).toBe(ALL_META.length);
  });

  test('the format identity follows through to its own page', async ({ page }) => {
    for (const meta of ALL_META.slice(0, 3)) {
      await page.goto(`en/practice/${meta.id}/`);
      const meta_ = page.locator(`[data-type-identity="${meta.id}"]`);
      await expect(meta_).toHaveAttribute('style', new RegExp(`--type-hue:\\s*${typeHue(meta.id)}`));
    }
  });
});

test.describe('site chrome', () => {
  test('the header marks whether the page is scrolled', async ({ page }) => {
    await page.goto('en/about/');
    await expect(page.locator('html')).not.toHaveAttribute('data-scrolled', '');

    await page.evaluate(() => window.scrollTo(0, 900));
    await expect(page.locator('html')).toHaveAttribute('data-scrolled', '');

    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.locator('html')).not.toHaveAttribute('data-scrolled', '');
  });

  /** Focus must be unmistakable, and it is not a place for gradients. */
  test('focus is a solid outline everywhere', async ({ page }) => {
    await page.goto('en/');
    await page.getByTestId('type-card-matrix').focus();
    const outline = await page.getByTestId('type-card-matrix').evaluate((el) => {
      const style = getComputedStyle(el);
      return { style: style.outlineStyle, width: style.outlineWidth };
    });
    expect(outline.style).toBe('solid');
    expect(parseFloat(outline.width)).toBeGreaterThanOrEqual(2);
  });

  /**
   * The ring animates only while hovered or focused. Ten cards animating a gradient at rest
   * is a measurable battery cost for an effect nobody is looking at.
   */
  test('the card ring is paused and invisible at rest', async ({ page }) => {
    await page.goto('en/');
    const state = await page.getByTestId('type-card-matrix').evaluate((el) => {
      const ring = getComputedStyle(el, '::after');
      return { play: ring.animationPlayState, opacity: ring.opacity };
    });
    expect(state.play).toBe('paused');
    expect(Number(state.opacity)).toBe(0);
  });

  test('the ring runs on hover and on keyboard focus alike', async ({ page }) => {
    await page.goto('en/');
    const card = page.getByTestId('type-card-matrix');

    await card.hover();
    await expect
      .poll(() => card.evaluate((el) => getComputedStyle(el, '::after').animationPlayState))
      .toBe('running');

    // Keyboard users get the same affordance, not a lesser one.
    await page.getByTestId('type-card-series-number').focus();
    await expect
      .poll(() =>
        page
          .getByTestId('type-card-series-number')
          .evaluate((el) => getComputedStyle(el, '::after').animationPlayState),
      )
      .toBe('running');
  });

  test('the wordmark settles rather than looping', async ({ page }) => {
    await page.goto('en/');
    const wordmark = page.locator('.wordmark-text');
    const animation = await wordmark.evaluate((el) => {
      const style = getComputedStyle(el);
      return { count: style.animationIterationCount, fill: style.animationFillMode };
    });
    expect(animation.count).toBe('1');
    expect(animation.fill).toBe('both');

    // And it ends as readable ink, not as a permanent gradient.
    await page.waitForTimeout(900);
    const { r, g, b } = await paintedColour(page, '.wordmark-text', 'color');
    expect(r + g + b).toBeGreaterThan(0);
  });

  test('reduced motion removes the decoration rather than speeding it up', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('en/');

    // The ring is gone, not instant.
    const display = await page
      .getByTestId('type-card-matrix')
      .evaluate((el) => getComputedStyle(el, '::after').display);
    expect(display).toBe('none');

    // The hero is present but does not assemble itself.
    await expect(page.locator('.hero-matrix .hero-cell').first()).toBeVisible();
    const heroAnimation = await page
      .locator('.hero-cell')
      .first()
      .evaluate((el) => getComputedStyle(el).animationName);
    expect(heroAnimation).toBe('none');
  });
});
