# Which Item Types Can Be Generated *and* Verified Automatically?

Companion to [`IQ-TESTS.md`](./IQ-TESTS.md). This is the decision document that selects what the
site actually implements.

---

## 1. The three tests an item type must pass

An item type ships only if it passes all three:

**G — Generatable.** A program can produce a fresh, novel instance from a seed, without any
copyrighted stimulus and without a human authoring content.

**V — Verifiable.** The correct answer is *derived from the generating rule*, not looked up in
a hand-made key. The generator knows the answer because it constructed it.

**U — Unambiguous.** Exactly one option is defensible. This is the hard one, and it is where
naive generators fail. Two failure modes:

- **Under-determination** — the stimulus admits a second consistent rule.
  `2, 4, 8, ?` is *not* a valid item: 16 (×2) and 14 (+2,+4,+6) are both defensible.
- **Distractor leakage** — the answer is recoverable from the option set alone, without the
  stimulus. The original RAVEN dataset had exactly this bug: distractors were made by
  perturbing one attribute of the answer, so the answer was the attribute-wise **mode** of the
  candidate set, and a model could score highly reading only the options.
  **I-RAVEN** fixed it with an attribute-bisection tree. Any generator here must too.

**U is enforced mechanically, not by inspection** — see §4.

---

## 2. Decision matrix

Legend: ✅ pass · ⚠️ passes with engineering · ❌ fails

| # | Item type | CHC | G | V | U | Verdict |
|---|-----------|-----|---|---|---|---------|
| 1 | **Matrix reasoning** (3×3, RAVEN rules) | Gf | ✅ | ✅ | ⚠️ | **SHIP** |
| 2 | **Number series** (ANSIG operators) | Gf/Gq | ✅ | ✅ | ⚠️ | **SHIP** |
| 3 | **Letter series** | Gf | ✅ | ✅ | ⚠️ | **SHIP** |
| 4 | **Odd-one-out / figural classification** | Gf | ✅ | ✅ | ⚠️ | **SHIP** |
| 5 | **Figural analogy** (A:B :: C:?) | Gf | ✅ | ✅ | ⚠️ | **SHIP** |
| 6 | **Categorical syllogisms** | Gf | ✅ | ✅ | ✅ | **SHIP** — provable |
| 7 | **Mental rotation** (2-D polyomino) | Gv | ✅ | ✅ | ✅ | **SHIP** — decidable |
| 8 | **Paper folding** | Gv | ✅ | ✅ | ✅ | **SHIP** — simulable |
| 9 | **Digit / letter span** (fwd + backward) | Gwm | ✅ | ✅ | ✅ | **SHIP** |
| 10 | **N-back** | Gwm | ✅ | ✅ | ✅ | **SHIP** |
| 11 | **Symbol search** (latency-scored) | Gs | ✅ | ✅ | ✅ | **SHIP** |
| 12 | **Digit–symbol coding** (latency-scored) | Gs | ✅ | ✅ | ✅ | **SHIP** |
| 13 | **Figure weights** / balance algebra | Gf/Gq | ✅ | ✅ | ✅ | **SHIP** |
| 14 | **Number analogies / number matrices** | Gq | ✅ | ✅ | ⚠️ | *v2 — subsumed by #2/#1* |
| 15 | **Cube-net folding** | Gv | ✅ | ✅ | ✅ | *v2 — cost, not feasibility* |
| 16 | **3-D block rotation** (Shepard–Metzler) | Gv | ✅ | ✅ | ✅ | *v2 — needs 3-D rendering; #7 covers the construct* |
| 17 | **Visual puzzles** (assemble the target) | Gv | ✅ | ✅ | ⚠️ | *v2 — hard to guarantee a unique decomposition* |
| 18 | **Corsi block-tapping** | Gv/Gwm | ✅ | ✅ | ✅ | *v2 — #9 covers span* |
| 19 | **Verbal analogies** | Gc | ⚠️ | ⚠️ | ❌ | **REJECT** |
| 20 | **Vocabulary / synonyms / antonyms** | Gc | ⚠️ | ⚠️ | ❌ | **REJECT** |
| 21 | **Similarities** ("how are X and Y alike?") | Gc | ❌ | ❌ | ❌ | **REJECT** |
| 22 | **Reading comprehension** | Grw | ❌ | ❌ | ❌ | **REJECT** |
| 23 | **Auditory / phonetic processing** | Ga | ⚠️ | ✅ | ✅ | **REJECT** — scope |
| 24 | **Block design** (physical manipulation) | Gv | ✅ | ✅ | ✅ | **REJECT** — needs physical blocks |

### Why the Gc items are rejected

This is the single most important judgement in the document, so it's worth being explicit.

Verbal analogies and vocabulary **cannot be procedurally generated with verifiable ground
truth**, because their correctness depends on semantic facts about a natural language that live
outside the generator. A program can emit `hot : cold :: up : ?` only if a human already encoded
that *hot/cold* and *up/down* are antonym pairs. That makes it a **content database with a
lookup key** — hand-authored items in a trenchcoat — which fails **V** as defined above.

Worse, it fails **U** unpredictably: for `up : ?` the intended answer is *down*, but *above*,
*upward*, and *raised* are all defensible depending on the relation inferred, and the generator
has no principled way to know. Distractor selection has the same problem — a randomly drawn
word may be an *equally valid* answer.

The honest consequence: **this site trains Gf, Gv, Gwm and Gs, and does not train Gc.** That is
stated on the site itself rather than papered over. It also means the site cannot approximate a
Full Scale IQ even in principle, since VCI has no analogue here — which is fine, because §8 of
the knowledge doc already rules out reporting an IQ score at all.

Note that this asymmetry is *why* culture-fair batteries (Raven's, CFIT, NNAT) are purely
nonverbal, and why free online tests are almost universally matrix-based.

---

## 3. What ships in v1

Thirteen generators across four CHC domains:

| Module | Format | Difficulty dial |
|--------|--------|-----------------|
| `matrix` | 3×3 RAVEN-style, 8 options | # attributes under a rule; rule complexity |
| `series-number` | numeric sequence, 5 options | ANSIG operator (AOS→PS→CF→NPCP→PCP) |
| `series-letter` | letter sequence, 5 options | step size; # interleaved streams |
| `odd-one-out` | 5–6 figures, pick the violator | # shared attributes; salience of the violation |
| `analogy-figural` | A:B :: C:?, 5 options | # simultaneous transformations |
| `syllogism` | 2 premises, 4 conclusions | figure; # negative/particular premises |
| `rotation` | 2-D polyomino, rotation vs. mirror | rotation angle; shape complexity |
| `paper-folding` | folds + punches, 5 options | # folds; # punches |
| `figure-weights` | balance-scale algebra, 4 options | # shapes in the chain; objects in the target pan |
| `span` | digit/letter span, fwd & backward | span length (adaptive) |
| `n-back` | count the N-back repeats in a stream | N; stream length; step rate |
| `symbol-search` | target detection, latency-scored | set size; distractor similarity |
| `coding` | digit→symbol lookup, latency-scored | key size; symbol confusability |

> **On "latency-scored".** Processing speed (Gs) is a *speeded* construct: the score on a
> real subtest is how many items you complete per unit time, under an enforced limit. This
> site enforces no limit on any item, and records response latency instead. That is a
> defensible proxy — and it is what the app actually does — but it is not the same
> measurement, and the wording here and in the UI is kept literal for that reason. Adding a
> genuine per-item deadline (visible countdown, auto-submit on expiry, deadline stored on
> the response) is a *feature*, deliberately not folded into a wording fix.

> **On the two formats adapted to a one-response loop.** Both were shipped as the decision
> matrix above allows, but neither is the lab task unchanged, and the difference is a property
> of this site's structure rather than of the item:
>
> - **`n-back`** normally collects a hit/miss on *every* element of a minutes-long stream and
>   scores d-prime over the block. Here one item is one short stream and one question — how
>   many matches went past. The construct that matters survives (the N-window has to be
>   maintained and updated, and the stream is gone before you answer), but the per-element
>   sensitivity of a d-prime does not: a reader who loses the window mid-stream and guesses the
>   count can still land on it.
> - **`coding`** is a two-minute written sprint scored on completions. Here one item is one
>   substitution, scored on latency, so it measures substitution speed and not the sustained
>   output a timed page adds.
>
> Both would become the real thing given a **continuous timed block** — a mode this site does
> not have, for the same reason there is no per-item deadline (see the note above). That mode
> is the prerequisite for the speeded formats still unbuilt: mental arithmetic sprints, Stroop,
> Trail Making.

Every generator implements one interface:

```ts
interface Generator {
  meta: ItemTypeMeta;               // language-neutral: id, CHC domain, icon
  generate(seed: string, difficulty: Difficulty, locale: Locale): Item;
}

interface Item {
  type: ItemTypeId;
  seed: string;          // reproduces this exact item
  difficulty: Difficulty;
  stimulus: Stimulus;    // structured, renders to SVG/text
  options: Option[];
  answerIndex: number;   // derived by construction, never hand-keyed
  explanation: Explanation; // the rule set, for post-answer review
}
```

`locale` is passed in but **must never be read before or between RNG draws**. It selects the
words, never the item: the same seed produces the same figures, the same option order and the
same `answerIndex` in every language, so a shared seed is the same test for an English and a
French reader. This is asserted directly in `tests/i18n.test.ts`.

The `explanation` field is a requirement, not a nicety: a training tool that says only
"wrong" teaches nothing. Because the generator *constructed* the item from an explicit rule
set, it can always state that rule set in full afterwards.

---

## 4. Enforcing unambiguity mechanically

The ⚠️ ratings above are discharged by three guards, applied in the generator and asserted in
the unit tests.

**Guard 1 — Solver check (kills under-determination).**
For rule-inference types (matrix, number series, letter series, figural analogy), the generator
runs an independent **solver** over the stimulus. It enumerates the rule space and collects
every rule consistent with the visible cells. If more than one *distinct predicted answer*
survives, the item is **rejected and regenerated**. This is what makes `2, 4, 8, ?` impossible
to emit: two consistent rules predict 16 and 14, so it never reaches the user.

The solver is deliberately a **separate implementation** from the generator. Verifying with the
same code that generated the item proves nothing.

**Guard 2 — Distractor-leakage check (the I-RAVEN fix).**
After building the option set, the generator asserts that the correct answer is **not**
recoverable from the options alone:

- no option is the attribute-wise mode of the set;
- no option is uniquely identifiable by any single attribute value;
- every distractor differs from the answer in a *rule-relevant* way (a near-miss), not by
  being obviously malformed.

Distractors are generated by the **error-type** taxonomy from Wang & Su — each distractor
encodes a specific plausible reasoning mistake (wrong rule applied, rule applied along the wrong
axis, correct rule off-by-one, right shape/wrong attribute). This makes wrong answers
*diagnostic*: the review screen can name the mistake the user probably made.

**Guard 3 — Structural invariants.**
Asserted on every generated item: exactly one `answerIndex`; all options pairwise distinct;
option order shuffled by the seeded RNG (so the answer position is uniform — no positional
tell); the stimulus renders without overlap; difficulty is within the requested band.

### Test strategy

The unit tests are **property-based over seeds**, not example-based. For each generator, 500+
seeds × each difficulty are generated and every invariant is asserted on all of them, plus:

- the independent solver recovers `answerIndex` for 100% of items (verifies **V**);
- a **distractors-only** solver, shown the options but *not* the stimulus, scores at chance
  (verifies Guard 2 — this is the direct regression test for the RAVEN flaw);
- the same seed produces a byte-identical item across runs (verifies reproducibility).

---

## 5. Consequences for the product

- **No IQ score is reported.** No norms exist. The site reports accuracy, median response time,
  and progress per item type. (`IQ-TESTS.md` §8.)
- **Practice effects are disclosed in-app**, since drilling matrix reasoning is precisely the
  format with the largest known practice gains (~5–15 points on retest), and improvement on the
  site is improvement at *the task*, not evidence of raised *g*.
- **Every item is generated, never stored.** A seed string reproduces an item exactly, so a
  session is persisted as `(seed, type, difficulty, response, latency)` — a few bytes — and can
  be replayed for review. This also means there is no item bank to leak.
- **Zero copyright exposure.** No Wechsler, Raven's, or CFIT item is reproduced; the *formats*
  are described in the public literature and are not themselves protectable. Trade marks are a
  separate constraint from copyright: product names may be used *descriptively* ("the format
  used in Raven's Progressive Matrices") but never as this site's own product name.
  See `IQ-TESTS.md` §9.
- **Difficulty is designed, not calibrated.** The five bands come from published cognitive
  operators (ANSIG for series, rule-count and rule-abstractness for matrices, angle for
  rotation), which is a defensible *a priori* ordering — Arendasy & Sommer report those
  operators explaining ~77% of difficulty variance. It is still not an **IRT calibration**: no
  item has an estimated difficulty or discrimination parameter fitted to response data, so the
  adaptive ladder is a 3-up/2-down staircase, not an ability estimator. Anything resembling a
  θ estimate, a percentile, or a CAT claim would require data this project deliberately does not
  collect (`IQ-TESTS.md` §7.1).

---

## 6. Two roads not taken, and why

### 6.1 Open item banks (ICAR)

The **International Cognitive Ability Resource** is a public-domain, IRT-calibrated bank
(matrix reasoning, letter–number series, 3-D rotation, verbal reasoning) with published item
parameters — the only realistic source of *externally calibrated* items for a project like this.
It was considered and not used:

- It is a **fixed bank of a few dozen items**. Its parameters are valid only for a first,
  unrehearsed exposure; a drilling site burns through it in one session and then trains
  recall of specific items — the exact failure mode generation exists to avoid.
- ICAR16/ICAR60 items are already widely published online, so they are partly leaked.
- Its calibration would still not yield norms for *this* population and administration.

It remains the right reference if the project ever wants a **single, one-shot, calibrated
baseline** distinct from the practice drills, and it is properly licensed for that.

### 6.2 High-range / open-response items

High-range tests buy resolution above ~145 with untimed administration and open (drawn or typed)
responses instead of multiple choice — see `IQ-TESTS.md` §3.9. Two of those properties are
genuinely attractive here:

- **Open response removes guessing entirely**, which makes Guard 2 (distractor leakage)
  unnecessary rather than merely satisfied. The site already does this where the answer space is
  a canonical string: digit/letter span is free-text, exact-match scored.
- **Compound rules** (several simultaneous transformations, boolean shape algebra) are exactly
  what the difficulty-5 band is already reaching for.

What is rejected is the rest of the package: **untimed power items** turn the construct into
persistence plus free time, and **unnormed self-selected "norms"** are how HRTs produce the
inflated numbers this project refuses to produce at all. So: open response where the answer is
canonically representable, yes; the HRT scoring culture, no.

A generalised open-response mode for figural items (draw/assemble the missing cell) is feasible
— the generator already knows the answer as a structured object, so scoring is a deep-equality
check, not a rubric — and is the main untapped design space. It is v2 work, gated on an input
affordance that is usable on a phone.
