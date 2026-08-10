import { expect, test } from '@playwright/test';
import {
  answerCorrectly,
  answerIncorrectly,
  clearAppStorage,
  expectedItem,
  practiceUrl,
  readLocalStorageSessions,
  startSpanIfGated,
  waitForQuiz,
  type DrillOptions,
} from './helpers';

const OPTS: DrillOptions = { seed: 'PERSIST1', difficulty: 2, length: 2 };

/** Runs a complete drill, leaving the browser on the results screen. */
async function completeDrill(page: import('@playwright/test').Page, correct: boolean[]) {
  await page.goto(practiceUrl('matrix', { ...OPTS, length: correct.length }));
  await waitForQuiz(page);
  for (let i = 0; i < correct.length; i++) {
    if (correct[i]) await answerCorrectly(page, 'matrix', OPTS, i);
    else await answerIncorrectly(page, 'matrix', OPTS, i);
    await page.getByTestId('next').click();
  }
  await expect(page.getByTestId('results')).toBeVisible();
}

test.describe('local persistence', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('en/');
    await clearAppStorage(page);
  });

  test('a finished session is written to localStorage', async ({ page }) => {
    await completeDrill(page, [true, false]);

    const sessions = (await readLocalStorageSessions(page)) as {
      mode: string;
      seed: string;
      responses: { correct: boolean; type: string; latencyMs: number }[];
    }[];

    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.mode).toBe('practice');
    expect(sessions[0]!.seed).toBe(OPTS.seed);
    expect(sessions[0]!.responses).toHaveLength(2);
    expect(sessions[0]!.responses.map((r) => r.correct)).toEqual([true, false]);
    expect(sessions[0]!.responses.every((r) => r.type === 'matrix')).toBe(true);
    // Latency must be a real measurement, not a placeholder.
    expect(sessions[0]!.responses.every((r) => r.latencyMs > 0)).toBe(true);
  });

  /**
   * PLAN-2026-08 §2.2. A span item plays its sequence before an answer is possible, and
   * the playback grows with difficulty. If the clock started at mount, the recorded
   * latency would include several seconds of animation and would rise with difficulty
   * regardless of the user. Answering promptly after playback must record a small latency.
   */
  test('span latency excludes the playback animation', async ({ page }) => {
    await page.goto('en/practice/span/?seed=SPANTIME&d=5&n=1');
    await waitForQuiz(page);

    const item = expectedItem('span', 'SPANTIME', 0, 5);
    if (item.stimulus.kind !== 'span') throw new Error('unexpected stimulus');
    const playbackMs =
      item.stimulus.sequence.length * (item.presentation?.stepMs ?? 0) +
      item.stimulus.sequence.length * (item.presentation?.gapMs ?? 0);
    expect(playbackMs, 'this item should have a long playback to be worth testing').toBeGreaterThan(
      5000,
    );

    await startSpanIfGated(page);
    const input = page.getByTestId('span-input');
    await expect(input).toBeEnabled({ timeout: 25_000 });
    await input.fill(item.answerText!);
    await page.getByTestId('submit-text').click();
    await page.getByTestId('next').click();
    await expect(page.getByTestId('results')).toBeVisible();

    const sessions = (await readLocalStorageSessions(page)) as {
      responses: { latencyMs: number }[];
    }[];
    const latency = sessions[0]!.responses[0]!.latencyMs;
    expect(latency).toBeGreaterThan(0);
    expect(latency, `latency ${latency}ms looks like it includes ${playbackMs}ms of playback`).toBeLessThan(
      playbackMs,
    );
  });

  test('sessions store seeds, not items, so history stays small', async ({ page }) => {
    await completeDrill(page, [true, true]);
    const raw = await page.evaluate(() => localStorage.getItem('iq:v1:sessions') ?? '');
    // Two full matrix items would be many kilobytes of figures; seeds are a few hundred bytes.
    expect(raw.length).toBeLessThan(2000);
    expect(raw).not.toContain('pentagon');
    expect(raw).toContain('"seed"');
  });

  test('progress survives a page reload', async ({ page }) => {
    await completeDrill(page, [true, true]);

    await page.goto('en/progress/');
    await expect(page.getByTestId('total-attempts')).toContainText('2');

    await page.reload();
    await expect(page.getByTestId('total-attempts')).toContainText('2');
    await expect(page.getByTestId('total-accuracy')).toContainText('100%');
  });

  test('the dashboard reflects what was actually answered', async ({ page }) => {
    await completeDrill(page, [true, false]);
    await page.goto('en/progress/');

    await expect(page.getByTestId('dashboard')).toHaveAttribute('data-has-data', 'true');
    await expect(page.getByTestId('total-attempts')).toContainText('2');
    await expect(page.getByTestId('total-accuracy')).toContainText('50%');
    await expect(page.getByTestId('total-sessions')).toContainText('1');
    await expect(page.getByTestId('day-streak')).toContainText('1');

    const row = page.getByTestId('type-row-matrix');
    await expect(row).toContainText('2');
    await expect(row).toContainText('50%');

    // Untouched types stay at zero rather than disappearing.
    await expect(page.getByTestId('type-row-syllogism')).toContainText('0');
  });

  test('the domain chart appears only once there is data', async ({ page }) => {
    await page.goto('en/progress/');
    await expect(page.getByTestId('empty-state')).toBeVisible();
    await expect(page.getByTestId('domain-chart')).toHaveCount(0);

    await completeDrill(page, [true, true]);
    await page.goto('en/progress/');
    await expect(page.getByTestId('empty-state')).toHaveCount(0);
    await expect(page.getByTestId('domain-chart')).toBeVisible();
    // Keyed on the CHC code rather than the translated label, so the hook is stable
    // across locales.
    await expect(page.locator('[data-bar="Gf"]')).toBeVisible();
  });

  test('two sessions accumulate rather than overwrite', async ({ page }) => {
    await completeDrill(page, [true, true]);
    await completeDrill(page, [false, false]);

    await page.goto('en/progress/');
    await expect(page.getByTestId('total-attempts')).toContainText('4');
    await expect(page.getByTestId('total-sessions')).toContainText('2');
    await expect(page.getByTestId('total-accuracy')).toContainText('50%');
  });

  test('reset requires confirmation and then clears everything', async ({ page }) => {
    await completeDrill(page, [true, true]);
    await page.goto('en/progress/');
    await expect(page.getByTestId('total-attempts')).toContainText('2');

    // A single click must not destroy data.
    await page.getByTestId('reset').click();
    await expect(page.getByTestId('reset-confirm')).toBeVisible();
    await page.getByTestId('reset-cancel').click();
    await expect(page.getByTestId('total-attempts')).toContainText('2');

    await page.getByTestId('reset').click();
    await page.getByTestId('reset-confirm').click();

    await expect(page.getByTestId('data-notice')).toContainText('History cleared');
    await expect(page.getByTestId('total-attempts')).toContainText('0');
    expect(await readLocalStorageSessions(page)).toEqual([]);

    await page.reload();
    await expect(page.getByTestId('empty-state')).toBeVisible();
  });

  test('settings persist across reloads', async ({ page }) => {
    await page.goto('en/progress/');

    const adaptive = page.getByTestId('setting-adaptive');
    await expect(adaptive).toBeChecked();
    await adaptive.uncheck();

    await page.getByTestId('setting-length').fill('7');
    await page.getByTestId('setting-length').blur();

    await page.reload();
    await expect(page.getByTestId('setting-adaptive')).not.toBeChecked();
    await expect(page.getByTestId('setting-length')).toHaveValue('7');
  });

  test('turning off instant feedback removes the explanation step', async ({ page }) => {
    await page.goto('en/progress/');
    await page.getByTestId('setting-feedback').uncheck();

    await page.goto(practiceUrl('matrix', { ...OPTS, length: 2 }));
    await waitForQuiz(page);
    await answerCorrectly(page, 'matrix', OPTS, 0);

    // No feedback panel; it should have advanced straight to item 2.
    await expect(page.getByTestId('feedback')).toHaveCount(0);
    await expect(page.getByTestId('progress-label')).toHaveText('2 of 2');
  });

  test('exporting produces an importable file', async ({ page }) => {
    await completeDrill(page, [true, false]);
    await page.goto('en/progress/');

    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('export').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^iq-training-\d{4}-\d{2}-\d{2}\.json$/);

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));

    expect(payload.schema).toBe(1);
    expect(payload.sessions).toHaveLength(1);
    expect(payload.sessions[0].responses).toHaveLength(2);
    expect(payload.settings).toHaveProperty('adaptive');
  });

  test('importing merges history without duplicating it', async ({ page }) => {
    await completeDrill(page, [true, true]);
    const original = await readLocalStorageSessions(page);

    await page.goto('en/progress/');
    await clearAppStorage(page);
    await page.reload();
    await expect(page.getByTestId('total-attempts')).toContainText('0');

    const payload = JSON.stringify({ schema: 1, exportedAt: '', sessions: original, settings: {} });
    await page.getByTestId('import').setInputFiles({
      name: 'backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(payload),
    });

    await expect(page.getByTestId('data-notice')).toContainText('Imported 1 session');
    await expect(page.getByTestId('total-attempts')).toContainText('2');

    // Importing the same file again must not double the count.
    await page.getByTestId('import').setInputFiles({
      name: 'backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(payload),
    });
    await expect(page.getByTestId('total-attempts')).toContainText('2');
  });

  test('a corrupt import is rejected with an explanation', async ({ page }) => {
    await page.goto('en/progress/');
    await page.getByTestId('import').setInputFiles({
      name: 'junk.json',
      mimeType: 'application/json',
      buffer: Buffer.from('this is not json'),
    });
    await expect(page.getByTestId('data-notice')).toContainText('not valid JSON');

    await page.getByTestId('import').setInputFiles({
      name: 'wrong.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ schema: 99, sessions: [] })),
    });
    await expect(page.getByTestId('data-notice')).toContainText('schema v99');
  });

  test('corrupt localStorage does not break the app', async ({ page }) => {
    await page.goto('en/progress/');
    await page.evaluate(() => localStorage.setItem('iq:v1:sessions', '{{{not json'));
    await page.reload();

    // It must degrade to "no history", not to a blank page.
    await expect(page.getByTestId('dashboard')).toBeVisible();
    await expect(page.getByTestId('total-attempts')).toContainText('0');
  });

  test('nothing is sent over the network while answering', async ({ page }) => {
    const external: string[] = [];
    page.on('request', (req) => {
      const url = new URL(req.url());
      if (url.hostname !== 'localhost' && url.protocol !== 'data:') external.push(req.url());
    });

    await completeDrill(page, [true, true]);
    expect(external).toEqual([]);
  });
});
