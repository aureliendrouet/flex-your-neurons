import { expect, test } from '@playwright/test';
import { ALL_META, getItemText } from '../src/lib/generators';
import { dict, LOCALES } from '../src/lib/i18n';
import {
  answerCorrectly,
  answerIncorrectly,
  expectedItem,
  practiceUrl,
  waitForQuiz,
  type DrillOptions,
} from './helpers';

const FR: DrillOptions = { seed: 'FRTEST01', difficulty: 3, length: 2, locale: 'fr' };
const EN: DrillOptions = { ...FR, locale: 'en' };

const fr = dict('fr');
const en = dict('en');

test.describe('language routing', () => {
  test('the site root offers a choice and redirects', async ({ page }) => {
    await page.goto('./');
    // The inline script replaces the URL before paint; either way we must end on a locale.
    await page.waitForURL(/\/(en|fr)\/$/);
    expect(page.url()).toMatch(/\/(en|fr)\/$/);
  });

  test('the root honours the browser language', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'fr-FR' });
    const page = await context.newPage();
    await page.goto('./');
    await page.waitForURL(/\/fr\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(fr.pages.home.title);
    await context.close();
  });

  test('the root falls back to English for an unsupported language', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'de-DE' });
    const page = await context.newPage();
    await page.goto('./');
    await page.waitForURL(/\/en\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(en.pages.home.title);
    await context.close();
  });

  test('the root remembers a previously chosen language', async ({ page }) => {
    await page.goto('en/');
    await page.evaluate(() => localStorage.setItem('iq:v1:locale', 'fr'));
    await page.goto('./');
    await page.waitForURL(/\/fr\/$/);
  });

  /**
   * With scripting off, the `<noscript>` meta-refresh takes over and lands the reader on
   * the default language rather than leaving them on a blank chooser. The header language
   * switcher is then how they get to French. The site must never be a dead end.
   */
  test('still reaches a real page without JavaScript', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('./');
    await page.waitForURL(/\/en\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(en.pages.home.title);
    // And the switcher works without scripting, because it is a plain link.
    await page.getByTestId('lang-fr').click();
    await expect(page).toHaveURL(/\/fr\/$/);
    await context.close();
  });

  /**
   * Belt and braces: if both scripting and the meta-refresh are blocked, the chooser
   * markup itself has to be usable. Asserted on the served HTML rather than in a browser,
   * since no engine will actually stop at that page.
   */
  test('serves a usable chooser in the root HTML', async ({ request, baseURL }) => {
    const response = await request.get(baseURL!);
    const html = await response.text();
    expect(html).toContain('data-testid="choose-en"');
    expect(html).toContain('data-testid="choose-fr"');
    expect(html).toContain('data-testid="redirect-title"');
  });

  test('every page exists in both languages', async ({ page }) => {
    for (const locale of LOCALES) {
      for (const path of ['', 'practice/', 'test/', 'progress/', 'about/']) {
        const response = await page.goto(`${locale}/${path}`);
        expect(response?.status(), `${locale}/${path}`).toBe(200);
        await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      }
    }
  });

  test('sets the html lang attribute for each locale', async ({ page }) => {
    await page.goto('en/about/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await page.goto('fr/about/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  });

  test('declares each page as an alternate of the other language', async ({ page }) => {
    await page.goto('fr/practice/matrix/');
    const alternates = await page
      .locator('link[rel="alternate"]')
      .evaluateAll((els) => els.map((e) => [e.getAttribute('hreflang'), e.getAttribute('href')]));

    const byLang = Object.fromEntries(alternates);
    expect(byLang['en']).toMatch(/\/en\/practice\/matrix\/$/);
    expect(byLang['fr']).toMatch(/\/fr\/practice\/matrix\/$/);
    expect(byLang['x-default']).toMatch(/\/en\/practice\/matrix\/$/);
  });
});

test.describe('language switcher', () => {
  test('is present and marks the current language', async ({ page }) => {
    await page.goto('en/');
    await expect(page.getByTestId('language-switcher')).toBeVisible();
    await expect(page.getByTestId('lang-en')).toHaveAttribute('aria-current', 'true');
    await expect(page.getByTestId('lang-fr')).not.toHaveAttribute('aria-current', 'true');
  });

  test('switches language while staying on the same page', async ({ page }) => {
    await page.goto('en/practice/rotation/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      getItemText('rotation', 'en').name,
    );

    await page.getByTestId('lang-fr').click();

    await expect(page).toHaveURL(/\/fr\/practice\/rotation\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      getItemText('rotation', 'fr').name,
    );
  });

  test('switches back again', async ({ page }) => {
    await page.goto('fr/about/');
    await page.getByTestId('lang-en').click();
    await expect(page).toHaveURL(/\/en\/about\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(en.pages.about.title);
  });

  test('remembers the choice for the next visit to the root', async ({ page }) => {
    await page.goto('en/');
    await page.getByTestId('lang-fr').click();
    // The URL matches as soon as navigation commits, which can be before the new page's
    // script has run — so wait for the document itself to be the French one, then poll.
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('iq:v1:locale')))
      .toBe('fr');

    // And that preference is what the root then acts on.
    await page.goto('./');
    await page.waitForURL(/\/fr\/$/);
  });
});

test.describe('French content', () => {
  test('translates the navigation and the footer', async ({ page }) => {
    await page.goto('fr/');
    await expect(page.getByTestId('nav-practice')).toHaveText(fr.nav.practice);
    await expect(page.getByTestId('nav-test')).toHaveText(fr.nav.test);
    await expect(page.getByTestId('nav-progress')).toHaveText(fr.nav.progress);
    await expect(page.getByText(fr.footer.whyItMatters)).toBeVisible();
  });

  test('translates every item-type card', async ({ page }) => {
    await page.goto('fr/practice/');
    for (const meta of ALL_META) {
      const card = page.getByTestId(`practice-card-${meta.id}`);
      await expect(card, meta.id).toContainText(getItemText(meta.id, 'fr').name);
    }
  });

  test('translates the quiz chrome and the prompt', async ({ page }) => {
    await page.goto(practiceUrl('matrix', FR));
    await waitForQuiz(page);

    const item = expectedItem('matrix', FR.seed, 0, FR.difficulty, 'fr');
    await expect(page.getByTestId('quiz')).toHaveAttribute('data-locale', 'fr');
    await expect(page.getByTestId('prompt')).toHaveText(item.prompt);
    await expect(page.getByTestId('prompt')).toHaveText(fr.gen.matrix.prompt);
    await expect(page.getByTestId('difficulty-label')).toContainText(fr.quiz.level(FR.difficulty));
    await expect(page.getByTestId('progress-label')).toHaveText(fr.quiz.progress(1, FR.length));
  });

  test('gives feedback and explanations in French', async ({ page }) => {
    await page.goto(practiceUrl('matrix', FR));
    await waitForQuiz(page);
    await answerCorrectly(page, 'matrix', FR, 0);

    await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', 'true');
    await expect(page.getByTestId('verdict')).toHaveText(fr.quiz.correct);
    await expect(page.getByTestId('next')).toContainText(fr.quiz.next);

    const rules = page.getByTestId('feedback').locator('ul li');
    await expect(rules.first()).toBeVisible();
    // The explanation must be the French rule text, not the English one.
    await expect(page.getByTestId('feedback')).not.toContainText('stays the same');
  });

  test('marks a wrong answer in French', async ({ page }) => {
    await page.goto(practiceUrl('matrix', FR));
    await waitForQuiz(page);
    await answerIncorrectly(page, 'matrix', FR, 0);
    await expect(page.getByTestId('verdict')).toHaveText(fr.quiz.notQuite);
  });

  test('renders syllogism premises in French', async ({ page }) => {
    await page.goto(practiceUrl('syllogism', FR));
    await waitForQuiz(page);

    const premises = page.locator('[data-stimulus="text"] li');
    await expect(premises).toHaveCount(2);
    for (const text of await premises.allTextContents()) {
      expect(text).toMatch(/^(Tous|Aucun|Certains)\b/);
    }
  });

  test('shows the results screen in French, still without an IQ', async ({ page }) => {
    const opts = { ...FR, length: 1 };
    await page.goto(practiceUrl('matrix', opts));
    await waitForQuiz(page);
    await answerCorrectly(page, 'matrix', opts, 0);
    await page.getByTestId('next').click();

    const results = page.getByTestId('results');
    await expect(results).toBeVisible();
    await expect(results).toContainText(fr.results.heading);
    await expect(results).toContainText('pas d’un QI');
    await expect(results).not.toContainText(/QI\s*[:=]?\s*\d/);
  });

  test('translates the progress dashboard', async ({ page }) => {
    await page.goto('fr/progress/');
    await expect(page.getByTestId('dashboard')).toHaveAttribute('data-locale', 'fr');
    await expect(page.getByTestId('total-attempts')).toContainText(fr.dashboard.itemsAnswered);
    await expect(page.getByTestId('empty-state')).toContainText('Rien d’enregistré');
    await expect(page.getByTestId('setting-adaptive')).toBeVisible();
    await expect(page.getByText(fr.dashboard.settingAdaptive)).toBeVisible();
  });

  test('formats numbers the French way', async ({ page }) => {
    const opts = { ...FR, length: 2 };
    await page.goto(practiceUrl('matrix', opts));
    await waitForQuiz(page);
    await answerCorrectly(page, 'matrix', opts, 0);
    await page.getByTestId('next').click();
    await answerIncorrectly(page, 'matrix', opts, 1);
    await page.getByTestId('next').click();

    // 50% in French carries a space before the sign.
    await expect(page.getByTestId('stat-accuracy')).toContainText(/50\s%/);
  });
});

test.describe('locale does not change the item', () => {
  /**
   * The end-to-end counterpart of the unit test: the same seed must draw the same figures
   * in both languages, so a shared link is the same test whoever opens it.
   */
  test('renders identical figures for the same seed in both languages', async ({ page }) => {
    /*
     * Fill-pattern ids are generated per render (`useId`) so that many figures can share a
     * document, which means the raw markup differs run to run for reasons that have
     * nothing to do with locale. Normalise the id, keep everything else byte-exact.
     */
    const figures = () =>
      page
        .locator('[data-stimulus="matrix"] svg[data-figure]')
        .evaluateAll((els) =>
          els.map((e) =>
            e.innerHTML.replace(/(id="|url\(#)[^"#)]*?-(dots|hatch|cross|dense)/g, '$1UID-$2'),
          ),
        );

    await page.goto(practiceUrl('matrix', EN));
    await waitForQuiz(page);
    const english = await figures();

    await page.goto(practiceUrl('matrix', FR));
    await waitForQuiz(page);
    const french = await figures();

    expect(french.length).toBeGreaterThan(0);
    expect(french).toEqual(english);
  });

  test('keeps the same correct option index in both languages', async ({ page }) => {
    const enItem = expectedItem('matrix', FR.seed, 0, FR.difficulty, 'en');
    const frItem = expectedItem('matrix', FR.seed, 0, FR.difficulty, 'fr');
    expect(frItem.answerIndex).toBe(enItem.answerIndex);

    await page.goto(practiceUrl('matrix', FR));
    await waitForQuiz(page);
    await page.getByTestId(`option-${enItem.answerIndex}`).click();
    await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', 'true');
  });

  test('a session recorded in French reads correctly in English', async ({ page }) => {
    const opts = { ...FR, length: 1 };
    await page.goto(practiceUrl('matrix', opts));
    await waitForQuiz(page);
    await answerCorrectly(page, 'matrix', opts, 0);
    await page.getByTestId('next').click();
    await expect(page.getByTestId('results')).toBeVisible();

    // History is language-neutral: it stores seeds, not sentences.
    await page.goto('en/progress/');
    await expect(page.getByTestId('total-attempts')).toContainText('1');
    await expect(page.getByTestId('total-accuracy')).toContainText('100%');
    await expect(page.getByTestId('type-row-matrix')).toContainText(
      getItemText('matrix', 'en').name,
    );
  });
});
