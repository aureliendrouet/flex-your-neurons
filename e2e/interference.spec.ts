/**
 * The Stroop task, and the read-out that is the reason it exists.
 *
 * The interference score is a *contrast* between two kinds of trial, and congruency was never stored
 * on a response — it is re-derived by regenerating each item from its seed. So the only honest way to
 * test the read-out end to end is to play real trials and check the number that comes out, which is
 * what the last test here does.
 */
import { expect, test } from '@playwright/test';

const url = (extra: string) => `en/practice/interference/?seed=IFE2E001&${extra}`;

test.describe('interference', () => {
  test('asks for the count and offers the digit as the lure', async ({ page }) => {
    await page.goto(url('d=4&n=1'));
    await expect(page.getByTestId('quiz')).toHaveAttribute('data-hydrated', 'true');

    const glyphs = await page.locator('.glyph').allTextContents();
    expect(glyphs.length).toBeGreaterThan(0);
    // All one digit: a mixed row would be a different question.
    expect(new Set(glyphs).size).toBe(1);

    const options = await page.locator('.option-text').allTextContents();
    const count = String(glyphs.length);
    const digit = glyphs[0]!;
    expect(options, 'the count must be answerable').toContain(count);

    if (digit !== count) {
      // The automatic answer is on screen as an option. Without it there is nothing to inhibit.
      expect(options, 'the digit is not offered').toContain(digit);
      await page.getByTestId(`option-${options.indexOf(digit)}`).click();
      await expect(page.getByTestId('diagnosis-tag')).toHaveText('wrong attribute');
    }
  });

  /**
   * The response set must be identical from item to item.
   *
   * A shuffled option list would add a visual search to a task whose whole measurement is a few
   * hundred milliseconds of inhibition — the search would swamp the effect. A stable keypad is also
   * what makes the response mapping learnable, which is the point of a speeded task.
   */
  test('never moves the options between items', async ({ page }) => {
    await page.goto(url('d=3&n=6'));
    await expect(page.getByTestId('quiz')).toHaveAttribute('data-hydrated', 'true');

    const seen: string[] = [];
    for (let i = 0; i < 5; i++) {
      seen.push((await page.locator('.option-text').allTextContents()).join(','));
      const glyphs = await page.locator('.glyph').allTextContents();
      await page.keyboard.press(String(glyphs.length));
      const next = page.getByTestId('next');
      if ((await next.count()) > 0) await next.click();
      await expect(page.locator('.glyph').first()).toBeVisible();
    }
    expect(new Set(seen).size, `option sets seen: ${[...new Set(seen)].join(' | ')}`).toBe(1);
    expect(seen[0]).toBe('1,2,3,4,5');
  });

  test('says nothing about interference before there are enough trials', async ({ page }) => {
    await page.goto(url('d=3&n=2'));
    await expect(page.getByTestId('quiz')).toHaveAttribute('data-hydrated', 'true');
    for (let i = 0; i < 2; i++) {
      const glyphs = await page.locator('.glyph').allTextContents();
      await page.keyboard.press(String(glyphs.length));
      const next = page.getByTestId('next');
      if ((await next.count()) > 0) await next.click();
      await page.waitForTimeout(60);
    }
    await page.goto('en/progress/');
    // A median of one latency is not a median; the card must not appear at all.
    await expect(page.getByTestId('interference-section')).toHaveCount(0);
  });

  /**
   * The whole pipeline: play trials, then read the contrast off the progress page.
   *
   * Incongruent trials are answered deliberately slower, so the sign of the result is known in
   * advance. That is what makes this a test rather than an observation — a partition that mixed the
   * two conditions up would produce a gap near zero, and one that inverted them would produce a
   * negative.
   */
  test('reports the contrast after enough trials, derived from the seeds alone', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(url('d=1&n=40'));
    await expect(page.getByTestId('quiz')).toHaveAttribute('data-hydrated', 'true');

    let congruent = 0;
    let incongruent = 0;
    for (let i = 0; i < 40; i++) {
      if ((await page.getByTestId('results').count()) > 0) break;
      const glyphs = await page.locator('.glyph').allTextContents();
      if (glyphs.length === 0) break;
      const isCongruent = String(glyphs.length) === glyphs[0];
      if (isCongruent) congruent++;
      else {
        incongruent++;
        await page.waitForTimeout(200); // a deliberate, known cost on the conflicting trials
      }
      await page.keyboard.press(String(glyphs.length));
      const next = page.getByTestId('next');
      if ((await next.count()) > 0) await next.click();
      await page.waitForTimeout(50);
    }
    // Both conditions have to be represented, or the contrast is not defined.
    expect(congruent, 'congruent trials played').toBeGreaterThanOrEqual(8);
    expect(incongruent, 'incongruent trials played').toBeGreaterThanOrEqual(8);

    await page.goto('en/progress/');
    await expect(page.getByTestId('interference-section')).toBeVisible();
    const gap = (await page.getByTestId('stat-interference').textContent()) ?? '';
    // Positive, and in the ballpark of the delay that was injected — so the partition is right.
    const ms = Number(gap.match(/\+(\d+)\s*ms/)?.[1] ?? '-1');
    expect(ms, `interference read "${gap}"`).toBeGreaterThan(100);
  });
});
