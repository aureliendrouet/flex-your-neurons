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
import Mascot from './Mascot';
import SeedChip from './SeedChip';
import ShortcutSheet from './ShortcutSheet';
import StimulusView from './StimulusView';
import TrailBoard from './TrailBoard';
import BlockSpanBoard from './BlockSpanBoard';
import PyramidBoard from './PyramidBoard';
import FigureView, { describeFigure } from './FigureView';
import GridView, { describeGrid } from './GridView';
import { generateItem, getItemText, getMeta } from '../lib/generators';
import { deriveSeed, normaliseSeed, randomSeed } from '../lib/rng';
import { dict, type Locale } from '../lib/i18n';
import { localeHref } from '../lib/links';
import {
  advanceLadder,
  diagnoseTaps,
  diagnoseFills,
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
import type {
  Difficulty,
  ErrorType,
  ItemTypeId,
  Option,
  Response,
  Session,
  SessionMode,
  TrailNode,
} from '../lib/types';

/**
 * `m:ss` for the sprint countdown, always two digits of seconds so the text never changes width.
 * Rounds *up*, so a clock showing 1 has not yet expired — a display that read 0 for the last
 * second would look stuck, and worse, look like it had stopped early.
 */
function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}:${`${totalSeconds % 60}`.padStart(2, '0')}`;
}

interface Props {
  mode: SessionMode;
  types: ItemTypeId[];
  locale: Locale;
  /** Item count. Practice defaults to the user's setting; tests use a fixed length. */
  length?: number;
  /** Fixed seed, e.g. from a shared link. */
  seed?: string;
  /** Fixed difficulty; when absent the adaptive ladder is used. */
  difficulty?: Difficulty;
  /** The scoring window for a sprint, in seconds. Ignored in the other modes. */
  seconds?: number;
}

/**
 * `ready` exists only for sprints, and it is not a nicety.
 *
 * Every other mode can start the moment the page paints, because nothing is being timed across
 * items. A sprint is scored on output inside a fixed window, so a reader who is still orienting
 * when the clock starts is simply given a shorter window than one who was ready — the same
 * unfairness the span gate was built to remove, but applied to the whole block instead of one
 * item. So the clock waits to be started.
 */
type Phase = 'ready' | 'answering' | 'revealed' | 'finished';

/** Default sprint window. Long enough to measure sustained output, short enough to repeat. */
const DEFAULT_SPRINT_SECONDS = 60;

const OPTION_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8'];

/**
 * URL overrides: `?seed=ABC12345` replays an exact run, `?d=1..5` pins the difficulty,
 * `?n=10` sets the length, `?t=30` sets a sprint's window in seconds. This is what makes a seed
 * shareable — two people opening the
 * same link get byte-identical items, in whichever language each of them reads — and it
 * is also how the end-to-end tests pin down an item whose answer they compute themselves.
 */
function readUrlOverrides(): {
  seed?: string;
  difficulty?: Difficulty;
  length?: number;
  seconds?: number;
} {
  if (typeof location === 'undefined') return {};
  const params = new URLSearchParams(location.search);

  const seedParam = params.get('seed');
  const seed = seedParam ? normaliseSeed(seedParam) || undefined : undefined;

  const d = Number(params.get('d'));
  const difficulty = Number.isInteger(d) && d >= 1 && d <= 5 ? (d as Difficulty) : undefined;

  const n = Number(params.get('n'));
  const length = Number.isInteger(n) && n >= 1 && n <= 100 ? n : undefined;

  /*
   * `?t=` sets the sprint window in seconds. Safe to expose because the score is normalised to a
   * rate per minute, so a shorter window is not a way to look better — and the window is recorded
   * on the session, so a run is never compared against one of a different length by accident.
   */
  const t = Number(params.get('t'));
  const seconds = Number.isInteger(t) && t >= 5 && t <= 600 ? t : undefined;

  return { seed, difficulty, length, seconds };
}

export default function Quiz({
  mode,
  types,
  locale,
  length,
  seed: fixedSeed,
  difficulty: fixedDifficulty,
  seconds,
}: Props) {
  const t = dict(locale);
  const isSprint = mode === 'sprint';
  const [overrides] = useState(readUrlOverrides);
  const windowMs = (overrides.seconds ?? seconds ?? DEFAULT_SPRINT_SECONDS) * 1000;
  const settings = useStore($settings) ?? DEFAULT_SETTINGS;
  const summary = useStore($summary);

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
  const [phase, setPhase] = useState<Phase>(isSprint ? 'ready' : 'answering');
  /** Milliseconds left on the sprint clock; `null` outside a sprint or before it starts. */
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  /**
   * The last verdict in a sprint, shown briefly on the item and never blocking.
   *
   * Carries `at` so that two consecutive answers of the same verdict are still distinguishable:
   * without it, keying the animation on the boolean alone would mean a second "correct" in a row
   * re-rendered identical markup and the mark never replayed.
   */
  const [flash, setFlash] = useState<{ correct: boolean; at: number } | null>(null);
  const [chosen, setChosen] = useState<number | null>(null);
  const [typed, setTyped] = useState('');
  /**
   * Whether the response controls are live yet.
   *
   * False only while a *transient* stimulus is still playing — a span sequence, an n-back
   * stream. Every other format is answerable the moment it paints, so this starts true for
   * them; gating on it unconditionally would lock the whole site.
   */
  const [stimulusReady, setStimulusReady] = useState(false);
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

  /**
   * "Answering is possible from this moment": the clock starts and the controls unlock.
   *
   * Shared by every gated format rather than written once per surface. Two of them now finish
   * playing somewhere other than `StimulusView` — the block-span board plays itself, because the
   * flashes have to happen on the board the reader will tap — and a second copy of this would be a
   * second place for the response clock to start from the wrong moment.
   */
  const beginResponse = useCallback(() => {
    startResponseClock();
    setStimulusReady(true);
    setTimeout(() => textInput.current?.focus(), 30);
  }, [startResponseClock]);

  const index = cursor.index;
  /**
   * How many items the run contains — and for a sprint, deliberately unbounded.
   *
   * A sprint ends when its clock does, so a target count would be a second, competing stop
   * condition: whichever came first would end the block, and a fast reader would be cut short at
   * the cap while a slow one ran the full window. That is exactly the comparison a sprint exists
   * to make, so the count must not participate in it.
   */
  /*
   * A test defaults to one item per format, not two.
   *
   * Items are dealt round-robin — `types[index % types.length]` — so any length that is not a
   * multiple of the registry covers some formats more than others, and any length *below* it covers
   * a prefix and leaves the tail out entirely. One item each is the shortest length that reaches
   * every format, which is what the mode is for: the per-format row from two items is 0, 50 or 100%
   * and barely better evidence than from one, while the domain figures — which pool several formats
   * apiece — are what the run actually produces.
   */
  const total = isSprint
    ? Number.POSITIVE_INFINITY
    : (overrides.length ?? length ?? (mode === 'test' ? types.length : (settings.practiceLength ?? 10)));

  /**
   * The level a sprint runs at, chosen once and held.
   *
   * The adaptive ladder is switched off for the whole block. If difficulty moved with performance
   * inside the window, "22 correct" would describe a different mixture of levels every run, and
   * two of a reader's own sprints could not be compared — which is the one thing a score in
   * items-per-minute is for.
   */
  const [blockDifficulty, setBlockDifficulty] = useState<Difficulty | null>(null);
  const heldDifficulty = pinnedDifficulty ?? (isSprint ? (blockDifficulty ?? 2) : undefined);

  // Start the session on the client, where a random seed and localStorage are available.
  useEffect(() => {
    setSession(
      newSession(mode, types, pinnedSeed || randomSeed(), isSprint ? windowMs : undefined),
    );
    const stats = summary?.byType.find((x) => x.type === types[0]);
    const start = types.length === 1 ? suggestedStart(stats) : 2;
    if (isSprint) {
      /*
       * Seeded from the untimed history, which is the only evidence available — `summarise`
       * excludes sprints precisely because a pinned level says nothing about ability.
       */
      setBlockDifficulty(pinnedDifficulty ?? start);
    } else if (!pinnedDifficulty) {
      const ladder = newLadder(start);
      ladderRef.current = ladder;
      setCursor({ index: 0, difficulty: ladder.difficulty });
    }
    // Intentionally mount-only: restarting mid-session would discard answers.
  }, []);

  const itemType: ItemTypeId = types[index % types.length]!;
  const difficulty: Difficulty = heldDifficulty ?? (settings.adaptive ? cursor.difficulty : 2);

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
      difficulty: heldDifficulty ?? (settings.adaptive ? ladderRef.current.difficulty : 2),
    }));
  }, [heldDifficulty, settings.adaptive]);

  // Per-item setup that can only run once the new item exists.
  useEffect(() => {
    if (!item) return;
    /*
     * Keyed on `presentation` rather than on the stimulus kind. Two formats now play
     * themselves before they can be answered — span and n-back — and a third would have had
     * to remember to add itself to a list of kinds here. Carrying a `presentation` *is* what
     * "this plays before you answer" means in the item model.
     */
    const isTransient = item.presentation !== undefined;
    setStimulusReady(!isTransient);

    /*
     * Start the clock once the item has actually been painted, not when the effect runs:
     * layout and paint of a fresh matrix are not thinking time. A span item does not start
     * its clock here at all — see `startResponseClock` and PLAN-2026-08 §2.2.
     */
    const frame = isTransient ? null : requestAnimationFrame(() => startResponseClock());
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

  /**
   * The sprint clock.
   *
   * The deadline lives in a ref on the monotonic clock, and the interval only *reads* it. The
   * obvious alternative — decrementing a counter every tick — accumulates the error of every
   * missed or late frame, and a background tab throttles intervals to once a second or worse, so
   * a reader who switched away would come back to a clock that had barely moved and a window
   * that had silently grown. Deriving the remainder from a fixed deadline makes the window the
   * same length regardless of how often it is sampled.
   *
   * Responses are read through a ref rather than closed over, so the interval does not have to be
   * torn down and rebuilt on every answer — during a sprint that is several times a second.
   */
  const deadlineRef = useRef<number | null>(null);
  const responsesRef = useRef<Response[]>(responses);
  responsesRef.current = responses;
  const finishRef = useRef(finish);
  finishRef.current = finish;

  useEffect(() => {
    if (phase !== 'answering' || !isSprint || deadlineRef.current === null) return;
    const tick = () => {
      const left = deadlineRef.current! - performance.now();
      if (left <= 0) {
        setRemainingMs(0);
        // The clock is the only stop condition, and it stops the block mid-item by design:
        // the item on screen when time runs out was never answered, so it is not recorded.
        finishRef.current(responsesRef.current);
        return;
      }
      setRemainingMs(left);
    };
    tick();
    // ~10Hz: fast enough that the last second visibly counts down, cheap enough to ignore.
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [phase, isSprint]);

  /** Starts the block: the clock begins here, not when the page painted. */
  const beginSprint = useCallback(() => {
    deadlineRef.current = performance.now() + windowMs;
    setRemainingMs(windowMs);
    setPhase('answering');
    startResponseClock();
  }, [windowMs, startResponseClock]);

  const submit = useCallback(
    /**
     * `trailMisses` is only ever passed by the trail board, where correctness is a binarisation of a
     * timed run rather than a fact about an answer: a trail always completes, so "correct" is set to
     * "finished without a misclick". The latency is the measurement.
     */
    (choiceIndex: number | null, text?: string, trailMisses?: number) => {
      if (!item || !session || phase !== 'answering') return;

      const correct = isCorrect(item, choiceIndex, text, trailMisses);
      /*
       * Every other format looks its diagnosis up: the generator built each distractor to embody one
       * misreading, so the error type is `errorTypes[chosen]`. A tapped sequence has no distractors
       * to look up, so it is the one response whose diagnosis is *computed* — from the sequence the
       * reader produced against the one that was shown.
       */
      const errorType =
        item.responseMode === 'tap'
          ? diagnoseTaps(item.answerText ?? '', text ?? '')
          : /*
             * A filled pyramid is the second computed diagnosis, and the more informative one: the
             * blanks are related to each other, so what can be named is *which relation* the reader
             * used — a pyramid built by subtracting is one wrong idea, not five careless slips.
             */
            item.responseMode === 'fill' && item.stimulus.kind === 'pyramid'
            ? diagnoseFills(item.answerText ?? '', text ?? '', item.stimulus.base)
            : choiceIndex === null
              ? undefined
              : item.errorTypes[choiceIndex];
      const response = makeResponse(
        item.type,
        item.seed,
        item.difficulty,
        item.answerIndex,
        choiceIndex,
        correct,
        Math.max(0, Math.round(performance.now() - shownAt.current)),
        text,
        errorType,
      );
      const all = [...responses, response];
      setResponses(all);
      setChosen(choiceIndex);
      // The ladder is frozen for a sprint, and a pinned difficulty was never on it.
      if (settings.adaptive && !heldDifficulty) {
        ladderRef.current = advanceLadder(ladderRef.current, correct);
      }

      /*
       * A sprint never reveals, whatever the reader's feedback setting says. A panel that has to
       * be dismissed would stop the block while the clock kept running, which turns the score
       * into a measure of how fast someone clicks Next. The verdict still arrives — as a brief
       * flash on the item that does not wait for anyone — and the whole run is reviewable
       * afterwards.
       */
      if (isSprint) {
        /*
         * The verdict still arrives, as a mark on the item that fades on its own. It is set here
         * rather than derived from `chosen`, because the next item replaces `chosen` immediately —
         * there is no revealed phase to hold it.
         */
        setFlash({ correct, at: performance.now() });
        if (deadlineRef.current !== null && performance.now() >= deadlineRef.current) finish(all);
        else advance();
        return;
      }

      const isLast = all.length >= total;
      if (settings.instantFeedback && mode === 'practice') {
        setPhase('revealed');
        return;
      }
      if (isLast) finish(all);
      else advance();
    },
    [item, session, phase, responses, settings, total, mode, heldDifficulty, isSprint, finish, advance],
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
    stimulusReady,
    submit,
    next,
    begin: beginSprint,
    toggleShortcuts: () => {},
    closeShortcuts: () => {},
  });
  liveRef.current = {
    phase,
    item,
    stimulusReady,
    submit,
    next,
    begin: beginSprint,
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
      /*
       * Enter starts the clock, so a sprint can be begun the same way a span sequence is and a
       * whole run stays on the keyboard. `e.repeat` is filtered because a held key would
       * otherwise fire this and then immediately start answering with whatever came next.
       */
      if (current.phase === 'ready' && (e.key === 'Enter' || e.key === ' ') && !e.repeat) {
        e.preventDefault();
        current.begin();
        return;
      }
      if (typing || current.phase !== 'answering' || !current.item) return;
      if (current.item.responseMode !== 'choice') return;
      /*
       * A number key must not answer an item that is still playing. Without this an n-back
       * stream could be answered on its first element — and worse, the response clock has
       * not started yet, so the latency written would be measured from the wrong moment.
       */
      if (!current.stimulusReady) return;

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
  const speeded =
    item !== null &&
    // A sprint is a speeded task by definition, whatever the format's own domain says.
    (isSprint || item.presentation !== undefined || getMeta(item.type).domain === 'Gs');

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

  /*
   * Nothing was answered before the clock ran out. Checked *before* the finished branch, not
   * after: `finish` sets the phase to `finished`, so a check below that return can never run —
   * which is how this first shipped, and the empty run rendered a results table of zeroes with
   * an undefined accuracy instead.
   */
  if (isSprint && phase === 'finished' && responses.length === 0) {
    return (
      <div class="card sprint-empty" data-testid="sprint-empty">
        <p>{t.quiz.sprint.nothing}</p>
        <button class="btn btn-primary" onClick={() => location.reload()} data-testid="restart">
          {t.quiz.sprint.again}
        </button>
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
  const lastResponse = revealed ? responses[responses.length - 1] : undefined;
  const wasCorrect = lastResponse?.correct === true;
  const tip = t.quiz.tip(item.options.length);

  /**
   * The named mistake for the response just given, or `null` when there is nothing to diagnose: a
   * correct answer, a format with no distractors and no computable diagnosis (digit span), or a
   * generator that left the slot as `'correct'`.
   *
   * Read off the recorded response rather than recomputed from the chosen index. It is the same
   * value — `makeResponse` stores exactly that — but not every mode *has* a chosen index, and a
   * tapped sequence's diagnosis is derived at submit time. Reading the record keeps one source of
   * truth for what this panel and the progress page both report.
   */
  const chosenErrorType = lastResponse?.errorType;
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
          {isSprint ? (
            /*
             * Two numbers, because a sprint has two: what is left of the window, and what has
             * been done in it. `aria-live="off"` on the clock is deliberate — a countdown
             * announced ten times a second would make the page unusable with a screen reader,
             * and the remaining time is not information you can act on mid-item anyway.
             */
            <>
              <span
                class="sprint-clock num-tabular"
                data-testid="sprint-clock"
                data-sprint-low={String(remainingMs !== null && remainingMs <= 10_000)}
                aria-live="off"
              >
                {formatClock(remainingMs ?? windowMs)}
              </span>
              <span class="muted num-tabular" data-testid="sprint-count">
                {t.quiz.sprint.done(answered)}
              </span>
            </>
          ) : (
            <span class="muted num-tabular" data-testid="progress-label">
              {t.quiz.progress(Math.min(answered + (revealed ? 0 : 1), total), total)}
            </span>
          )}
          {/*
            * Masked for exactly as long as `data-focus` is set, and for the same reason: while an
            * answer is being collected, nothing on screen may make the item easier than the item.
            * The seed regenerates it — most cheaply of all on the memory formats, where the
            * sequence has just been deliberately taken away.
            *
            * Concealed on every phase except the reveal, rather than only while answering: `ready`
            * is the moment before an item appears, and a seed read there buys the same regeneration
            * a moment earlier. (`finished` never reaches this header — the results screen returns
            * before it, and shows the seed in full.)
            */}
          <SeedChip seed={session.seed} locale={locale} concealed={!revealed} />
        </div>
      </header>

      {/*
        * The meter tracks whatever the run is actually spending. In a sprint that is time, so it
        * *drains* rather than fills — the same bar reading in the opposite direction, because
        * "how much is left" and "how far along am I" are different questions and a sprint only
        * asks the first.
        */}
      <div class="meter" data-meter={isSprint ? 'draining' : 'filling'} aria-hidden="true">
        {/* The only genuinely dynamic value in the component, so it stays inline — but as
            a custom property, which keeps the *styling* in the stylesheet. */}
        <span
          style={
            {
              '--fill': isSprint
                ? `${((remainingMs ?? windowMs) / windowMs) * 100}%`
                : `${(answered / total) * 100}%`,
            } as never
          }
        />
      </div>

      {phase === 'ready' && (
        /*
         * The pre-flight gate. The clock does not start until this is dismissed, so the window is
         * the same length for a reader who was ready and one who had just arrived from a link.
         */
        <div class="card sprint-gate" data-testid="sprint-gate">
          <p class="sprint-gate-lede">{t.quiz.sprint.ready(Math.round(windowMs / 1000))}</p>
          <p class="subtle sprint-gate-note">{t.quiz.sprint.readyNote}</p>
          <button
            class="btn btn-primary btn-lg"
            type="button"
            data-testid="sprint-start"
            onClick={beginSprint}
          >
            {t.quiz.sprint.start} <span aria-hidden="true">↵</span>
          </button>
        </div>
      )}

      {/*
        * Two regions, because they have different jobs under a height constraint. The item
        * is what must never leave the screen; the answer tray is what may scroll when eight
        * figural options and an explanation cannot all fit a phone. Splitting them is what
        * lets the stimulus stay pinned while the tray moves under it.
        */}
      {/*
        * Hidden entirely while the gate is up, not merely dimmed. A visible first item would let
        * a reader study it for as long as they liked and then start a clock they were already a
        * step ahead of — which is the fairness problem the gate exists to remove, reintroduced.
        */}
      {phase !== 'ready' && (
      <div class="quiz-view">
        <div class="quiz-item" data-testid="quiz-item">
          <h2 class="quiz-prompt" data-testid="prompt">
            {item.prompt}
          </h2>

          {isSprint && flash && (
            /*
             * Keyed on the timestamp so the CSS animation restarts for every answer, including
             * two of the same verdict in a row. A word as well as a glyph, and both carry the
             * verdict in text — the mark is not a colour that has to be interpreted.
             */
            <p
              class="sprint-flash"
              key={flash.at}
              data-testid="sprint-flash"
              data-correct={String(flash.correct)}
              role="status"
            >
              <span aria-hidden="true">{flash.correct ? '✓' : '✗'}</span>{' '}
              {flash.correct ? t.quiz.correct : t.quiz.notQuite}
            </p>
          )}

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
              /*
               * PLAN-2026-08 §2.2. A span item plays its sequence before a response is possible,
               * and the playback lengthens with difficulty. Timing from the mount would therefore
               * record "the harder the item, the longer you thought", which is a property of the
               * animation, not the user. The clock starts when answering becomes possible, which is
               * the same moment for every format.
               */
              onPresentationDone={beginResponse}
            />
          </div>
        </div>

        {/* The format is exposed so the stylesheet can size a tray that has to fit a particular
            shape of option — see `.quiz-answer[data-format='coding']`. */}
        <div class="quiz-answer" data-testid="answer-tray" data-format={item.type}>
        {item.responseMode === 'trail' ? (
          /*
           * The board owns its own progress and reports once, when the path is finished. It is left
           * mounted and frozen after submitting so the completed trail stays on screen beside the
           * feedback — the shape of the path is the most informative thing about the run.
           */
          <TrailBoard
            /*
             * Keyed by the item, not by anything derived from the stimulus. A board's labels are a
             * pure function of (form, target count), so two consecutive items at one difficulty and
             * form draw an identical set — and a board that identified itself by its content would
             * then never notice the item had changed, leaving the previous run's finished state on
             * screen with nothing left to click.
             */
            key={`${item.type}:${item.seed}:${item.difficulty}`}
            nodes={(item.stimulus as { kind: 'trail'; nodes: TrailNode[] }).nodes}
            locale={locale}
            frozen={revealed}
            onComplete={(misses) => submit(null, undefined, misses)}
          />
        ) : item.responseMode === 'tap' && item.stimulus.kind === 'block-span' ? (
          /*
           * The board plays the sequence itself rather than leaving it to `StimulusView`, because the
           * flashes have to appear on the same blocks that will be tapped. That makes it the only
           * response surface that also owns a presentation — hence `onRecallStart`, which is this
           * format's version of "the stimulus has finished playing".
           *
           * Left mounted and frozen after submitting, like the trail board: the reveal is the order
           * drawn on the board it happened on, which no amount of prose could replace.
           */
          <BlockSpanBoard
            /* Keyed by the item for the same reason as the trail board: the sequence is short enough
               that two consecutive items genuinely repeat one, and a board keyed on its own sequence
               would sit out the second of the pair. */
            key={`${item.type}:${item.seed}:${item.difficulty}`}
            blocks={item.stimulus.blocks}
            sequence={item.stimulus.sequence}
            presentation={item.presentation}
            reducedMotion={settings.reducedMotion}
            locale={locale}
            frozen={revealed}
            onRecallStart={beginResponse}
            onComplete={(tapped) => submit(null, tapped)}
          />
        ) : item.responseMode === 'fill' && item.stimulus.kind === 'pyramid' ? (
          /*
           * The pyramid is the response surface, so it is drawn here and not in `StimulusView` — the
           * blanks have to sit in the diagram, above the numbers they are sums of. Frozen rather
           * than unmounted after answering, like the other two boards: the finished pyramid with the
           * right number beside a wrong one says where the chain broke.
           */
          <PyramidBoard
            key={`${item.type}:${item.seed}:${item.difficulty}`}
            base={item.stimulus.base}
            locale={locale}
            answerText={item.answerText ?? ''}
            submitted={lastResponse?.chosenText}
            frozen={revealed}
            onComplete={(filled) => submit(null, filled)}
          />
        ) : item.responseMode === 'text' ? (
          <form
            data-testid="text-response"
            onSubmit={(e) => {
              e.preventDefault();
              if (!stimulusReady || typed.trim() === '') return;
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
              disabled={!stimulusReady || revealed}
              autocomplete="off"
              spellcheck={false}
              placeholder={stimulusReady ? t.quiz.typeSequence : t.quiz.watching}
              onInput={(e) => setTyped((e.currentTarget as HTMLInputElement).value)}
              class="text-input"
            />
            <button
              class="btn btn-primary"
              type="submit"
              disabled={!stimulusReady || revealed || typed.trim() === ''}
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
            locked={!stimulusReady}
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
            {/*
             * The verdict, spoken rather than stated.
             *
             * This panel is only ever reached from practice with instant feedback on — a sprint
             * never reveals and neither does the full test — so the mascot cannot appear during a
             * measurement by construction, and no mode check is needed here to keep it out.
             *
             * The verdict itself is unchanged and still leads: it is the one thing in the panel a
             * reader cannot be left to infer, so it keeps its exact words, its colour and its
             * test id, and the mascot's line follows it. Seeded from the item, so a replay of the
             * same seed says the same thing.
             */}
            <Mascot
              locale={locale}
              moment={wasCorrect ? 'correct' : 'wrong'}
              seed={item.seed}
              prefix={
                <strong class="feedback-verdict" data-testid="verdict">
                  {wasCorrect ? t.quiz.correct : t.quiz.notQuite}
                </strong>
              }
            />

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
      )}

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
  locked,
  locale,
  onPick,
}: {
  options: Option[];
  chosen: number | null;
  answerIndex: number;
  errorTypes: ErrorType[];
  revealed: boolean;
  /** True while a transient stimulus is still playing: answering is not possible yet. */
  locked: boolean;
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
            disabled={revealed || locked}
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
      return t.quiz.optionLabel(i + 1, describeGrid(option.grid, locale));
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

  const isSprint = session.mode === 'sprint' && session.plannedMs !== undefined;
  /*
   * Rate rather than raw count, so two windows of different lengths can be compared — and so a
   * reader who changes the window is not silently rewarded for choosing the longer one.
   */
  const perMinute = isSprint ? (correct / session.plannedMs!) * 60_000 : null;

  return (
    <div
      class="stack"
      data-testid="results"
      data-mode={session.mode}
      style={{ '--stack-gap': '1.25rem' } as never}
    >
      <h2 class="results-heading">{isSprint ? t.results.sprintHeading : t.results.heading}</h2>

      {/*
       * Here rather than during the run, in every mode including the full test.
       *
       * The rule the mascot obeys is that it never appears while something is being measured; a
       * results screen is after the measurement, not during it, so there is nothing left for a
       * cheerful drawing to bias. What it says is deliberately about the *block* — "that is a
       * block done" — and never about the score, because the numbers directly beneath it are
       * uncalibrated by design and the disclaimer at the foot of this screen says so.
       */}
      <Mascot locale={locale} moment="results" seed={session.seed} size="sm" />

      <div class="card-grid card-grid--fit stat-grid">
        {/*
         * In a sprint the headline is the count, and the label names the window it was scored in —
         * "18 correct" means nothing without "in 60 seconds" beside it. Accuracy stays on the
         * board as a check: output bought entirely by guessing is not output.
         */}
        {isSprint ? (
          <>
            <Stat
              label={t.results.sprintCorrectIn(Math.round(session.plannedMs! / 1000))}
              value={String(correct)}
              testid="stat-correct"
            />
            <Stat
              label={t.results.sprintRate}
              value={t.results.perMinute(Math.round(perMinute! * 10) / 10)}
              testid="stat-rate"
            />
            <Stat
              label={t.results.sprintAttempted}
              value={`${correct} / ${total}`}
              testid="stat-attempted"
            />
          </>
        ) : (
          <>
            <Stat label={t.results.correct} value={`${correct} / ${total}`} testid="stat-correct" />
            <Stat label={t.results.accuracy} value={formatPercent(accuracy, locale)} testid="stat-accuracy" />
            <Stat label={t.results.medianTime} value={formatDuration(speed, locale)} testid="stat-speed" />
          </>
        )}
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

