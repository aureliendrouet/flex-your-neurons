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
| 14 | **Head count** / running-count updating | Gwm | ✅ | ✅ | ✅ | **SHIP** |
| 15 | **Mental arithmetic** (latency-scored) | Gq | ✅ | ✅ | ✅ | **SHIP** |
| 16 | **Counting Stroop** / interference | Gs | ✅ | ✅ | ✅ | **SHIP** |
| 17 | **Trail making** A/B | Gs/Gf | ✅ | ✅ | ✅ | **SHIP** |
| 18 | **Number analogies / number matrices** | Gq | ✅ | ✅ | ⚠️ | *v2 — subsumed by #2/#1* |
| 19 | **Cube-net folding** | Gv | ✅ | ✅ | ✅ | *v2 — cost, not feasibility* |
| 20 | **3-D block rotation** (Shepard–Metzler) | Gv | ✅ | ✅ | ✅ | *v2 — needs 3-D rendering; #7 covers the construct* |
| 21 | **Visual puzzles** (assemble the target) | Gv | ✅ | ✅ | ⚠️ | *v2 — hard to guarantee a unique decomposition* |
| 22 | **Corsi block-tapping** | Gv/Gwm | ✅ | ✅ | ✅ | *v2 — #9 covers span* |
| 23 | **Verbal analogies** | Gc | ⚠️ | ⚠️ | ❌ | **REJECT** |
| 24 | **Vocabulary / synonyms / antonyms** | Gc | ⚠️ | ⚠️ | ❌ | **REJECT** |
| 25 | **Similarities** ("how are X and Y alike?") | Gc | ❌ | ❌ | ❌ | **REJECT** |
| 26 | **Reading comprehension** | Grw | ❌ | ❌ | ❌ | **REJECT** |
| 27 | **Auditory / phonetic processing** | Ga | ⚠️ | ✅ | ✅ | **REJECT** — scope |
| 28 | **Block design** (physical manipulation) | Gv | ✅ | ✅ | ✅ | **REJECT** — needs physical blocks |

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

The honest consequence: **this site trains Gf, Gv, Gwm, Gs and Gq, and does not train Gc.** That is
stated on the site itself rather than papered over. It also means the site cannot approximate a
Full Scale IQ even in principle, since VCI has no analogue here — which is fine, because §8 of
the knowledge doc already rules out reporting an IQ score at all.

Note that this asymmetry is *why* culture-fair batteries (Raven's, CFIT, NNAT) are purely
nonverbal, and why free online tests are almost universally matrix-based.

---

## 3. What ships in v1

Seventeen generators across five CHC domains:

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
| `head-count` | track arrivals and departures, report the total | # steps; step rate; group size |
| `symbol-search` | target detection, latency-scored | set size; distractor similarity |
| `coding` | digit→symbol lookup, latency-scored | key size; symbol confusability |
| `arithmetic` | evaluate a short expression, 4 options | operators available; operand size; chaining |
| `interference` | count the glyphs, ignore what they say | share of incongruent trials |
| `trail-making` | join the targets in order, timed as one run | number of targets |

> **On "latency-scored".** Processing speed (Gs) is a *speeded* construct: the score on a
> real subtest is how many items you complete per unit time, under an enforced limit. In
> practice and test mode this site enforces no limit on any item and records response latency
> instead. That is a defensible proxy — and it is what those modes actually do — but it is not
> the same measurement, and the wording here and in the UI is kept literal for that reason.
>
> `sprint` mode is where the limit is real. It puts a whole block under one clock and scores
> output per minute, which is the actual subtest measurement rather than a proxy for it. Note
> what it still does not add: a per-*item* deadline with auto-submit on expiry. A sprint bounds
> the block, not the item, so a reader may still spend as long as they like on any single item —
> at the cost of the ones they then do not reach, which is exactly the trade-off the real subtest
> imposes.

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
> Both now have that option: the **continuous timed block** ships as `sprint` mode — one format,
> a fixed window, items back to back under a single running clock, scored on output per minute. It
> does not replace the untimed drill, and the two are deliberately never pooled: a sprint's
> latencies measure how fast a reader *chose* to go and its accuracy is pushed down by the
> speed–accuracy trade-off, so `summarise` excludes sprints entirely and `sprintSummary` reports
> them in their own units. Pooling them would have moved every per-type median the first time
> anyone sprinted, with nothing on screen to say the measurement had changed.
>
> A format opts in with `meta.sprintable`, and the bar is narrow: one item answerable in a couple
> of seconds. A format carrying a `presentation` can never qualify, since the block would be spent
> watching — asserted in `tests/generators.test.ts` rather than left to reviewer discipline.
>
> The block was also the prerequisite named here for the speeded formats that were then unbuilt.
> `arithmetic` and `interference` shipped on top of it; `trail-making` did not need it, because a trail
> *is* a timed block — one item under one clock, which is how the real task is administered. Putting it
> inside a sprint would nest two clocks and score neither, which is why it is not `sprintable`.
>
> `arithmetic` is the one format designed for the block from the start rather than adapted to it,
> and one decision follows from that: the answer is **picked, not typed**. A typed answer would put
> keyboard speed inside a score that is meant to be about calculation, separating two readers who
> calculate equally well by how fast they find the digits.
>
> `head-count` was never in that list. Its source task is already one short episode answered once,
> so nothing about it is a compression of a longer block — which is why it could ship ahead of the
> block mode rather than waiting on it.

> **On what difficulty is allowed to scale.** Worth stating once, because getting it wrong is
> easy and the result still passes every test. `head-count` first scaled by letting the room
> fill up, so by level 5 the running total reached the twenties — and holding "23, now 26" is
> two-digit mental addition, which is a *different construct* with its own planned format. The
> level had gone up while the ability being measured had quietly changed. Difficulty must scale
> the load the format exists to measure — here, how many times the held value is rewritten and
> how fast — and never drift into an adjacent construct because that happens to make items feel
> harder.

> **On the Stroop task, and why it counts digits rather than naming colours.** The famous version
> prints the word "RED" in blue ink and asks for the ink. This site cannot do that, and the reason is
> not squeamishness: hue carries no information anywhere here, because roughly one man in twelve would
> otherwise be answering a different question (`DESIGN-PLAN.md` §3.1). A colour Stroop would make
> colour vision a *prerequisite for the format* rather than an accessibility detail, and no palette
> fixes it — achromatopsia leaves the task undoable.
>
> The counting Stroop (Bush et al.) measures the same construct on a different dimension: reading a
> digit is automatic, counting how many there are is not, so `4 4 4` pulls towards "4" when the answer
> is 3. It is also language-neutral, which a word-based version could not be — the interference would
> otherwise depend on how fast the reader reads *that* language, and the English and French versions of
> a seed would stop being the same item.
>
> This is the one format whose measurement is a **difference rather than a total**: the interference
> score is incongruent median latency minus congruent, and neither half means much alone. It is also
> the one that vindicated the seed architecture in a way nobody designed for. Congruency was never
> stored on a response — it did not need to be, because every item regenerates exactly from
> `(type, seed, difficulty)`, so the partition is re-derived at read time from history written before
> the read-out existed.

> **On trail making, the third response mode, and a deviation worth naming.** Every other format
> collects one decision. A trail collects a *path*: targets are joined in order and the whole run is
> timed as a unit, so `responseMode: 'trail'` exists alongside `'choice'` and `'text'`. Correctness is
> a binarisation rather than a fact — a trail always completes, so "correct" is set to "finished
> without a misclick" and the copy says plainly that the time is the measurement. A wrong click is
> counted and the run continues, as it does when an examiner says "no, that one".
>
> Form A (numbers) and form B (numbers alternating with letters) are a *within-format* condition and
> not difficulty levels, for the same reason the incongruent share is not spread across levels in the
> Stroop format: making level 4 a different construct from level 1 would leave the levels
> incomparable. Difficulty scales the target count; form varies per item. That buys the **B-minus-A
> switch cost**, the classic executive measure, recoverable from history by regenerating items — the
> second contrast on the site built out of the seed architecture rather than out of a stored field.
>
> The deviation: **sixteen targets at the top level, not the twenty-five of the paper test.**
> Twenty-five circles fit an A4 sheet; on a phone-width board they cannot be placed without either
> overlapping or shrinking below a tappable size. Fewer targets changes the amount of search while
> leaving the task intact, which is the only one of the three options that does not break something.

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
