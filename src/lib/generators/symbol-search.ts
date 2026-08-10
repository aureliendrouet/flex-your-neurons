/**
 * Symbol search — does either target symbol appear in the search group?
 *
 * A processing-speed (Gs) task: individually trivial, scored on how many you get through.
 * Accuracy sits near ceiling by design, so the site reports median response time for this
 * type rather than percentage correct — reporting accuracy alone would say almost nothing.
 */
import { createRng } from '../rng';
import { dict, type Locale } from '../i18n';
import {
  confusableWith,
  randomSymbol,
  symbolKey,
  toFigure,
  type Symbol,
} from './symbols';
import type { Difficulty, ErrorType, Generator, Item, ItemTypeMeta } from '../types';

interface Plan {
  targets: number;
  searchSize: number;
  /** Distractors that differ from a target on only one dimension. */
  confusable: boolean;
}

function planFor(difficulty: Difficulty): Plan {
  switch (difficulty) {
    case 1:
      return { targets: 1, searchSize: 3, confusable: false };
    case 2:
      return { targets: 1, searchSize: 4, confusable: false };
    case 3:
      return { targets: 2, searchSize: 5, confusable: false };
    case 4:
      return { targets: 2, searchSize: 5, confusable: true };
    case 5:
      return { targets: 2, searchSize: 6, confusable: true };
  }
}

const meta: ItemTypeMeta = {
  id: 'symbol-search',
  domain: 'Gs',
  icon: '⚡',
  sprintable: true,
};

const MAX_ATTEMPTS = 100;

function generate(seed: string, difficulty: Difficulty, locale: Locale): Item {
  const t = dict(locale).gen.symbolSearch;
  const rng = createRng(`symbol-search:${seed}:${difficulty}`);
  const plan = planFor(difficulty);
  const present = rng.bool(); // balanced yes/no so guessing gains nothing systematic

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const targets: Symbol[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < plan.targets; i++) {
      for (let tries = 0; tries < 30; tries++) {
        const s = randomSymbol(rng);
        if (seen.has(symbolKey(s))) continue;
        seen.add(symbolKey(s));
        targets.push(s);
        break;
      }
    }
    if (targets.length !== plan.targets) continue;

    const targetKeys = new Set(targets.map(symbolKey));
    const search: Symbol[] = [];
    const searchKeys = new Set<string>();

    if (present) {
      const chosen = rng.pick(targets);
      search.push(chosen);
      searchKeys.add(symbolKey(chosen));
    }

    let failed = false;
    while (search.length < plan.searchSize) {
      let candidate: Symbol | null = null;
      for (let tries = 0; tries < 60; tries++) {
        const s = plan.confusable && rng.bool(0.7)
          ? confusableWith(rng.pick(targets), rng)
          : randomSymbol(rng);
        if (targetKeys.has(symbolKey(s))) continue; // would silently make a "no" a "yes"
        if (searchKeys.has(symbolKey(s))) continue;
        candidate = s;
        break;
      }
      if (!candidate) {
        failed = true;
        break;
      }
      searchKeys.add(symbolKey(candidate));
      search.push(candidate);
    }
    if (failed) continue;

    const shuffled = rng.shuffle(search);
    // Independent check: the stated answer must match what is actually in the group.
    const actuallyPresent = shuffled.some((s) => targetKeys.has(symbolKey(s)));
    if (actuallyPresent !== present) continue;

    const answerIndex = present ? 0 : 1;
    const errorTypes: ErrorType[] = present
      ? ['correct', 'plausible']
      : ['plausible', 'correct'];

    return {
      type: 'symbol-search',
      seed,
      difficulty,
      prompt: t.prompt,
      stimulus: {
        kind: 'symbol-search',
        targets: targets.map((sym) => toFigure(sym)),
        search: shuffled.map((sym) => toFigure(sym)),
      },
      responseMode: 'choice',
      options: [
        { kind: 'text', text: t.yes },
        { kind: 'text', text: t.no },
      ],
      answerIndex,
      errorTypes,
      explanation: {
        summary: present ? t.summaryPresent : t.summaryAbsent,
        rules: [t.ruleMatch, t.ruleSpeed],
      },
      suggestedSeconds: 8,
    };
  }

  throw new Error(
    `symbol-search generator exhausted ${MAX_ATTEMPTS} attempts for seed "${seed}" d${difficulty}`,
  );
}

export const symbolSearchGenerator: Generator = { meta, generate };
