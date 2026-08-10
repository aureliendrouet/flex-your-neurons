import { expect, test } from '@playwright/test';
import { ITEM_TYPE_IDS, generateItem } from '../src/lib/generators';
import { deriveSeed } from '../src/lib/rng';
import { dict } from '../src/lib/i18n';
import {
  clearAppStorage,
  readLocalStorageSessions,
  startSpanIfGated,
  waitForQuiz,
} from './helpers';
import type { Difficulty, ItemTypeId } from '../src/lib/types';

const SEED = 'FULLTEST';
/*
 * Level 1, chosen for wall-clock cost rather than coverage. Three formats play themselves before
 * they can be answered, and their playback is real time no test can compress: at level 2 the n-back
 * stream alone runs about eleven seconds. Nothing in this file depends on the level — these tests are
 * about rotation order, withheld feedback and scoring — so the cheapest one that still exercises
 * every format is the right choice. Format-specific behaviour is covered in `item-types.spec.ts`.
 */
const DIFFICULTY: Difficulty = 1;
const LENGTH = ITEM_TYPE_IDS.length;

function testUrl(n = LENGTH): string {
  return `en/test/?seed=${SEED}&d=${DIFFICULTY}&n=${n}`;
}

/** The full test rotates through the types in registry order. */
function typeAt(index: number): ItemTypeId {
  return ITEM_TYPE_IDS[index % ITEM_TYPE_IDS.length]!;
}

async function answerCurrent(page: import('@playwright/test').Page, index: number, correct: boolean) {
  const type = typeAt(index);
  const item = generateItem(type, deriveSeed(SEED, type, index), DIFFICULTY);

  // Outside the branch: n-back is gated and answered by choice. No-op where there is no gate.
  await startSpanIfGated(page);
  if (item.responseMode === 'text') {
    const input = page.getByTestId('span-input');
    await expect(input).toBeEnabled({ timeout: 25_000 });
    await input.fill(correct ? item.answerText! : 'XXXXXX');
    await page.getByTestId('submit-text').click();
    return;
  }
  const pick = correct ? item.answerIndex : item.answerIndex === 0 ? 1 : 0;
  await page.getByTestId(`option-${pick}`).click();
}

test.describe('full test mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('en/');
    await clearAppStorage(page);
  });

  /**
   * The only test that walks all fourteen formats, and the slowest thing in the suite by a wide
   * margin — so it gets its own budget rather than the default 45 seconds.
   *
   * The cost is not the item count. Three formats play themselves before they can be answered
   * (span, n-back, head count), and their playback is real wall-clock time that no amount of
   * waiting-smarter can remove. Wall time therefore scales with how many *transient* formats exist,
   * not with how many formats exist.
   *
   * It has been raised twice. It first went past the 45-second default when head count shipped, and
   * then past 120 seconds under full-suite load — solo it runs in under thirty, so eight workers
   * competing for the machine cost it roughly a factor of four. The pinned difficulty was dropped to
   * level 1 at the same time, which is where most of the saving came from. Expect to revisit this
   * when the next transient format lands.
   */
  test('rotates through every item type', async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto(testUrl());
    await waitForQuiz(page);

    const seen: string[] = [];
    for (let i = 0; i < LENGTH; i++) {
      const type = await page.getByTestId('quiz').getAttribute('data-item-type');
      seen.push(type!);
      await answerCurrent(page, i, true);
    }

    expect(seen).toEqual(ITEM_TYPE_IDS);
    await expect(page.getByTestId('results')).toBeVisible();
  });

  /**
   * The defining difference from practice mode: a test gives no feedback until the end,
   * so an early item cannot teach you how to answer a later one.
   */
  test('withholds feedback until the whole test is finished', async ({ page }) => {
    await page.goto(testUrl(3));
    await waitForQuiz(page);

    await answerCurrent(page, 0, false);
    await expect(page.getByTestId('feedback')).toHaveCount(0);
    await expect(page.getByTestId('progress-label')).toHaveText('2 of 3');

    await answerCurrent(page, 1, true);
    await expect(page.getByTestId('feedback')).toHaveCount(0);

    await answerCurrent(page, 2, true);
    await expect(page.getByTestId('results')).toBeVisible();
  });

  test('reports an accurate score broken down by type', async ({ page }) => {
    await page.goto(testUrl(4));
    await waitForQuiz(page);

    const pattern = [true, false, true, false];
    for (let i = 0; i < pattern.length; i++) await answerCurrent(page, i, pattern[i]!);

    await expect(page.getByTestId('stat-correct')).toContainText('2 / 4');
    await expect(page.getByTestId('stat-accuracy')).toContainText('50%');
    await expect(page.getByTestId('stat-seed')).toContainText(SEED);

    for (let i = 0; i < pattern.length; i++) {
      await expect(page.getByTestId(`result-row-${typeAt(i)}`)).toBeVisible();
    }
  });

  test('records the whole test as one session', async ({ page }) => {
    await page.goto(testUrl(3));
    await waitForQuiz(page);
    for (let i = 0; i < 3; i++) await answerCurrent(page, i, true);
    await expect(page.getByTestId('results')).toBeVisible();

    const sessions = (await readLocalStorageSessions(page)) as {
      mode: string;
      responses: unknown[];
    }[];
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.mode).toBe('test');
    expect(sessions[0]!.responses).toHaveLength(3);
  });

  test('offers a route onward to the progress page', async ({ page }) => {
    await page.goto(testUrl(1));
    await waitForQuiz(page);
    await answerCurrent(page, 0, true);

    await page.getByTestId('see-progress').click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Progress');
    await expect(page.getByTestId('total-attempts')).toContainText('1');
  });

  /*
   * Asserted against the dictionary rather than against copy pasted in here. The literal used
   * to be "Twenty items is far too few", which broke the moment three formats shipped and the
   * full test grew from twenty items to twenty-six — a copy edit failing a behaviour test tells
   * you nothing. Reading the strings back also checks every caveat is rendered, not just one.
   */
  test('the page is honest about how it differs from a real battery', async ({ page }) => {
    await page.goto('en/test/');
    const { differsHeading, differs } = dict('en').pages.test;
    await expect(page.getByText(differsHeading, { exact: false })).toBeVisible();
    for (const caveat of differs) {
      await expect(page.getByText(caveat, { exact: false })).toBeVisible();
    }
  });
});

test.describe('adaptive difficulty', () => {
  test('rises after a run of correct answers', async ({ page }) => {
    await page.goto('en/');
    await clearAppStorage(page);

    // No `d=` here, so the adaptive ladder is in charge.
    await page.goto('en/practice/matrix/?seed=LADDER01&n=8');
    await waitForQuiz(page);

    const start = Number(await page.getByTestId('quiz').getAttribute('data-difficulty'));

    // Three correct in a row must step the level up.
    for (let i = 0; i < 3; i++) {
      const difficulty = Number(
        await page.getByTestId('quiz').getAttribute('data-difficulty'),
      ) as Difficulty;
      const item = generateItem('matrix', deriveSeed('LADDER01', 'matrix', i), difficulty);
      await page.getByTestId(`option-${item.answerIndex}`).click();
      await page.getByTestId('next').click();
    }

    const after = Number(await page.getByTestId('quiz').getAttribute('data-difficulty'));
    expect(after).toBe(Math.min(5, start + 1));
  });

  test('falls after consecutive wrong answers', async ({ page }) => {
    await page.goto('en/');
    await clearAppStorage(page);
    await page.goto('en/practice/matrix/?seed=LADDER02&n=8');
    await waitForQuiz(page);

    const start = Number(await page.getByTestId('quiz').getAttribute('data-difficulty'));
    test.skip(start === 1, 'already at the lowest level');

    for (let i = 0; i < 2; i++) {
      const difficulty = Number(
        await page.getByTestId('quiz').getAttribute('data-difficulty'),
      ) as Difficulty;
      const item = generateItem('matrix', deriveSeed('LADDER02', 'matrix', i), difficulty);
      await page.getByTestId(`option-${item.answerIndex === 0 ? 1 : 0}`).click();
      await page.getByTestId('next').click();
    }

    const after = Number(await page.getByTestId('quiz').getAttribute('data-difficulty'));
    expect(after).toBe(start - 1);
  });

  test('stays put when adaptation is switched off', async ({ page }) => {
    await page.goto('en/progress/');
    await clearAppStorage(page);
    await page.reload();
    await page.getByTestId('setting-adaptive').uncheck();

    await page.goto('en/practice/matrix/?seed=NOADAPT1&n=6');
    await waitForQuiz(page);
    const start = await page.getByTestId('quiz').getAttribute('data-difficulty');

    for (let i = 0; i < 4; i++) {
      const item = generateItem('matrix', deriveSeed('NOADAPT1', 'matrix', i), Number(start) as Difficulty);
      await page.getByTestId(`option-${item.answerIndex}`).click();
      await page.getByTestId('next').click();
      await expect(page.getByTestId('quiz')).toHaveAttribute('data-difficulty', start!);
    }
  });
});
