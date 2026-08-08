/**
 * The quiz runner: generates items from a seed, collects responses, scores them, and
 * persists the session to localStorage.
 *
 * Rendered with `client:only` rather than `client:load`. The session seed is drawn at
 * mount and history comes from localStorage, so a server-rendered pass would produce
 * different markup from the client's first paint — a guaranteed hydration mismatch.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import SeedChip from './SeedChip';
import ShortcutSheet from './ShortcutSheet';
import StimulusView from './StimulusView';
import FigureView, { describeFigure } from './FigureView';
import GridView from './GridView';
import { generateItem, getItemText, getMeta } from '../lib/generators';
import { deriveSeed, normaliseSeed, randomSeed } from '../lib/rng';
import { dict, type Locale } from '../lib/i18n';
import { localeHref } from '../lib/links';
import {
  advanceLadder,
  formatDuration,
  formatPercent,
  dominantErrorType,
  isCorrect,
  median,
  newLadder,
  normaliseTextAnswer,
  suggestedStart,
  tallyErrorTypes,
  type Ladder,
} from '../lib/scoring';
import {
  $settings,
  $summary,
  DEFAULT_SETTINGS,
  makeResponse,
  newSession,
  saveSession,
} from '../lib/store';
import type { Difficulty, ErrorType, ItemTypeId, Option, Response, Session } from '../lib/types';

interface Props {
  mode: 'practice' | 'test';
  types: ItemTypeId[];
  locale: Locale;
  /** Item count. Practice defaults to the user's setting; tests use a fixed length. */
  length?: number;
  /** Fixed seed, e.g. from a shared link. */
  seed?: string;
  /** Fixed difficulty; when absent the adaptive ladder is used. */
  difficulty?: Difficulty;
}

type Phase = 'answering' | 'revealed' | 'finished';

const OPTION_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8'];

/**
 * URL overrides: `?seed=ABC12345` replays an exact run, `?d=1..5` pins the difficulty,
 * `?n=10` sets the length. This is what makes a seed shareable — two people opening the
 * same link get byte-identical items, in whichever language each of them reads — and it
 * is also how the end-to-end tests pin down an item whose answer they compute themselves.
 */
function readUrlOverrides(): { seed?: string; difficulty?: Difficulty; length?: number } {
  if (typeof location === 'undefined') return {};
  const params = new URLSearchParams(location.search);

  const seedParam = params.get('seed');
  const seed = seedParam ? normaliseSeed(seedParam) || undefined : undefined;

  const d = Number(params.get('d'));
  const difficulty = Number.isInteger(d) && d >= 1 && d <= 5 ? (d as Difficulty) : undefined;

  const n = Number(params.get('n'));
  const length = Number.isInteger(n) && n >= 1 && n <= 100 ? n : undefined;

  return { seed, difficulty, length };
}

export default function Quiz({
  mode,
  types,
  locale,
  length,
  seed: fixedSeed,
  difficulty: fixedDifficulty,
}: Props) {
  const t = dict(locale);
  const settings = useStore($settings) ?? DEFAULT_SETTINGS;
  const summary = useStore($summary);
  const [overrides] = useState(readUrlOverrides);

  const pinnedSeed = overrides.seed ?? fixedSeed;
  const pinnedDifficulty = overrides.difficulty ?? fixedDifficulty;

  const [session, setSession] = useState<Session | null>(null);
  /**
   * Index and difficulty move together, as one atomic cursor.
   *
   * They used to be separate, with difficulty read live from the ladder — which meant
   * that the answer stepping the ladder up also regenerated the item the user had just
   * answered, wiping the feedback panel out from under them. Difficulty must be fixed
   * when an item is shown and only change when the cursor advances.
   */
  const [cursor, setCursor] = useState<{ index: number; difficulty: Difficulty }>({
    index: 0,
    difficulty: pinnedDifficulty ?? 2,
  });
  const [phase, setPhase] = useState<Phase>('answering');
  const [chosen, setChosen] = useState<number | null>(null);
  const [typed, setTyped] = useState('');
  const [spanReady, setSpanReady] = useState(false);
  const [responses, setResponses] = useState<Response[]>([]);
  const [shortcuts, setShortcuts] = useState(false);

  /**
   * When the current item became answerable, on the monotonic clock.
   *
   * `performance.now()` rather than `Date.now()`: wall-clock time is coarse and jumps when
   * the OS adjusts it (NTP, a manual change), which would write a nonsense — possibly
   * negative — latency into permanent history. Session timestamps stay on `Date.now()`,
   * because those are dates, not durations. See PLAN-2026-08 §2.1.
   */
  const shownAt = useRef<number>(performance.now());
  const textInput = useRef<HTMLInputElement | null>(null);
  /**
   * The staircase lives in a ref, not in state: nothing renders from it directly (the
   * cursor carries the level actually in play), and advancing needs to read the value
   * written moments earlier in the same tick.
   */
  const ladderRef = useRef<Ladder>(newLadder(pinnedDifficulty ?? 2));

  /** Marks "the response window opens now". Called once per item, after paint. */
  const startResponseClock = useCallback(() => {
    shownAt.current = performance.now();
  }, []);

  const index = cursor.index;
  const total =
    overrides.length ?? length ?? (mode === 'test' ? types.length * 2 : (settings.practiceLength ?? 10));

  // Start the session on the client, where a random seed and localStorage are available.
  useEffect(() => {
    setSession(newSession(mode, types, pinnedSeed || randomSeed()));
    if (!pinnedDifficulty) {
      const stats = summary?.byType.find((x) => x.type === types[0]);
      const start = newLadder(types.length === 1 ? suggestedStart(stats) : 2);
      ladderRef.current = start;
      setCursor({ index: 0, difficulty: start.difficulty });
    }
    // Intentionally mount-only: restarting mid-session would discard answers.
  }, []);

  const itemType: ItemTypeId = types[index % types.length]!;
  const difficulty: Difficulty = pinnedDifficulty ?? (settings.adaptive ? cursor.difficulty : 2);

  const item = useMemo(() => {
    if (!session) return null;
    return generateItem(itemType, deriveSeed(session.seed, itemType, index), difficulty, locale);
  }, [session?.seed, itemType, index, difficulty, locale]);

  /**
   * Moves to the next item, adopting whatever level the ladder has reached.
   *
   * The phase is cleared HERE, in the same update as the cursor, not in the effect below.
   * Clearing it in an effect left one render in which the next item was already on screen
   * while the previous item's feedback panel was still mounted — long enough for a quick
   * second Enter to be read as "advance again" and silently skip an item.
   */
  const advance = useCallback(() => {
    setPhase('answering');
    setChosen(null);
    setTyped('');
    setCursor((c) => ({
      index: c.index + 1,
      difficulty: pinnedDifficulty ?? (settings.adaptive ? ladderRef.current.difficulty : 2),
    }));
  }, [pinnedDifficulty, settings.adaptive]);

  // Per-item setup that can only run once the new item exists.
  useEffect(() => {
    if (!item) return;
    const isSpan = item.stimulus.kind === 'span';
    setSpanReady(!isSpan);

    /*
     * Start the clock once the item has actually been painted, not when the effect runs:
     * layout and paint of a fresh matrix are not thinking time. A span item does not start
     * its clock here at all — see `startResponseClock` and PLAN-2026-08 §2.2.
     */
    const frame = isSpan ? null : requestAnimationFrame(() => startResponseClock());
    if (item.responseMode === 'text') {
      // Focus lands on the input only once the sequence has finished playing.
      setTimeout(() => textInput.current?.focus(), 50);
    }
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [item?.seed, item?.type, item?.difficulty]);

  const finish = useCallback(
    (all: Response[]) => {
      setPhase('finished');
      if (session) saveSession({ ...session, responses: all, finishedAt: Date.now() });
    },
    [session],
  );

  const submit = useCallback(
    (choiceIndex: number | null, text?: string) => {
      if (!item || !session || phase !== 'answering') return;

      const correct = isCorrect(item, choiceIndex, text);
      const response = makeResponse(
        item.type,
        item.seed,
        item.difficulty,
        item.answerIndex,
        choiceIndex,
        correct,
        Math.max(0, Math.round(performance.now() - shownAt.current)),
        text,
        choiceIndex === null ? undefined : item.errorTypes[choiceIndex],
      );
      const all = [...responses, response];
      setResponses(all);
      setChosen(choiceIndex);
      if (settings.adaptive && !pinnedDifficulty) {
        ladderRef.current = advanceLadder(ladderRef.current, correct);
      }

      const isLast = all.length >= total;
      const showFeedback = settings.instantFeedback && mode === 'practice';

      if (showFeedback) {
        setPhase('revealed');
        return;
      }
      if (isLast) finish(all);
      else advance();
    },
    [item, session, phase, responses, settings, total, mode, pinnedDifficulty, finish, advance],
  );

  const next = useCallback(() => {
    // Only meaningful from the revealed state; guards against a repeated Enter arriving
    // before the re-render and advancing twice.
    if (phase !== 'revealed') return;
    if (responses.length >= total) finish(responses);
    else advance();
  }, [phase, responses, total, finish, advance]);

  /**
   * Everything the key handler needs, refreshed every render.
   *
   * The listener reads through this ref and is registered exactly once, rather than being
   * torn down and re-attached on every state change. Re-registering left a window after
   * each render in which no listener was attached and a keystroke was simply lost.
   */
  const liveRef = useRef({
    phase,
    item,
    submit,
    next,
    toggleShortcuts: () => {},
    closeShortcuts: () => {},
  });
  liveRef.current = {
    phase,
    item,
    submit,
    next,
    toggleShortcuts: () => setShortcuts((v) => !v),
    closeShortcuts: () => setShortcuts(false),
  };

  // Keyboard: number keys pick an option, Enter advances. Registered once, on mount.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const current = liveRef.current;
      const target = e.target as HTMLElement | null;
      const typing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA';

      /*
       * `?` opens the shortcuts sheet, and it is handled here rather than in the sheet
       * itself: this is the app's one key listener, and a second listener competing for the
       * same events is exactly how a keystroke gets eaten. Guarded on `typing` so a reader
       * can put a question mark into the span input.
       */
      if (!typing && e.key === '?') {
        e.preventDefault();
        current.toggleShortcuts();
        return;
      }
      if (e.key === 'Escape') {
        current.closeShortcuts();
        return;
      }

      if (current.phase === 'revealed' && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        current.next();
        return;
      }
      if (typing || current.phase !== 'answering' || !current.item) return;
      if (current.item.responseMode !== 'choice') return;

      const pos = OPTION_KEYS.indexOf(e.key);
      if (pos >= 0 && pos < current.item.options.length) {
        e.preventDefault();
        current.submit(pos);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /**
   * Focus mode: while an item is live, the site chrome recedes.
   *
   * The flags go on `<html>` rather than on the quiz root because what has to change is
   * everything *around* the island — the header, the footer, the prose below — and an island
   * cannot style its own ancestors. Removed on unmount and whenever the answer is revealed,
   * so the interface comes back the moment measurement stops.
   *
   * `data-speeded` marks the formats where motion is not a matter of taste. On a task scored
   * by response time, an animation anywhere near the stimulus is an active confound: it
   * competes for attention during the exact interval being measured. It covers the
   * processing-speed formats and anything with a transient presentation.
   */
  const speeded = item !== null && (item.presentation !== undefined || getMeta(item.type).domain === 'Gs');

  /*
   * `data-drill` marks "an item is on screen right now", which is a different claim from
   * `data-focus` ("an answer is being collected"). Focus mode quiets the chrome; drill mode
   * gives the item the viewport.
   *
   * It has to cover the revealed phase too. If the lock ended at reveal, answering an item
   * would drop the page back into document flow — the page heading and the format blurb
   * would spring back and shove the option grid down the screen at the exact moment its
   * tags became worth reading.
   */
  const drilling = phase === 'answering' || phase === 'revealed';

  useEffect(() => {
    const root = document.documentElement;
    root.toggleAttribute('data-focus', phase === 'answering');
    root.toggleAttribute('data-drill', drilling);
    root.toggleAttribute('data-speeded', speeded);
    return () => {
      root.removeAttribute('data-focus');
      root.removeAttribute('data-drill');
      root.removeAttribute('data-speeded');
    };
  }, [phase, drilling, speeded]);

  /**
   * Flips once effects have run, so `data-hydrated` on the quiz root is a real signal
   * that the island is interactive. Declared after the listener effect, which guarantees
   * the listener is attached by the time this fires. The end-to-end tests wait on it
   * before sending keystrokes, which `page.keyboard.press` cannot auto-wait for itself.
   */
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  if (!session || !item) {
    return (
      <div class="card quiz-loading" data-testid="quiz-loading">
        <span class="muted">{t.quiz.preparing}</span>
      </div>
    );
  }

  if (phase === 'finished') {
    return (
      <Results
        session={{ ...session, responses }}
        locale={locale}
        onRestart={() => location.reload()}
      />
    );
  }

  const meta = getMeta(item.type);
  const typeText = getItemText(item.type, locale);
  const answered = responses.length;
  const revealed = phase === 'revealed';
  const wasCorrect = revealed && responses[responses.length - 1]?.correct === true;
  const tip = t.quiz.tip(item.options.length);

  /**
   * The named mistake for the option actually chosen, or `null` when there is nothing to
   * diagnose: a correct answer, a text-entry format (no distractors exist to diagnose),
   * or a generator that left the slot as `'correct'`.
   */
  const chosenErrorType = chosen === null ? undefined : item.errorTypes[chosen];
  const diagnosis =
    revealed && !wasCorrect && chosenErrorType && chosenErrorType !== 'correct'
      ? chosenErrorType
      : null;

  return (
    <div
      data-testid="quiz"
      data-hydrated={String(hydrated)}
      data-item-type={item.type}
      data-difficulty={String(item.difficulty)}
      data-locale={locale}
      data-speeded={String(speeded)}
      data-phase={phase}
      class="stack quiz-root"
      style={{ '--stack-gap': '1.25rem' } as never}
    >
      <header class="cluster cluster--between quiz-header" style={{ '--cluster-gap': '1rem' } as never}>
        <div>
          <span class="pill" data-testid="item-type-label">
            {meta.icon} {typeText.name}
          </span>{' '}
          <span class="pill" data-testid="difficulty-label">
            {t.quiz.level(item.difficulty)}
          </span>
        </div>
        <div class="quiz-header-right">
          <span class="muted num-tabular" data-testid="progress-label">
            {t.quiz.progress(Math.min(answered + (revealed ? 0 : 1), total), total)}
          </span>
          <SeedChip seed={session.seed} locale={locale} />
        </div>
      </header>

      <div class="meter" aria-hidden="true">
        {/* The only genuinely dynamic value in the component, so it stays inline — but as
            a custom property, which keeps the *styling* in the stylesheet. */}
        <span style={{ '--fill': `${(answered / total) * 100}%` } as never} />
      </div>

      {/*
        * Two regions, because they have different jobs under a height constraint. The item
        * is what must never leave the screen; the answer tray is what may scroll when eight
        * figural options and an explanation cannot all fit a phone. Splitting them is what
        * lets the stimulus stay pinned while the tray moves under it.
        */}
      <div class="quiz-view">
        <div class="quiz-item" data-testid="quiz-item">
          <h2 class="quiz-prompt" data-testid="prompt">
            {item.prompt}
          </h2>

          {/*
           * A sized container, so the figure can be told to fit the height it has been
           * given rather than the width alone — see `.quiz-figure` in global.css. Collapses
           * to nothing when the format has no stimulus (`kind: 'none'`).
           */}
          <div class="quiz-figure">
            <StimulusView
              stimulus={item.stimulus}
              locale={locale}
              presentation={item.presentation}
              reducedMotion={settings.reducedMotion}
              onPresentationDone={() => {
                /*
                 * PLAN-2026-08 §2.2. A span item plays its sequence before a response is
                 * possible, and the playback lengthens with difficulty. Timing from the
                 * mount would therefore record "the harder the item, the longer you
                 * thought", which is a property of the animation, not the user. The clock
                 * starts here, at the same moment as every other format's: when answering
                 * becomes possible.
                 */
                startResponseClock();
                setSpanReady(true);
                setTimeout(() => textInput.current?.focus(), 30);
              }}
            />
          </div>
        </div>

        <div class="quiz-answer" data-testid="answer-tray">
        {item.responseMode === 'text' ? (
          <form
            data-testid="text-response"
            onSubmit={(e) => {
              e.preventDefault();
              if (!spanReady || typed.trim() === '') return;
              submit(null, typed);
            }}
            class="cluster text-response"
          >
            <label class="sr-only" for="span-answer">
              {t.quiz.yourAnswer}
            </label>
            <input
              id="span-answer"
              ref={textInput}
              data-testid="span-input"
              value={typed}
              disabled={!spanReady || revealed}
              autocomplete="off"
              spellcheck={false}
              placeholder={spanReady ? t.quiz.typeSequence : t.quiz.watching}
              onInput={(e) => setTyped((e.currentTarget as HTMLInputElement).value)}
              class="text-input"
            />
            <button
              class="btn btn-primary"
              type="submit"
              disabled={!spanReady || revealed || typed.trim() === ''}
              data-testid="submit-text"
            >
              {t.quiz.submit}
            </button>
          </form>
        ) : (
          <OptionGrid
            options={item.options}
            chosen={chosen}
            answerIndex={item.answerIndex}
            errorTypes={item.errorTypes}
            revealed={revealed}
            locale={locale}
            onPick={(i) => submit(i)}
          />
        )}

        {revealed && (
          <div
            class="card feedback"
            data-testid="feedback"
            data-correct={String(wasCorrect)}
            data-error-type={diagnosis ?? undefined}
          >
            <strong class="feedback-verdict" data-testid="verdict">
              {wasCorrect ? t.quiz.correct : t.quiz.notQuite}
            </strong>

            {/*
             * The diagnosis leads, ahead of both the rules and the answer. Someone who got
             * the item wrong came here to find out *which* mistake they made; the answer
             * they can see for themselves in the option grid.
             */}
            {diagnosis && (
              <div class="diagnosis" data-testid="diagnosis" data-error-type={diagnosis}>
                <span class="tag" data-testid="diagnosis-tag">
                  {t.diagnosis.tags[diagnosis]}
                </span>
                <p class="diagnosis-body">{t.diagnosis.bodies[diagnosis]}</p>
              </div>
            )}

            <ul class="feedback-rules muted">
              {item.explanation.rules.map((rule, i) => (
                <li key={i}>{rule}</li>
              ))}
            </ul>

            <p class="feedback-answer" data-testid="answer-summary">
              <span class="subtle feedback-answer-label">{t.diagnosis.answerLabel}</span>{' '}
              {item.explanation.summary}
            </p>

            {item.responseMode === 'text' && !wasCorrect && (
              <p class="muted feedback-typed">
                {t.quiz.youTyped(normaliseTextAnswer(typed) || t.quiz.nothing)}
              </p>
            )}
            <button class="btn btn-primary feedback-next" onClick={next} data-testid="next">
              {responses.length >= total ? t.quiz.seeResults : t.quiz.next} <span aria-hidden="true">↵</span>
            </button>
          </div>
        )}

        {!revealed && item.responseMode === 'choice' && (
          <p class="subtle quiz-tip">
            {tip.before}
            <kbd>{tip.first}</kbd>
            <span class="shortcut-dash" aria-hidden="true">–</span>
            <kbd>{tip.last}</kbd>
            {tip.after}{' '}
            <button
              type="button"
              class="link-button"
              onClick={() => setShortcuts(true)}
              data-testid="shortcut-open"
            >
              {t.shortcuts.open}
            </button>
          </p>
        )}
        </div>
      </div>

      <ShortcutSheet
        locale={locale}
        open={shortcuts}
        optionCount={item.options.length}
        onClose={() => setShortcuts(false)}
      />
    </div>
  );
}

function OptionGrid({
  options,
  chosen,
  answerIndex,
  errorTypes,
  revealed,
  locale,
  onPick,
}: {
  options: Option[];
  chosen: number | null;
  answerIndex: number;
  errorTypes: ErrorType[];
  revealed: boolean;
  locale: Locale;
  onPick: (i: number) => void;
}) {
  const t = dict(locale);
  const isFigural = options.some((o) => o.kind !== 'text');
  return (
    <div
      data-testid="options"
      role="group"
      aria-label={t.quiz.answerOptions}
      class={isFigural ? 'option-grid option-grid--figural' : 'option-grid'}
    >
      {options.map((option, i) => {
        let state: string | undefined;
        if (revealed) {
          if (i === answerIndex) state = 'correct';
          else if (i === chosen) state = 'wrong';
        } else if (i === chosen) {
          state = 'chosen';
        }
        /*
         * Once the answer is out, every distractor says how it is wrong — so the grid
         * stops being seven rejects around one winner and becomes a map of the ways this
         * item can be misread. Only shown when revealed: before that it would be the
         * answer key.
         */
        const errorType = errorTypes[i];
        /*
         * The correct option is tagged too, not just the distractors.
         *
         * Marking only the wrong ones would leave "this is the answer" carried by the absence
         * of a chip plus a green tint — and a deuteranopia pass makes the problem obvious: the
         * correct and the chosen-wrong option tint to near-identical colours, so the tint is
         * not a channel. With both states named in words, the verdict reads from text and
         * position alone, which is the rule (docs/DESIGN-PLAN.md §3.1).
         */
        const isAnswer = i === answerIndex;
        const tag = !revealed
          ? null
          : isAnswer
            ? t.quiz.correct
            : errorType && errorType !== 'correct'
              ? t.diagnosis.tags[errorType]
              : null;
        return (
          <button
            key={i}
            class={isFigural ? 'option option--figural' : 'option'}
            data-testid={`option-${i}`}
            data-option-index={String(i)}
            data-state={state}
            data-correct={revealed ? String(i === answerIndex) : undefined}
            data-error-type={revealed ? errorType : undefined}
            disabled={revealed}
            onClick={() => onPick(i)}
            aria-label={
              !tag
                ? optionLabel(option, i, locale)
                : isAnswer
                  ? `${optionLabel(option, i, locale)} — ${t.quiz.correct}.`
                  : `${optionLabel(option, i, locale)} — ${t.diagnosis.optionAria(tag)}`
            }
          >
            <span class="option-key" aria-hidden="true">
              {i + 1}
            </span>
            <OptionBody option={option} />
            {tag && (
              <span
                class={isAnswer ? 'tag option-tag option-tag--correct' : 'tag option-tag'}
                aria-hidden="true"
              >
                {isAnswer ? tag : t.diagnosis.optionTag(tag)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function OptionBody({ option }: { option: Option }) {
  switch (option.kind) {
    case 'text':
      return <span class="option-text">{option.text}</span>;
    case 'figure':
      return (
        <span class="option-figure">
          <FigureView figure={option.figure} />
        </span>
      );
    case 'grid':
      return (
        <span class="option-figure">
          <GridView grid={option.grid} variant={option.variant ?? 'solid'} />
        </span>
      );
  }
}

function optionLabel(option: Option, i: number, locale: Locale): string {
  const t = dict(locale);
  switch (option.kind) {
    case 'text':
      return t.quiz.optionLabel(i + 1, option.text);
    case 'figure':
      return t.quiz.optionLabel(i + 1, describeFigure(option.figure, locale));
    case 'grid':
      return t.quiz.optionLabel(
        i + 1,
        t.quiz.describeGrid(option.grid.cells.filter(Boolean).length),
      );
  }
}

function Results({
  session,
  locale,
  onRestart,
}: {
  session: Session;
  locale: Locale;
  onRestart: () => void;
}) {
  const t = dict(locale);
  const correct = session.responses.filter((r) => r.correct).length;
  const total = session.responses.length;
  const accuracy = total > 0 ? correct / total : null;
  const speed = median(session.responses.filter((r) => r.correct).map((r) => r.latencyMs));

  const byType = new Map<ItemTypeId, { n: number; ok: number }>();
  for (const r of session.responses) {
    const acc = byType.get(r.type) ?? { n: 0, ok: 0 };
    acc.n++;
    if (r.correct) acc.ok++;
    byType.set(r.type, acc);
  }

  return (
    <div class="stack" data-testid="results" style={{ '--stack-gap': '1.25rem' } as never}>
      <h2 class="results-heading">{t.results.heading}</h2>

      <div class="card-grid card-grid--fit stat-grid">
        <Stat label={t.results.correct} value={`${correct} / ${total}`} testid="stat-correct" />
        <Stat label={t.results.accuracy} value={formatPercent(accuracy, locale)} testid="stat-accuracy" />
        <Stat label={t.results.medianTime} value={formatDuration(speed, locale)} testid="stat-speed" />
        {/*
         * The seed gets a card of its own rather than a row of digits in a table: it is the
         * only figure here that is an *action* — the thing you send to someone else.
         */}
        <div class="card stat stat--seed" data-testid="stat-seed">
          <div class="stat-label subtle">{t.results.seed}</div>
          <SeedChip seed={session.seed} locale={locale} variant="full" />
        </div>
      </div>

      <p class="subtle seed-explain" data-testid="seed-explain">
        {t.seed.explain}
      </p>

      <MistakeBreakdown responses={session.responses} locale={locale} />

      <div class="card table-card">
        <h3 class="section-heading section-heading--xs">{t.results.byItemType}</h3>
        <div class="scroll-x">
          <table class="data">
            <thead>
              <tr>
                <th>{t.results.colType}</th>
                <th class="num">{t.results.colCorrect}</th>
                <th class="num">{t.results.colAccuracy}</th>
              </tr>
            </thead>
            <tbody>
              {[...byType.entries()].map(([type, v]) => (
                <tr key={type} data-testid={`result-row-${type}`}>
                  <td>
                    {getMeta(type).icon} {getItemText(type, locale).name}
                  </td>
                  <td class="num">
                    {v.ok} / {v.n}
                  </td>
                  <td class="num">{formatPercent(v.n > 0 ? v.ok / v.n : null, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p class="subtle results-disclaimer">
        {t.results.disclaimerBefore}
        <a href={localeHref('about/')}>{t.results.disclaimerLink}</a>
        {t.results.disclaimerAfter}
      </p>

      <div class="cluster">
        <button class="btn btn-primary btn-lg" onClick={onRestart} data-testid="restart">
          {t.results.goAgain}
        </button>
        <a class="btn btn-lg" href={localeHref('progress/')} data-testid="see-progress">
          {t.results.seeProgress}
        </a>
      </div>
    </div>
  );
}

/**
 * The error-type breakdown for a finished session.
 *
 * This is the payoff of storing a diagnosis per response: "most of your errors were
 * wrong-axis" is a finding about how someone reads a matrix, which no accuracy percentage
 * can express. It is deliberately a count and a name — never a score, and never a
 * normative comparison.
 */
function MistakeBreakdown({ responses, locale }: { responses: Response[]; locale: Locale }) {
  const t = dict(locale);
  const tally = tallyErrorTypes(responses);
  const total = tally.reduce((sum, x) => sum + x.count, 0);
  const dominant = dominantErrorType(tally);
  const wrong = responses.filter((r) => !r.correct).length;

  // Nothing diagnosable: either a clean sweep, or a run of text-entry items which have no
  // distractors to name. Saying so beats an empty card.
  if (total === 0) {
    return (
      <div class="card mistakes" data-testid="mistakes" data-count="0">
        <h3 class="mistakes-heading">{t.results.mistakesHeading}</h3>
        <p class="muted mistakes-empty">
          {wrong === 0 ? t.results.mistakesNone : t.results.mistakesSpread}
        </p>
      </div>
    );
  }

  return (
    <div class="card mistakes" data-testid="mistakes" data-count={String(total)}>
      <h3 class="mistakes-heading">{t.results.mistakesHeading}</h3>
      <p class="mistakes-finding" data-testid="mistakes-finding">
        {dominant
          ? t.results.commonestMistake(t.diagnosis.tags[dominant.errorType], dominant.count, total)
          : t.results.mistakesSpread}
      </p>
      <ul class="mistakes-list">
        {tally.map((x) => (
          <li key={x.errorType} data-error-type={x.errorType}>
            <span class="tag">{t.diagnosis.tags[x.errorType]}</span>
            <span class="mistakes-count">{x.count}</span>
            <span class="muted mistakes-body">{t.diagnosis.bodies[x.errorType]}</span>
          </li>
        ))}
      </ul>
      <p class="subtle mistakes-lede">{t.results.mistakesLede}</p>
    </div>
  );
}

function Stat({ label, value, testid }: { label: string; value: string; testid: string }) {
  return (
    <div class="card stat" data-testid={testid}>
      <div class="stat-label subtle">{label}</div>
      <div class="stat-value">{value}</div>
    </div>
  );
}

