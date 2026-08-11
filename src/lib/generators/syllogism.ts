/**
 * Categorical syllogisms — the one item type whose ground truth is *provable* rather
 * than merely constructed (docs/GENERATABILITY.md §2).
 *
 * Validity is decided by exhaustive model checking rather than by the distribution rules.
 * Three terms partition any universe into 8 Venn cells (in/out of S, M, P), so a model is
 * just a subset of those cells declared non-empty — 256 models in total. An argument is
 * valid iff every model satisfying both premises also satisfies the conclusion. Checking
 * all 256 is exact, fast, and far less error-prone than encoding the syllogistic rules.
 *
 * Modern (Boolean) validity is used: no existential import, so "All S are P" does not
 * entail "Some S are P", and exactly the 15 unconditionally valid forms come out valid.
 */
import { createRng } from '../rng';
import { dict, type Locale } from '../i18n';
import type { Difficulty, ErrorType, Generator, Item, ItemTypeMeta, Option } from '../types';

/** A: all X are Y · E: no X is Y · I: some X is Y · O: some X is not Y */
export type PropType = 'A' | 'E' | 'I' | 'O';

const PROP_TYPES: PropType[] = ['A', 'E', 'I', 'O'];

export interface Proposition {
  type: PropType;
  /** Index into the term array: 0 = S (minor), 1 = M (middle), 2 = P (major). */
  subject: number;
  predicate: number;
}

// A Venn cell is a 3-bit mask: bit 0 = in S, bit 1 = in M, bit 2 = in P.
const CELLS = [0, 1, 2, 3, 4, 5, 6, 7];

function inTerm(cell: number, term: number): boolean {
  return (cell & (1 << term)) !== 0;
}

/** Does proposition `p` hold in the model given by the set of non-empty cells? */
function holds(p: Proposition, nonEmpty: number[]): boolean {
  switch (p.type) {
    case 'A': // all X are Y — no non-empty cell is in X but not Y
      return !nonEmpty.some((c) => inTerm(c, p.subject) && !inTerm(c, p.predicate));
    case 'E': // no X is Y
      return !nonEmpty.some((c) => inTerm(c, p.subject) && inTerm(c, p.predicate));
    case 'I': // some X is Y
      return nonEmpty.some((c) => inTerm(c, p.subject) && inTerm(c, p.predicate));
    case 'O': // some X is not Y
      return nonEmpty.some((c) => inTerm(c, p.subject) && !inTerm(c, p.predicate));
  }
}

/** All 256 models over three terms, as lists of non-empty Venn cells. */
const ALL_MODELS: number[][] = (() => {
  const out: number[][] = [];
  for (let mask = 0; mask < 256; mask++) {
    const cells: number[] = [];
    for (const c of CELLS) if (mask & (1 << c)) cells.push(c);
    out.push(cells);
  }
  return out;
})();

/** Models in which both premises are true. */
function modelsSatisfying(premises: Proposition[]): number[][] {
  return ALL_MODELS.filter((m) => premises.every((p) => holds(p, m)));
}

/** Exhaustive validity check: no counter-model exists. */
export function isValid(premises: Proposition[], conclusion: Proposition): boolean {
  const models = modelsSatisfying(premises);
  if (models.length === 0) return false; // inconsistent premises are excluded upstream
  return models.every((m) => holds(conclusion, m));
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/**
 * Invented category names. Real-world categories would let world knowledge substitute
 * for deduction ("all dogs are animals" is believable regardless of the premises), which
 * is the classic belief-bias confound. Nonsense terms remove it and keep the item
 * culture-fair.
 */
const TERM_WORDS = [
  'Blicks', 'Zorns', 'Kraves', 'Fendles', 'Murnats', 'Talvins', 'Ospers', 'Quilves',
  'Rendars', 'Vossins', 'Dromes', 'Halkins', 'Pemlors', 'Sarvins', 'Yulmets', 'Corvaks',
];

/**
 * Renders a proposition in the given language.
 *
 * Every term is a plural noun ending in "s", which is not incidental: French renders the
 * E form as "Aucun Blick n'est un Zorn", so the dictionary needs a predictable singular
 * to derive. English never needs it, but the invented vocabulary has to serve both.
 */
function renderProp(p: Proposition, terms: string[], locale: Locale): string {
  const g = dict(locale).gen.syllogism;
  const subject = terms[p.subject]!;
  const predicate = terms[p.predicate]!;
  switch (p.type) {
    case 'A':
      return g.propA(subject, predicate);
    case 'E':
      return g.propE(subject, predicate);
    case 'I':
      return g.propI(subject, predicate);
    case 'O':
      return g.propO(subject, predicate);
  }
}

// Terms: 0 = S (minor), 1 = M (middle), 2 = P (major).
// The four figures are the four placements of the middle term in the premises.
const FIGURES: { major: [number, number]; minor: [number, number] }[] = [
  { major: [1, 2], minor: [0, 1] }, // M-P, S-M
  { major: [2, 1], minor: [0, 1] }, // P-M, S-M
  { major: [1, 2], minor: [1, 0] }, // M-P, M-S
  { major: [2, 1], minor: [1, 0] }, // P-M, M-S
];

const meta: ItemTypeMeta = {
  id: 'syllogism',
  domain: 'Gf',
  icon: '∴',
  sprintable: false,
};

/**
 * The difficulty dial `docs/GENERATABILITY.md` describes — "figure; # negative/particular premises"
 * — which until now did not exist in this file at all.
 *
 * Figure and both premise moods were drawn uniformly with no difficulty term, so levels 1 and 2
 * produced identical item pools and differed only in the seconds suggested for them, and the
 * measured share of negative premises across the five levels was non-monotone.
 *
 * Universal affirmatives are the easiest premises to hold; particulars and negatives are what make
 * a syllogism hard, and the first figure is the one whose valid moods are most familiar.
 */
function moodPool(difficulty: Difficulty): PropType[] {
  /* Every level keeps at least one particular premise available. A pool of universals alone can
     never produce a particular conclusion, which would leave the key drawn from two moods instead
     of four — and since the four conclusions differ in length on screen, a narrowed key is legible
     without reading any of them. */
  switch (difficulty) {
    case 1:
      return ['A', 'A', 'A', 'E', 'I'];
    case 2:
      return ['A', 'A', 'E', 'I', 'O'];
    case 3:
      return ['A', 'E', 'E', 'I', 'O'];
    case 4:
      return ['A', 'E', 'I', 'I', 'O', 'O'];
    case 5:
      /* One universal affirmative is kept in the pool. Without it almost the only Boolean-valid
         conclusion reachable is O, and 80% of the level's keys were that one mood — the mood that
         prints the longest line, so the level gave itself away on sight. */
      return ['A', 'E', 'E', 'I', 'O', 'O'];
  }
}

function figurePool(difficulty: Difficulty): typeof FIGURES {
  switch (difficulty) {
    case 1:
      return FIGURES.slice(0, 1);
    case 2:
      return FIGURES.slice(0, 2);
    case 3:
      return FIGURES.slice(0, 3);
    default:
      return FIGURES;
  }
}

const MAX_ATTEMPTS = 400;

function generate(seed: string, difficulty: Difficulty, locale: Locale): Item {
  const t = dict(locale).gen.syllogism;
  const rng = createRng(`syllogism:${seed}:${difficulty}`);
  /*
   * "No valid conclusion" is drawn at its fair share of the five options, at every difficulty.
   *
   * It used to be biased upward with level — 0.35 + 0.05·d, reaching 0.60 at difficulty 5 — on the
   * reasoning that it is the answer people most often miss. The effect was the opposite of the
   * intent. It made "none" the key in 40% of all items against a 20% chance baseline, so answering
   * "no valid conclusion" to everything scored twice chance overall and *three times* at the level
   * where the bias was strongest. It is also the longest option on screen, so the tell survived
   * even for a reader who never read it: picking the longest line scored 43%.
   *
   * Difficulty is carried by the figure and the premise moods below, which is what
   * `docs/GENERATABILITY.md` says the dial is.
   */
  /*
   * The key is drawn first, from the five things it could be, and premises are then searched for.
   *
   * Equalising "none" against "some conclusion" is not enough on its own, because the four
   * conclusions are not interchangeable on screen: "All X are Y" and "Some X are not Y" differ in
   * length, and which mood happens to be valid is decided by the logic rather than by any draw. Left
   * alone that made the key's *mood* predictable, and picking the second-longest line scored half
   * again above chance without a word being read.
   */
  const targetKey: PropType | null = rng.pick([...PROP_TYPES, null]);
  const wantNoConclusion = targetKey === null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const figure = rng.pick(figurePool(difficulty));
    const majorType = rng.pick(moodPool(difficulty));
    const minorType = rng.pick(moodPool(difficulty));

    const premises: Proposition[] = [
      { type: majorType, subject: figure.major[0], predicate: figure.major[1] },
      { type: minorType, subject: figure.minor[0], predicate: figure.minor[1] },
    ];

    // Premises with no model at all make everything vacuously valid — never a fair item.
    if (modelsSatisfying(premises).length === 0) continue;

    // Candidate conclusions always relate S to P, in that order (standard form).
    const candidates: Proposition[] = PROP_TYPES.map((type) => ({
      type,
      subject: 0,
      predicate: 2,
    }));
    const valid = candidates.filter((c) => isValid(premises, c));

    // More than one valid conclusion would make the key ambiguous.
    if (valid.length > 1) continue;
    /*
     * The drawn key is insisted on for most of the attempt budget, then dropped. Not every mood is
     * reachable from every level's premise pool, and a level that cannot produce one would otherwise
     * run out of attempts and throw rather than fall back to a fair item.
     */
    const insist = attempt < MAX_ATTEMPTS / 2;
    if (insist) {
      if (wantNoConclusion !== (valid.length === 0)) continue;
      if (targetKey !== null && valid[0]!.type !== targetKey) continue;
    } else if (wantNoConclusion !== (valid.length === 0)) {
      continue;
    }

    const terms = rng.sample(TERM_WORDS, 3);
    // Present in the conventional order: major premise, then minor premise.
    const lines = [renderProp(premises[0]!, terms, locale), renderProp(premises[1]!, terms, locale)];

    const optionSpecs: { text: string; correct: boolean; errorType: ErrorType }[] = [
      ...candidates.map((c) => ({
        text: renderProp(c, terms, locale),
        correct: valid.length === 1 && valid[0]!.type === c.type,
        errorType: 'plausible' as ErrorType,
      })),
      {
        text: t.noConclusion,
        correct: valid.length === 0,
        errorType: 'plausible' as ErrorType,
      },
    ];

    const all = rng.shuffle(optionSpecs);
    const answerIndex = all.findIndex((o) => o.correct);
    if (answerIndex < 0) continue;

    const options: Option[] = all.map((o) => ({ kind: 'text', text: o.text }));
    const errorTypes: ErrorType[] = all.map((o) => (o.correct ? 'correct' : o.errorType));

    const modelCount = modelsSatisfying(premises).length;
    const rules =
      valid.length === 1
        ? [
            t.ruleValid(renderProp(valid[0]!, terms, locale), modelCount),
            t.ruleValidOthers,
          ]
        : [t.ruleNone(modelCount), t.ruleNoneHint(terms[0]!, terms[2]!)];

    return {
      type: 'syllogism',
      seed,
      difficulty,
      prompt: t.prompt,
      stimulus: { kind: 'text', lines },
      responseMode: 'choice',
      options,
      answerIndex,
      errorTypes,
      explanation: {
        summary:
          valid.length === 1
            ? t.summaryValid(answerIndex + 1, renderProp(valid[0]!, terms, locale))
            : t.summaryNone(answerIndex + 1),
        rules,
      },
      suggestedSeconds: 35 + difficulty * 10,
    };
  }

  throw new Error(
    `syllogism generator exhausted ${MAX_ATTEMPTS} attempts for seed "${seed}" d${difficulty}`,
  );
}

export const syllogismGenerator: Generator = { meta, generate };

/** Exposed for tests: the classically valid forms this implementation should reproduce. */
export function enumerateValidForms(): { mood: string; figure: number }[] {
  const out: { mood: string; figure: number }[] = [];
  FIGURES.forEach((figure, fi) => {
    for (const major of PROP_TYPES) {
      for (const minor of PROP_TYPES) {
        const premises: Proposition[] = [
          { type: major, subject: figure.major[0], predicate: figure.major[1] },
          { type: minor, subject: figure.minor[0], predicate: figure.minor[1] },
        ];
        if (modelsSatisfying(premises).length === 0) continue;
        for (const concl of PROP_TYPES) {
          if (isValid(premises, { type: concl, subject: 0, predicate: 2 })) {
            out.push({ mood: `${major}${minor}${concl}`, figure: fi + 1 });
          }
        }
      }
    }
  });
  return out;
}
