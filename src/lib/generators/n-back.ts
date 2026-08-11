/**
 * N-back — watch a stream go past and count the repeats N places apart.
 *
 * The canonical working-memory (Gwm) updating task, and the one place this site can measure
 * *updating* rather than *storage*. Span asks you to hold a list still and give it back;
 * n-back asks you to keep a window of the last N elements and rewrite it on every step,
 * which is a different thing and the reason both formats belong here (`IQ-TESTS.md` §2).
 *
 * ## Why counting, and not the usual per-element response
 *
 * A lab n-back shows one element per second for minutes and collects a hit/miss on *every*
 * element, scoring d-prime over the block. That needs a continuous timed block, which this
 * site's one-item-one-response loop does not have — `PLAN-2026-08` §2.3 records that a real
 * per-item deadline was deliberately never built.
 *
 * So one item is one short stream and one question: how many matches went past. This keeps
 * the construct that matters — you cannot count matches without maintaining and updating the
 * N-window, and you cannot do it after the fact because the stream is gone — while fitting a
 * single response. What it gives up is the per-element sensitivity a d-prime buys: a reader
 * who loses the window mid-stream and guesses the count may still land on it. Recorded here
 * rather than in the copy, because it is a property of the adaptation, not of the item.
 *
 * ## Why the count is bounded away from zero
 *
 * "No matches" is a legitimate stream but a terrible item: it is the answer you reach by not
 * watching at all, and it cannot be told apart from a total failure to engage. Every stream
 * here carries at least one match.
 */
import { createRng, type Rng } from '../rng';
import { dict, type Locale } from '../i18n';
import { windowOptions } from './distractors';
import type { Difficulty, ErrorType, Generator, Item, ItemTypeMeta, Option } from '../types';

/** Letters that stay distinct when they flash past. Same set as the span alphabet. */
const LETTERS = 'BDFHJKLMNPRSTVWXZ'.split('');

const OPTION_COUNT = 4;

interface Plan {
  /** How far back a match reaches. */
  n: number;
  /** Elements in the stream. */
  length: number;
  /** Milliseconds each element is shown. */
  stepMs: number;
  /**
   * Inclusive range for how many matches the stream contains.
   *
   * A *range*, not a number, and that is not a detail. With a fixed count per difficulty the
   * answer at a given level is always the same integer — so a reader who drills the format
   * learns "level 3 means three" and never has to watch the stream again. Every generator
   * property test still passed with a constant here, because the streams did vary; only the
   * answer did not. The lower bound stays above zero: "none" is the answer you reach by not
   * looking, and it cannot be told apart from not having engaged at all.
   *
   * The range is now the *same* at every level, for two reasons that turned out to be one. It used
   * to widen with difficulty (1-3 up to 3-6), which quietly made "how large a tally you can carry"
   * part of the ladder — an adjacent construct, and the mistake `GENERATABILITY.md` records against
   * `head-count`. It also meant each level's answers came from a narrow, level-specific band, which
   * is what let the option set identify the answer. What this format scales is `n` and the rate.
   */
  matches: [min: number, max: number];
}

/**
 * Held constant across every level. See `Plan.matches`.
 *
 * The floor is four rather than one so that the option window has somewhere to sit: with an answer
 * of one or two there is no room for three lower distractors above the zero floor, and the resulting
 * top-heavy sets made "pick the smallest" beat chance by half again.
 */
const MATCHES: [number, number] = [4, 7];

/**
 * How often a non-match position is filled with an n±1 lure rather than a free letter.
 *
 * Around the lab convention of a quarter to a third of non-targets. See `buildStream` for why this
 * has to be planted deliberately rather than left to chance.
 */
const LURE_RATE = 0.3;

function planFor(difficulty: Difficulty): Plan {
  switch (difficulty) {
    case 1:
      return { n: 1, length: 9, stepMs: 1100, matches: MATCHES };
    case 2:
      return { n: 1, length: 11, stepMs: 1000, matches: MATCHES };
    case 3:
      return { n: 2, length: 13, stepMs: 1000, matches: MATCHES };
    case 4:
      return { n: 2, length: 15, stepMs: 900, matches: MATCHES };
    case 5:
      return { n: 3, length: 17, stepMs: 900, matches: MATCHES };
  }
}

/**
 * Counts matches by walking the finished stream — the independent check.
 *
 * The generator plants matches as it builds, so it already "knows" the count. This derives
 * it again from the sequence the reader will actually see, and the two must agree or the
 * item is discarded. That is the difference between an answer that is constructed and an
 * answer that is merely intended (`GENERATABILITY.md` §1).
 */
export function countMatches(sequence: string[], n: number): number {
  let matches = 0;
  for (let i = n; i < sequence.length; i++) {
    if (sequence[i] === sequence[i - n]) matches++;
  }
  return matches;
}

/**
 * Builds a stream with exactly `plan.matches` matches, or `null` if this seed could not.
 *
 * At each position it either plants a match (repeating the element N back) or picks a
 * non-match. A non-match must differ from the element N back — otherwise it would be an
 * accidental extra match, and the planted count would be a lie.
 */
function buildStream(plan: Plan, rng: Rng, wanted: number): string[] | null {
  const positions = Array.from({ length: plan.length - plan.n }, (_, i) => i + plan.n);
  if (positions.length < wanted) return null;
  const planted = new Set(rng.shuffle(positions).slice(0, wanted));

  const sequence: string[] = [];
  for (let i = 0; i < plan.length; i++) {
    if (planted.has(i)) {
      sequence.push(sequence[i - plan.n]!);
      continue;
    }
    const back = i >= plan.n ? sequence[i - plan.n] : undefined;
    /*
     * Also avoid an immediate repeat when it is not itself the match being planted: a
     * doubled letter is perceived as one long letter rather than two, so it would quietly
     * shorten the stream. At n = 1 the two constraints are the same one.
     */
    const previous = sequence[i - 1];
    const pool = LETTERS.filter((ch) => ch !== back && ch !== previous);
    if (pool.length === 0) return null;

    /*
     * Lures are planted, not merely permitted.
     *
     * A non-match position used to be filled from whatever was left after excluding the N-back and
     * the immediately previous letter — which does not just fail to create lures, it actively
     * suppresses them: at n = 2 the (n−1) lure *is* the previous letter, so the commonest and most
     * diagnostic near-miss in the literature was structurally impossible. Measured lure density was
     * 2-3% of non-target positions against the 25-33% a lab task aims for, and the consequence is a
     * task passable by "have I seen that letter recently?" rather than by holding a position — which
     * is the whole construct.
     *
     * A lure repeats the letter at n±1, so it feels like a match to a reader whose window has
     * drifted by one, while not being one. The immediate-repeat rule still stands, so a lure is only
     * offered where it would not double a letter.
     */
    const lures: string[] = [];
    for (const offset of [plan.n - 1, plan.n + 1]) {
      if (offset < 1 || i - offset < 0) continue;
      const candidate = sequence[i - offset]!;
      if (candidate === back || candidate === previous) continue;
      lures.push(candidate);
    }
    if (lures.length > 0 && rng.bool(LURE_RATE)) {
      sequence.push(rng.pick(lures));
      continue;
    }
    sequence.push(rng.pick(pool));
  }
  return sequence;
}

const meta: ItemTypeMeta = {
  id: 'n-back',
  domain: 'Gwm',
  icon: '↩',
  sprintable: false,
};

const MAX_ATTEMPTS = 100;

function generate(seed: string, difficulty: Difficulty, locale: Locale): Item {
  const t = dict(locale).gen.nBack;
  const rng = createRng(`n-back:${seed}:${difficulty}`);
  const plan = planFor(difficulty);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const wanted = rng.int(plan.matches[0], plan.matches[1]);
    const sequence = buildStream(plan, rng, wanted);
    if (!sequence) continue;

    const actual = countMatches(sequence, plan.n);
    if (actual !== wanted) continue; // the independent check disagreed

    /*
     * Candidate answers are the counts either side of the true one, which is what makes the
     * distractors diagnostic: choosing one is having miscounted by that much, and miscounting
     * by one is `off-by-one` rather than an unexplained miss. Never below 1, because a zero
     * option would be answerable by never watching.
     *
     * The *window* is what matters, though, and it used to be nailed to the answer: the set was
     * always `{actual-2, actual-1, actual, actual+1}` clipped at 1, so the four numbers offered
     * named the answer outright. Since each difficulty draws its match count from a narrow band,
     * every count in the band mapped to a different option set — at level 5 the mapping was
     * one-to-one across 750 items, and a reader who never watched a single stream could score
     * 100%. Drawing the answer's position in the window instead leaves the same diagnostic
     * neighbours in play while making the set itself say nothing.
     */
    const set = windowOptions(
      rng,
      actual,
      OPTION_COUNT,
      (value) => (Math.abs(value - actual) === 1 ? 'off-by-one' : 'plausible'),
      1,
    );
    if (!set) continue;

    const values = rng.shuffle(set.values);
    const options: Option[] = values.map((v) => ({ kind: 'text', text: String(v) }));
    const answerIndex = values.indexOf(actual);
    const errorTypes: ErrorType[] = values.map((v) => set.errors.get(v) ?? 'plausible');

    return {
      type: 'n-back',
      seed,
      difficulty,
      prompt: t.prompt(plan.n),
      stimulus: { kind: 'n-back', sequence, n: plan.n },
      responseMode: 'choice',
      options,
      answerIndex,
      errorTypes,
      explanation: {
        summary: t.summary(actual, plan.n),
        // The matching pairs, spelled out, so a reader who lost the window can see where.
        rules: [t.ruleWindow(plan.n), t.rulePairs(matchList(sequence, plan.n)), t.ruleUpdating],
      },
      suggestedSeconds: 15 + plan.length * 2,
      presentation: { stepMs: plan.stepMs, gapMs: 200 },
    };
  }

  throw new Error(
    `n-back generator exhausted ${MAX_ATTEMPTS} attempts for seed "${seed}" d${difficulty}`,
  );
}

/** The matches as 1-based positions, e.g. "3 and 6, 7 and 9" — for the explanation. */
function matchList(sequence: string[], n: number): string {
  const pairs: string[] = [];
  for (let i = n; i < sequence.length; i++) {
    if (sequence[i] === sequence[i - n]) pairs.push(`${i - n + 1}–${i + 1} (${sequence[i]})`);
  }
  return pairs.join(', ');
}

export const nBackGenerator: Generator = { meta, generate };
