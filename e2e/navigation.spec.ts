import { expect, test } from '@playwright/test';
import { ALL_META, getItemText } from '../src/lib/generators';

test.describe('site navigation', () => {
  test('the home page loads and states what the site is', async ({ page }) => {
    await page.goto('en/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Train on reasoning-test formats');
    await expect(page.getByTestId('cta-test')).toBeVisible();
    await expect(page.getByTestId('cta-practice')).toBeVisible();
  });

  test('every item type has a card on the home page', async ({ page }) => {
    await page.goto('en/');
    for (const meta of ALL_META) {
      await expect(page.getByTestId(`type-card-${meta.id}`), meta.id).toBeVisible();
    }
  });

  test('the main nav reaches every page', async ({ page }) => {
    await page.goto('en/');

    await page.getByTestId('nav-practice').click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Practice');

    await page.getByTestId('nav-test').click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Full test');

    await page.getByTestId('nav-progress').click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Progress');

    await page.getByTestId('nav-about').click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText("What this measures");

    await page.getByTestId('nav-home').click();
    await expect(page.getByTestId('cta-test')).toBeVisible();
  });

  test('the current page is marked for assistive tech', async ({ page }) => {
    await page.goto('en/progress/');
    await expect(page.getByTestId('nav-progress')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('nav-home')).not.toHaveAttribute('aria-current', 'page');
  });

  /**
   * GitHub Pages serves the site from a subdirectory, so every internal link and asset has
   * to carry the base path. A missing base is the single most common way an Astro site
   * works locally and 404s once deployed.
   */
  test('all links and assets respect the configured base path', async ({ page, baseURL }) => {
    const base = new URL(baseURL!).pathname.replace(/\/$/, '');
    test.skip(base === '', 'no base path configured');

    await page.goto('en/');
    const hrefs = await page.locator('a[href^="/"]').evaluateAll((els) =>
      els.map((e) => e.getAttribute('href')!),
    );
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(href, `"${href}" is missing the base path`).toMatch(new RegExp(`^${base}/`));
    }

    const favicon = await page.locator('link[rel="icon"]').getAttribute('href');
    expect(favicon).toMatch(new RegExp(`^${base}/`));
  });

  test('no page logs a console error', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    for (const path of ['./', 'en/', 'en/practice/', 'en/test/', 'en/progress/', 'en/about/', 'en/terms/', 'fr/', 'fr/terms/', 'fr/practice/matrix/']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
    }
    expect(errors).toEqual([]);
  });

  /**
   * The terms page is reached from the footer rather than the nav, so the footer link is
   * the only route to it and has to work from every page.
   */
  test('the footer links to the terms page in both locales', async ({ page }) => {
    for (const locale of ['en', 'fr']) {
      for (const from of ['', 'practice/', 'progress/']) {
        await page.goto(`${locale}/${from}`);
        const link = page.getByTestId('footer-terms');
        await expect(link, `${locale}/${from}`).toBeVisible();
        await link.click();
        await expect(page).toHaveURL(new RegExp(`/${locale}/terms/$`));
        await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      }
    }
  });

  /**
   * The route segment is deliberately NOT translated, because `pathForLocale` swaps only
   * the locale segment. That decision is only safe if the switcher round-trips here.
   */
  test('the language switcher round-trips on the terms page', async ({ page }) => {
    await page.goto('en/terms/');
    await page.getByTestId('lang-fr').click();
    await expect(page).toHaveURL(/\/fr\/terms\/$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');

    await page.getByTestId('lang-en').click();
    await expect(page).toHaveURL(/\/en\/terms\/$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('the terms page states it is not an assessment instrument', async ({ page }) => {
    await page.goto('en/terms/');
    await expect(page.locator('[data-terms-section]')).toHaveCount(8);
    await expect(page.getByRole('heading', { level: 2 }).nth(1)).toContainText(
      'not an assessment instrument',
    );
    await expect(page.getByTestId('terms-updated')).toBeVisible();

    await page.goto('fr/terms/');
    await expect(page.locator('[data-terms-section]')).toHaveCount(8);
    await expect(page.getByRole('heading', { level: 2 }).nth(1)).toContainText(
      'pas un instrument d’évaluation',
    );
  });

  test('the terms page appears in the sitemap', async ({ request, baseURL }) => {
    const origin = new URL(baseURL!).origin;
    const base = new URL(baseURL!).pathname.replace(/\/$/, '');
    const index = await (await request.get(`${origin}${base}/sitemap-index.xml`)).text();
    // The index lists the *production* origin, so follow it by path on the test server.
    expect(index).toContain('sitemap-0.xml');
    const urls = await (await request.get(`${origin}${base}/sitemap-0.xml`)).text();
    expect(urls).toContain('/en/terms/');
    expect(urls).toContain('/fr/terms/');
  });

  test('every practice page is reachable and describes its format', async ({ page }) => {
    for (const meta of ALL_META) {
      await page.goto(`en/practice/${meta.id}/`);
      const text = getItemText(meta.id, 'en');
      await expect(page.getByRole('heading', { level: 1 }), meta.id).toHaveText(text.name);
      await expect(page.getByText(text.seenIn, { exact: false }).first()).toBeVisible();
    }
  });
});
