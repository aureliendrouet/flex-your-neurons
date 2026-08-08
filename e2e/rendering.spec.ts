import { expect, test } from '@playwright/test';
import { practiceUrl, waitForQuiz, type DrillOptions } from './helpers';

const OPTS: DrillOptions = { seed: 'RENDER01', difficulty: 4, length: 1 };

/**
 * These tests exist because of a bug that every other layer missed.
 *
 * The renderer passed SVG presentation attributes in camelCase (`fillOpacity`). Preact
 * forwards unknown props straight to `setAttribute`, and SVG attribute names are
 * case-sensitive, so the browser ignored them entirely and painted every shape fully
 * opaque. Shading — one of the five attributes a matrix rule can act on — was invisible,
 * and the paper-folding options were five identical white squares.
 *
 * The unit tests could not catch it: they assert on generated data, not on pixels. The
 * other end-to-end tests could not catch it either: they compute the expected answer in
 * Node and click it, so they never needed the item to be *legible*. These do.
 */
test.describe('the item is actually legible', () => {
  test('no SVG carries a camelCase presentation attribute', async ({ page }) => {
    // viewBox and friends are genuinely camelCase in the SVG spec; everything else is not.
    const LEGITIMATE = new Set([
      'viewBox',
      'preserveAspectRatio',
      'baseProfile',
      'gradientUnits',
      'patternUnits',
      'clipPathUnits',
      'markerWidth',
      'markerHeight',
      'refX',
      'refY',
      'textLength',
      'startOffset',
    ]);

    for (const path of ['en/practice/matrix/', 'en/practice/paper-folding/', 'fr/practice/rotation/', 'en/progress/', 'fr/progress/']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');

      const offenders = await page.evaluate(() => {
        const found: string[] = [];
        for (const svg of Array.from(document.querySelectorAll('svg'))) {
          for (const el of [svg, ...Array.from(svg.querySelectorAll('*'))]) {
            for (const attr of Array.from(el.attributes)) {
              if (attr.name.startsWith('data-') || attr.name.startsWith('aria-')) continue;
              if (/[A-Z]/.test(attr.name)) found.push(`${el.tagName}.${attr.name}`);
            }
          }
        }
        return [...new Set(found)];
      });

      const real = offenders.filter((o) => !LEGITIMATE.has(o.split('.')[1]!));
      expect(real, `${path} has camelCase SVG attributes the browser will ignore`).toEqual([]);
    }
  });

  /**
   * Each shading level must be told apart by something other than fine contrast: a
   * distinct texture plus a distinct background wash. The previous pure-opacity ramp put
   * levels 1 and 2 at 0.12 vs 0.31, which is not separable with reduced contrast
   * sensitivity, and at small sizes was not separable at all.
   */
  test('every shading level paints a distinguishable fill', async ({ page }) => {
    await page.goto(practiceUrl('matrix', OPTS));
    await waitForQuiz(page);

    const painted = await page.locator('svg[data-figure] [data-shape]').evaluateAll((els) =>
      els.map((el) => ({
        level: Number(el.getAttribute('data-color')),
        fill: el.getAttribute('fill') ?? '',
        opacity: el.getAttribute('fill-opacity') ?? '',
      })),
    );
    expect(painted.length).toBeGreaterThan(0);

    // Collapse each level to the set of paint layers used for it.
    const byLevel = new Map<number, Set<string>>();
    for (const p of painted) {
      // Pattern ids are per-figure, so compare the pattern *name*, not the id.
      const paint = `${p.fill.replace(/url\(#.*-(\w+)\)/, 'pattern:$1')}@${p.opacity}`;
      byLevel.set(p.level, (byLevel.get(p.level) ?? new Set()).add(paint));
    }

    // Two different levels must never paint identically.
    const signatures = new Map<string, number>();
    for (const [level, paints] of byLevel) {
      const signature = [...paints].sort().join('|');
      const clash = signatures.get(signature);
      expect(clash, `levels ${clash} and ${level} paint identically`).toBeUndefined();
      signatures.set(signature, level);
    }
  });

  test('shading uses texture, not contrast alone', async ({ page }) => {
    // Sweep the difficulties so several shading levels are on screen across the run.
    const seen = new Set<string>();
    for (const difficulty of [1, 2, 3, 4, 5] as const) {
      await page.goto(practiceUrl('matrix', { ...OPTS, difficulty }));
      await waitForQuiz(page);
      const fills = await page
        .locator('svg[data-figure] [data-shape]')
        .evaluateAll((els) => els.map((el) => el.getAttribute('fill') ?? ''));
      for (const fill of fills) {
        if (fill.startsWith('url(#')) seen.add(fill.replace(/url\(#.*-(\w+)\)/, '$1'));
      }
    }
    // At least two distinct textures must actually be in use.
    expect([...seen].length, `textures seen: ${[...seen].join(', ')}`).toBeGreaterThanOrEqual(2);
  });

  test('an unfilled shape is genuinely hollow and a full one is solid', async ({ page }) => {
    await page.goto(practiceUrl('odd-one-out', { ...OPTS, difficulty: 5 }));
    await waitForQuiz(page);

    const hollow = page.locator('svg[data-figure] [data-color="0"]');
    if ((await hollow.count()) > 0) {
      await expect(hollow.first()).toHaveAttribute('fill', 'none');
    }
    const solid = page.locator('svg[data-figure] [data-color="5"]');
    if ((await solid.count()) > 0) {
      await expect(solid.first()).toHaveAttribute('fill', 'currentColor');
      const opacity = await solid.first().evaluate((el) => Number(getComputedStyle(el).fillOpacity));
      expect(opacity).toBeGreaterThan(0.6);
    }
  });

  /**
   * The size *ratio* between levels is asserted on the geometry in `tests/solvers.test.ts`
   * — bounding boxes here also encode shape type, so a triangle and a circle at the same
   * level are not comparable. What this checks is the thing only a browser knows: that
   * nothing ends up rendered too small to see at the sizes the layout actually uses.
   */
  test('never renders a shape too small to see', async ({ page }) => {
    for (const difficulty of [1, 3, 5] as const) {
      await page.goto(practiceUrl('matrix', { ...OPTS, difficulty }));
      await waitForQuiz(page);

      const widths = await page.evaluate(() =>
        Array.from(document.querySelectorAll('svg[data-figure] [data-shape]')).map((shape) => ({
          layout: shape.closest('svg')?.getAttribute('data-layout') ?? '',
          size: shape.getAttribute('data-size'),
          width: (shape as SVGGraphicsElement).getBoundingClientRect().width,
        })),
      );

      expect(widths.length).toBeGreaterThan(0);
      for (const w of widths) {
        expect(
          w.width,
          `d${difficulty} ${w.layout} size ${w.size} renders at ${Math.round(w.width)}px`,
        ).toBeGreaterThan(11);
      }
    }
  });

  test('paper-folding options are drawn as punched sheets and differ from each other', async ({ page }) => {
    await page.goto(practiceUrl('paper-folding', OPTS));
    await waitForQuiz(page);

    const grids = page.getByTestId('options').locator('svg[data-grid]');
    await expect(grids).toHaveCount(5);

    const rendered = await grids.evaluateAll((els) =>
      els.map((el) => ({
        variant: el.getAttribute('data-variant'),
        pattern: el.getAttribute('data-pattern'),
        holes: el.querySelectorAll('[data-hole]').length,
      })),
    );

    for (const g of rendered) {
      expect(g.variant, 'unfolded sheets must be drawn as paper with holes').toBe('holes');
      // What is drawn must match the data, or the option is a lie.
      const expectedHoles = (g.pattern ?? '').split('').filter((c) => c === '1').length;
      expect(g.holes).toBe(expectedHoles);
      expect(g.holes).toBeGreaterThan(0);
    }

    // Five identical-looking options would make the item unanswerable.
    expect(new Set(rendered.map((g) => g.pattern)).size).toBe(5);
  });

  test('rotation options draw distinguishable shapes', async ({ page }) => {
    await page.goto(practiceUrl('rotation', OPTS));
    await waitForQuiz(page);

    const filledPerOption = await page
      .getByTestId('options')
      .locator('svg[data-grid]')
      .evaluateAll((els) =>
        els.map((el) => {
          const cells = Array.from(el.querySelectorAll('[data-cell]'));
          const painted = cells.filter(
            (c) => Number(getComputedStyle(c).fillOpacity) > 0.5,
          ).length;
          const declared = cells.filter((c) => c.getAttribute('data-filled') === 'true').length;
          return { painted, declared };
        }),
      );

    expect(filledPerOption).toHaveLength(5);
    for (const { painted, declared } of filledPerOption) {
      // Painted cells must match declared cells: not all-on, not all-off.
      expect(painted).toBe(declared);
      expect(painted).toBeGreaterThan(0);
    }
  });

  test('matrix cells render the eight figures with visible content', async ({ page }) => {
    await page.goto(practiceUrl('matrix', OPTS));
    await waitForQuiz(page);

    const shapesPerCell = await page
      .locator('.matrix-cell[data-blank="false"] svg[data-figure]')
      .evaluateAll((els) => els.map((el) => el.querySelectorAll('[data-shape]').length));

    expect(shapesPerCell).toHaveLength(8);
    for (const n of shapesPerCell) expect(n).toBeGreaterThan(0);
  });

  test('figures inherit the theme colour rather than a hard-coded one', async ({ page }) => {
    // `currentColor` is what keeps items legible in both light and dark themes.
    // Asserted on the SVG's resolved `color`, which is what every `currentColor` in the
    // figure — stroke, wash and texture alike — actually paints with.
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto(practiceUrl('matrix', OPTS));
    await waitForQuiz(page);
    const dark = await page
      .locator('svg[data-figure]')
      .first()
      .evaluate((el) => getComputedStyle(el).color);

    await page.emulateMedia({ colorScheme: 'light' });
    await page.reload();
    await waitForQuiz(page);
    const light = await page
      .locator('svg[data-figure]')
      .first()
      .evaluate((el) => getComputedStyle(el).color);

    expect(dark).not.toBe(light);
  });
});
