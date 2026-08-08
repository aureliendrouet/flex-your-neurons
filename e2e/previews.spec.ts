import { expect, test } from '@playwright/test';
import { practiceUrl, waitForQuiz, type DrillOptions } from './helpers';
import { ALL_META } from '../src/lib/generators';
import { previewItem } from '../src/lib/previews';
import { dict } from '../src/lib/i18n';

test.describe('you can see the format before choosing it', () => {
  test('every home-page card carries a real generated miniature', async ({ page }) => {
    await page.goto('en/');
    for (const meta of ALL_META) {
      const thumb = page.getByTestId(`type-card-${meta.id}`).locator('[data-thumb]');
      await expect(thumb, meta.id).toHaveCount(1);
      await expect(thumb, meta.id).toHaveAttribute('data-thumb', meta.id);
      await expect(thumb, meta.id).toBeVisible();
    }
  });

  test('the practice index carries them too', async ({ page }) => {
    await page.goto('en/practice/');
    for (const meta of ALL_META) {
      await expect(
        page.getByTestId(`practice-card-${meta.id}`).locator(`[data-thumb="${meta.id}"]`),
        meta.id,
      ).toHaveCount(1);
    }
  });

  /**
   * The point of the whole phase: the miniature is the item, not an illustration of it. If
   * it drifted from the generator the card would be advertising something the drill does
   * not deliver — so the shapes drawn are checked against the ones the pinned seed produces.
   */
  test('a miniature draws the shapes its pinned item actually contains', async ({ page }) => {
    await page.goto('en/');

    const item = previewItem('matrix', 'en');
    if (item.stimulus.kind !== 'matrix') throw new Error('unexpected preview stimulus');

    const thumb = page.getByTestId('type-card-matrix').locator('[data-thumb="matrix"]');
    // Eight drawn cells and one blank, exactly as the live item has.
    await expect(thumb.locator('svg[data-figure]')).toHaveCount(8);
    await expect(thumb.locator('[data-blank="true"]')).toHaveCount(1);

    const drawn = await thumb
      .locator('[data-shape]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-shape')));
    for (const cell of item.stimulus.cells) {
      if (!cell) continue;
      for (const shape of cell.shapes) expect(drawn).toContain(shape.type);
    }
  });

  /** Miniatures are figures, so the inviolable rule applies: no hue inside one. */
  test('no miniature paints a hue', async ({ page }) => {
    await page.goto('en/');
    const fills = await page
      .locator('[data-thumb] svg [fill], [data-thumb] svg [stroke]')
      .evaluateAll((els) =>
        els.flatMap((e) => [e.getAttribute('fill'), e.getAttribute('stroke')].filter(Boolean)),
      );
    expect(fills.length).toBeGreaterThan(20);
    for (const value of fills) {
      // currentColor, none, or a pattern reference — never a colour literal or an accent.
      expect(value, `a miniature paints "${value}"`).toMatch(/^(currentColor|none|url\(#)/);
    }
  });

  /** Static markup: a card must not cost the visitor a hydration. */
  test('the miniatures ship no JavaScript', async ({ page }) => {
    const scripts: string[] = [];
    page.on('request', (r) => {
      if (r.resourceType() === 'script') scripts.push(r.url());
    });
    await page.goto('en/practice/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('[data-thumb]')).toHaveCount(ALL_META.length);
    expect(scripts, `practice index loaded ${scripts.length} script(s)`).toEqual([]);
  });

  test('the French cards show the same figures with French words', async ({ page }) => {
    await page.goto('fr/');
    const shapes = (locator: string) =>
      page.locator(locator).evaluateAll((els) => els.map((e) => e.getAttribute('data-shape')));

    const fr = await shapes('[data-thumb="matrix"] [data-shape]');
    await page.goto('en/');
    const en = await shapes('[data-thumb="matrix"] [data-shape]');
    expect(fr).toEqual(en);

    // Only the syllogism miniature contains words, and those words are translated.
    await page.goto('fr/');
    const frText = await page.locator('[data-thumb="syllogism"]').innerText();
    expect(frText).toMatch(/^(Tous|Aucun|Certains)/m);
  });
});

test.describe('the seed is a designed object', () => {
  const OPTS: DrillOptions = { seed: 'SEEDCHIP', difficulty: 2, length: 2 };

  test('the running item shows the seed that reproduces it', async ({ page }) => {
    await page.goto(practiceUrl('matrix', OPTS));
    await waitForQuiz(page);

    await expect(page.getByTestId('seed-chip')).toBeVisible();
    await expect(page.getByTestId('seed-value')).toHaveText(OPTS.seed);
  });

  test('copying yields a link that replays the same run', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto(practiceUrl('matrix', OPTS));
    await waitForQuiz(page);

    const before = await page.locator('[data-stimulus="matrix"]').innerHTML();

    await page.getByTestId('seed-copy').click();
    await expect(page.getByTestId('seed-chip')).toHaveAttribute('data-status', 'copied');
    await expect(page.getByTestId('seed-status')).toHaveText(dict('en').seed.copied);

    const link = await page.evaluate(() => navigator.clipboard.readText());
    expect(link).toContain(`seed=${OPTS.seed}`);
    // The pinned difficulty and length survive, or the "same run" claim is false.
    expect(link).toContain(`d=${OPTS.difficulty}`);

    // And the link genuinely reproduces the item.
    const other = await context.newPage();
    await other.goto(link);
    await waitForQuiz(other);
    expect(await other.locator('[data-stimulus="matrix"]').innerHTML()).toBe(before);
    await other.close();
  });

  test('the results screen explains what sharing the seed does', async ({ page }) => {
    await page.goto(practiceUrl('matrix', { ...OPTS, length: 1 }));
    await waitForQuiz(page);
    await page.getByTestId('option-0').click();
    await page.getByTestId('next').click();

    await expect(page.getByTestId('results')).toBeVisible();
    await expect(page.getByTestId('stat-seed')).toContainText(OPTS.seed);
    await expect(page.getByTestId('seed-explain')).toContainText(dict('en').seed.explain);
  });
});

test.describe('social cards', () => {
  test('every format has one, and the page points at it', async ({ page, baseURL }) => {
    const base = new URL(baseURL!).pathname.replace(/\/$/, '');
    for (const meta of ALL_META) {
      await page.goto(`en/practice/${meta.id}/`);
      const content = await page.locator('meta[property="og:image"]').getAttribute('content');
      expect(content, meta.id).toContain(`${base}/en/og/${meta.id}.svg`);
    }
  });

  test('the card is served, is an SVG, and draws the item', async ({ request, baseURL }) => {
    const origin = new URL(baseURL!).origin;
    const base = new URL(baseURL!).pathname.replace(/\/$/, '');

    for (const locale of ['en', 'fr'] as const) {
      const res = await request.get(`${origin}${base}/${locale}/og/matrix.svg`);
      expect(res.status(), locale).toBe(200);
      expect(res.headers()['content-type']).toContain('image/svg+xml');

      const svg = await res.text();
      expect(svg).toContain('data-og-type="matrix"');
      expect(svg).toContain(dict(locale).og.disclaimer);
      // Eight figures, as the item has.
      expect(svg.match(/data-figure=""/g)).toHaveLength(8);
    }
  });
});
