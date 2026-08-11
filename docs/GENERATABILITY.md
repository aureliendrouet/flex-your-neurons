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
| 22 | **Corsi block-tapping** / block span | Gwm | ✅ | ✅ | ✅ | **SHIP** |
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

Twenty-six generators across five CHC domains:

| Module | Format | Difficulty dial |
|--------|--------|-----------------|
| `matrix` | 3×3 RAVEN-style, 8 options | # attributes under a rule; rule complexity |
| `series-number` | numeric sequence, 5 options | ANSIG operator (AOS→PS→CF→NPCP→PCP) |
| `series-letter` | letter sequence, 5 options | step size; # interleaved streams |
| `odd-one-out` | 5–6 figures, pick the violator | # attributes varying among the conformers; layout |
| `analogy-figural` | A:B :: C:?, 5 options | # simultaneous transformations |
| `syllogism` | 2 premises, 4 conclusions | figure; # negative/particular premises |
| `rotation` | 2-D polyomino, rotation vs. mirror | rotation angle; shape complexity |
| `paper-folding` | folds + punches, 5 options | # folds; # punches |
| `figure-weights` | balance-scale algebra, 4 options | # shapes in the chain; objects in the target pan |
| `span` | digit span, fwd & backward | span length; backward from level 3 |
| `block-span` | watch nine blocks light, tap them back | sequence length, and nothing else |
| `n-back` | count the N-back repeats in a stream | N; stream length; step rate |
| `head-count` | track arrivals and departures, report the total | # steps; step rate |
| `symbol-search` | target detection, latency-scored | set size; distractor similarity |
| `coding` | digit→symbol lookup, latency-scored | key size; symbol confusability |
| `arithmetic` | evaluate a short expression, 4 options | operators available; operand size; chaining |
| `interference` | count the glyphs, ignore what they say | share of incongruent trials (see the note below) |
| `trail-making` | join the targets in order, timed as one run | number of targets |
| `high-number` | two numerals at conflicting sizes, pick the larger value | share of incongruent trials; numerical distance |
| `hand-game` | rock-paper-scissors, play the winner or the loser | share of "lose" trials (see the note below) |
| `serial-subtraction` | take the same number away repeatedly, 4 options | chain length; awkwardness of the step |
| `math-recall` | numbers shown one at a time, then added, 4 options | # terms; magnitude; step rate |
| `time-lapse` | two clock faces, how many minutes between them | whether the interval crosses the hour |
| `clock-spin` | read a clock face that has been turned | rotation; how late the minute hand sits |
| `calendar-count` | given one day, name the day another date falls on | direction of the count; crossing into the next month |
| `change-maker` | pick the fewest coins that make the change | coins in the answer; whether the amount reaches the 1s and 2s |

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

> **On conflict formats and the variety property.** `interference`, `high-number` and `hand-game`
> are all conflict tasks, and all three break the rule that a format must not repeat itself.
> `hand-game` breaks it completely: three hands against two instructions is six items in total, and
> no seed will ever produce a seventh.
>
> That is the paradigm rather than a shortcut. What these formats measure is the cost of holding
> back an automatic response — and the response has to *become* automatic before there is anything
> to hold back. A novel stimulus every time is precisely what would remove the effect, which is why
> the lab versions run a small set for dozens of trials and read the *latency difference* between
> conditions rather than the accuracy. `tests/generators.test.ts` exempts `interference` and
> `hand-game` from the variety property and states this; what it checks instead is that both
> conditions occur at every level and that the harder instruction gets commoner as difficulty rises,
> which is the only dial any of the three has.
>
> `high-number` needs no exemption — two values and two drawing sizes leave plenty of room — but it
> is built to the same rule: the dial is how often the conflict fires, plus the numerical distance
> that decides how long the comparison stays open for the drawing to interfere with.

> **On sameness being a question about ink, not about records.** Three formats shipped items whose
> correct answer was scored wrong, and all three had the same cause. `rotation` is a free number in
> the data model and a *quotient* on the page: a regular polygon turned by one of its own symmetry
> steps is the same picture, and the drawing code has always known this while the identity checks did
> not. A hexagon at 60° and at 120° are one mark; a circle takes no angle at all, so the vocabulary's
> six orientations collapse to one; and across shapes, a square turned 45° is drawn as the same four
> points as an upright diamond, which no per-shape symmetry table can see.
>
> So a coding key held two identical symbols under different digits, a symbol-search trial keyed
> "target absent" displayed a pixel-perfect copy of the target in a third of its hardest items, and a
> figural analogy put its own answer on screen twice. In each case a reader who did the task
> perfectly was marked incorrect — and for the two speeded formats the damage compounded, because
> latency medians are taken over *correct* responses, so the corrupted trials were silently dropped
> from the measurement the format exists to produce.
>
> `canonicalRotation` and `figureSignature` in `geometry.ts` are the fix, and the rule they encode is
> the general one: **anywhere two figures are compared for sameness, keyed for de-duplication, or
> described to a reader, compare what is drawn.** `tests/rendering-identity.test.ts` holds every
> figural format to it, including the description channel — two options that read alike to a screen
> reader are two options that cannot be chosen between.

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
>
> That trick has a price, and it is now paid explicitly. A re-derived condition is only sound while
> the generators still produce what the reader answered — change a plan and every old response is
> sorted by a congruency it never had, while the contrast goes on returning a confident number. A
> wrong statistic is worse than a missing one. So `ITEM_VERSION` (in `generators/index.ts`) names the
> current generation of the generators, `newSession` stamps it, and `rederivableSessions` narrows the
> two seed-derived contrasts to sessions that match. Bump it whenever a change alters what a
> `(type, seed, difficulty)` tuple yields. Nothing else narrows: accuracy, latency and the recorded
> error type are measured rather than inferred, and survive any generator change intact. It is a
> different axis from `SCHEMA_VERSION` in `store.ts`, which governs the persisted *shape* and discards
> the old key outright.

> **On trail making, the third response mode, and a deviation worth naming.** Every other format
> collects one decision. A trail collects a *path*: targets are joined in order and the whole run is
> timed as a unit, so `responseMode: 'trail'` exists alongside `'choice'` and `'text'`. Correctness is
> a binarisation rather than a fact — a trail always completes, so "correct" is set to "finished
> without a misclick" and the copy says plainly that the time is the measurement. A wrong click is
> counted and the run continues, as it does when an examiner says "no, that one".
>
> Form A (numbers) and form B (numbers alternating with letters) are a *within-format* condition and
> not difficulty levels: making level 4 a different construct from level 1 would leave the levels
> incomparable. Difficulty scales the target count; form varies per item.
>
> (This paragraph used to justify that by saying the Stroop format keeps its incongruent share off the
> difficulty ladder. It does not — the share *is* that format's only dial, rising from about half at
> level 1 to nearly nine in ten at level 5, and `interference.ts` says so in as many words. The two
> formats genuinely differ here; what follows from it for the Stroop read-out is recorded below.) That buys the **B-minus-A
> switch cost**, the classic executive measure, recoverable from history by regenerating items — the
> second contrast on the site built out of the seed architecture rather than out of a stored field.
>
> The deviation: **sixteen targets at the top level, not the twenty-five of the paper test.**
> Twenty-five circles fit an A4 sheet; on a phone-width board they cannot be placed without either
> overlapping or shrinking below a tappable size. Fewer targets changes the amount of search while
> leaving the task intact, which is the only one of the three options that does not break something.
>
> Worth stating precisely, because the wording implies more than is delivered: sixteen is what keeps
> the targets from *overlapping*, not what makes them comfortable. Measured on a 360px-wide phone they
> are about 23px across — clear of the WCAG 2.2 AA minimum only through its spacing exception, and
> well short of the 44px AAA guideline. The radius is a constant besides, so an eight-target board at
> level 1 has exactly the same target size as a sixteen-target one at level 5: cutting twenty-five to
> sixteen bought packing feasibility, not tappability. The stylesheet states that trade honestly and
> this note now does too.

> **On block span (Corsi), and the fourth response mode.** Nine blocks light one after another and are
> tapped back in order — digit span with places instead of digits, and the pair dissociate, which is
> the reason to have both rather than one with more levels. The response is a *sequence* of taps, like
> a trail, but it is not the same mode: a trail is scored on time because its order is written on the
> targets, while a tapped sequence is scored on whether it matches, because the order was shown once
> and taken away. Hence `responseMode: 'tap'`, which reuses `answerText`/`chosenText` — a tapped
> sequence really is a short string, and comparing it is the comparison `'text'` already does.
>
> Two things are held fixed on purpose, and both are the same mistake in different costumes:
>
> - **The board never changes.** A layout redrawn per item would make the reader *find* the blocks
>   before they could remember an order among them, mixing a search into a span. Same argument as the
>   fixed keypad in the Stroop format, arrived at from the other direction.
> - **Difficulty is sequence length and nothing else.** Not the flash rate (that trades storage for
>   encoding speed), not the block count (that is a selection demand), and never a backward trial. A
>   backward spatial span is a harder task rather than a longer one; mixed into the ladder it would
>   make accuracy at a level bimodal, and unlike trail making's two forms there is no timed contrast
>   to redeem the variance, because this format is scored right or wrong.
>
> It is the first format whose diagnosis is **computed rather than keyed**. Every other format builds
> each distractor to embody one misreading and records which; a tap has no distractors, so the error
> type is derived from the response — and "you had the blocks and lost the order" (`transposition`) is
> a materially different finding from tapping a block that never lit.
>
> Not built: a **spatial-versus-verbal span contrast**, the obvious third read-out after the Stroop
> and switch-cost ones. The two formats are not matched — `span` runs four to seven items with a
> backward condition from level 3, `block-span` runs three to seven forwards only — so the difference
> between them would be a fact about the two ladders rather than about the reader. Matching them would
> mean redesigning `span`, which is a change to a shipped measurement, not an addition to it.

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

**Guard 2 is enforced centrally, in `tests/leakage.test.ts`, and that is a correction rather than a
refactor.** It used to be asserted per format, by hand, wherever someone had thought to. That failed
the way hand-written guards fail: each one tested the attack its author had in mind. The matrix guard
scored options by shared-value count — which its balanced attribute cube makes uniform *by
construction* — and so reported chance against a real leak of three times chance; the head-count
guard checked that every option was within ten of the answer, which is a fact about distance and says
nothing about rank, while the answer was the second-smallest of four in **every item the format had
ever produced**. Twelve of the fifteen multiple-choice formats were leaking when the sweep was first
run, several of them at four to five times chance.

The shared harness fixes the shape of the mistake, not just the instances. It runs a *family* of
stimulus-blind strategies — extremes, ranks, cluster centres, neighbour gaps, attribute-wise
majority, equivalence-class outliers — over generic features of the option list, and holds every
format to the best of them, per difficulty as well as pooled.

Two details make it trustworthy rather than merely strict. Ties are scored as ties: a strategy that
narrows five options to three earns a third of a guess, so "it cannot quite decide" is measured as
what it is. And the bar is **calibrated rather than assumed** — the same family is re-run against the
same option sets with the answer position replaced by an arbitrary one, and a format is asked to
score no better on its real answers than the family scores on invented ones. Raw chance would have
been the wrong bar in both directions: plausible near-miss distractors leave the answer near the
middle of the set often enough to beat 1/n on their own, and the maximum of fifty noisy estimators is
not an unbiased estimate of anything.

The harness shipped with one recorded allowance, for figural analogy at level 5, on the reading that
three simultaneous transformations leave too few attributes varying to spread. The reading was wrong
about the cause, which is the argument for measuring rather than reasoning: the bisect spread an
attribute only where *more than one* distractor still carried the answer's value, so the case where
exactly one did was skipped as though already balanced — leaving the answer's value the only one held
twice, and "pick either option from the one matched pair" a coin flip on a five-option item. The
repair is to state the invariant and check it: the answer's value must sit in a class whose size some
wrong value also has, on every attribute that varies. A set that cannot be arranged that way is
discarded rather than shown. **The allowance table is now empty, and the useful discipline is that an
allowance is a debt with a number on it rather than a permanent exemption.**

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
