# Knowledge Base: IQ Tests, Item Formats, and Automatic Item Generation

> Research document produced for the `iq` training site. Sources are listed at the bottom.
> **This document is descriptive, not clinical.** Nothing here should be read as a claim that
> the practice site produces a valid IQ score. See §8.

---

## 1. What an "IQ test" actually is

An IQ test is a **standardised battery of subtests**, each measuring a narrow cognitive ability.
Raw scores on each subtest are converted to scaled scores against an age-matched **norming
sample**, then combined into index scores and a composite (Full Scale IQ). The composite is
conventionally scaled to **mean 100, standard deviation 15** (the Cattell scale uses SD 24,
which is why "Cattell IQ 148" ≈ "Wechsler IQ 130").

Three things make a score meaningful, and all three are properties of the *administration*, not
of the questions:

1. **Norms** — a representative standardisation sample the raw score is compared against.
2. **Standardised administration** — fixed instructions, timing, order, and stop rules.
3. **Established reliability/validity** — published test–retest correlations (0.85–0.95 for
   major batteries) and criterion validity studies.

A generator can produce items that *look and behave* like subtest items. It cannot produce
norms. This distinction drives the whole design of this project.

---

## 2. The theoretical frame: CHC (Cattell–Horn–Carroll)

Nearly every modern battery is explicitly mapped onto CHC theory, a three-stratum hierarchy:

- **Stratum III** — general ability, *g*.
- **Stratum II** — ~10 broad abilities.
- **Stratum I** — 70–80+ narrow abilities, each measured by particular subtests.

The broad abilities that matter for a practice site:

| Code | Broad ability | What it is | Typical task |
|------|---------------|------------|--------------|
| **Gf** | Fluid reasoning | Novel problem solving, inductive/deductive reasoning | Matrix reasoning, number series, syllogisms |
| **Gc** | Comprehension-knowledge | Acquired verbal knowledge | Vocabulary, verbal analogies, general information |
| **Gv** | Visual processing | Mental manipulation of visual patterns | Mental rotation, paper folding, block design |
| **Gwm/Gsm** | Working memory | Hold + manipulate information briefly | Digit span, n-back, letter–number sequencing |
| **Gs** | Processing speed | Fast, accurate performance on easy tasks | Symbol search, coding, digit–symbol substitution |
| **Glr** | Long-term storage/retrieval | Encoding and fluent retrieval | Paired associates, fluency |
| **Gq** | Quantitative knowledge | Acquired maths knowledge | Arithmetic |
| **Ga** | Auditory processing | Phonetic discrimination | Phoneme deletion |
| **Gt** | Reaction/decision speed | Simple RT | Choice reaction time |
| **Grw** | Reading & writing | Decoding, comprehension | Reading comprehension |

**Gf is the single closest proxy to *g*** and is also the most procedurally generatable — this
is the core reason abstract-reasoning tests dominate free/online testing.

---

## 3. The major test families

### 3.1 Wechsler scales (WAIS-5 / WAIS-IV adults, WISC-V children, WPPSI-IV preschool)

The most widely administered clinical batteries. WAIS-IV structure — 10 core + 5 supplemental
subtests producing four index scores plus FSIQ:

| Index | Subtests | CHC |
|-------|----------|-----|
| Verbal Comprehension (VCI) | Similarities, Vocabulary, Information, (Comprehension) | Gc |
| Perceptual Reasoning (PRI) | Block Design, Matrix Reasoning, Visual Puzzles, (Figure Weights, Picture Completion) | Gf/Gv |
| Working Memory (WMI) | Digit Span, Arithmetic, (Letter–Number Sequencing) | Gwm |
| Processing Speed (PSI) | Symbol Search, Coding, (Cancellation) | Gs |

Administered 1-on-1 by a qualified examiner; heavily copyrighted; items are trade secrets.

### 3.2 Stanford–Binet 5 (SB5)

Five factor scores (Fluid Reasoning, Knowledge, Quantitative Reasoning, Visual-Spatial
Processing, Working Memory), each measured in **both** a verbal and a nonverbal domain — a
10-subtest 5×2 design. Uses routing subtests to set the starting difficulty.

### 3.3 Raven's Progressive Matrices (RPM)

The canonical **nonverbal, culture-reduced** Gf test. Three versions:

- **CPM** (Coloured) — children/elderly, 36 items, sets A, Ab, B.
- **SPM** (Standard) — 60 items in five sets A–E of 12, increasing difficulty within each set.
- **APM** (Advanced) — high-ability discrimination, Set I (12, practice) + Set II (36).

Item format: a **3×3 matrix of figures with the bottom-right cell missing**; pick the option
(6–8 candidates) that completes the pattern. Modern editions (SPM-Plus, Raven's 2) exist
because the classic sets leaked widely.

### 3.4 Cattell Culture Fair Intelligence Test (CFIT)

Explicitly designed by Raymond Cattell to reduce cultural/linguistic/educational loading.
Scale 2 and Scale 3, each with two parallel forms, four timed subtests: **Series, Classification
(odd-one-out), Matrices, Conditions (topology)**. Reported on the SD-24 scale.

### 3.5 Woodcock–Johnson IV (WJ-IV)

The most explicitly CHC-aligned battery — Tests of Cognitive Abilities, Oral Language, and
Achievement, with subtests deliberately mapped to broad/narrow CHC factors.

### 3.6 Kaufman (KABC-II / KAIT)

Built on Luria's sequential/simultaneous processing model *and* CHC, with a dual interpretive
scheme; designed to reduce cultural bias.

### 3.7 Short screeners & group tests

- **Wonderlic Personnel Test** — 50 mixed items in 12 minutes, occupational screening.
- **Cognitive Abilities Test (CogAT)**, **Otis–Lennon (OLSAT)** — group school tests.
- **Naglieri Nonverbal Ability Test (NNAT)** — nonverbal matrices for schools.
- **Mensa admission** — accepts qualifying scores from supervised tests (e.g. Cattell III B,
  Raven's APM); its own supervised test is a two-part battery.

### 3.8 Dedicated spatial tests

- **Vandenberg & Kuse Mental Rotations Test (MRT)** — built from Shepard & Metzler's 1971
  cube figures; pick the **two** of four that are rotations of the target. KR-20 ≈ .88,
  test–retest ≈ .83.
- **Paper Folding Test (VZ-2)** — a sheet is folded, holes punched; pick the unfolded result.
- **Form Board / Surface Development** — assemble/unfold shapes mentally.

### 3.9 High-range tests (HRT) — the ceiling problem

Standard batteries run out of resolution at the top. A WAIS or an APM has neither enough
normative cases nor enough discriminating items much above **145–160**: near the ceiling a
single careless error costs several points, so the *measurement error dwarfs the difference
being measured*.

| Society | Claimed cut-off | Rarity | IQ (SD 15) |
|---------|-----------------|--------|-----------|
| Mensa | top 2% | 1 in 50 | ≥ 130 |
| Intertel | top 1% | 1 in 100 | ≥ 135 |
| Triple Nine Society | top 0.1% | 1 in 1,000 | ≥ 149 |
| Prometheus Society | top 0.003% | 1 in ~30,000 | ≥ 160 |
| Mega Society | top 0.0001% | 1 in 1,000,000 | ≥ 175 |
| Giga Society | 1 in 10⁹ | 1 in 1,000,000,000 | ≥ 190 |

To serve those cut-offs, a subculture of **high-range tests** grew up around *Omni* and *Games
Magazine* in the 1980s–90s: Ronald K. Hoeflin's **Mega Test** and **Titan Test** (48 items each,
half verbal, half spatial/combinatorial), and later purely figural tests from Paul Cooijmans,
Xavier Jouve and Robert Lato (*Logima Strictica 36*, *Nemesis*, *Triplex*). Their distinctive
design choices:

1. **Untimed power tests** — days or weeks per item are allowed, with paper and pencil.
2. **Open response, no multiple choice** — you draw or state the answer, which removes guessing
   entirely (and with it the option-leakage failure mode described in `GENERATABILITY.md` §1).
3. **Deliberately compound rules** — several simultaneous transformations per figure (boolean
   combination of shapes, non-linear displacement, polarity inversion, topological change), or
   3-D combinatorial-geometry problems ("27 unit cubes form a 3×3×3 cube; remove one — how many
   distinct solids result?").

**Why academic psychometrics distrusts them, and why it matters here:**

- **No normative sample is possible.** Validating a 1-in-a-million cut-off honestly would need
  a controlled sample in the hundreds of millions. Published HRT "norms" are self-selected
  volunteers who chose to spend weeks on a puzzle set — the least representative sample
  imaginable. Norms are also typically *chained* to other unnormed HRTs, so the errors compound.
- **Untimed ⇒ the construct drifts.** With no time limit the test measures persistence, free
  time and puzzle obsession alongside Gf. Under CHC that is no longer a clean Gf measure.
- **The scales are not comparable.** Cut-offs are quoted on SD 15 and SD 16 interchangeably
  across societies, and rarity claims beyond ~4σ assume the normal curve holds in a tail where
  it is empirically unverified.

**Design consequence for this site:** ceiling *is* a real limitation of any 5-band difficulty
ladder, but the HRT answer to it (untimed, open-response, unnormed) buys resolution by giving up
exactly the properties this project is built on — verified single answers, controlled
administration, and refusal to score. See `GENERATABILITY.md` §6.

### 3.10 Open, research-grade item banks: ICAR

The **International Cognitive Ability Resource** (ICAR, Condon & Revelle) is the exception to
the "everything is proprietary" rule: a public-domain/CC-licensed, IRT-calibrated bank of
cognitive items built for research, with published item parameters.

- Four public item types: **Matrix Reasoning**, **Letter–Number Series**, **3-D Rotation**,
  **Verbal Reasoning**; short forms (ICAR16, ICAR60) are widely used online.
- 100% machine-scorable (closed response), designed for unproctored web administration, with
  published reliability and correlations against full batteries.
- It is the only realistic route to *externally calibrated* items in a project like this — but
  it is a **fixed bank**, so it leaks and cannot be regenerated. See §9 and `LIBRARIES.md` §3.

---

## 4. Item formats catalogue

This is the operational list — what a question actually looks like.

### Nonverbal / figural
1. **Matrix reasoning** — 3×3 grid, one cell missing, rule-governed attributes.
2. **Figural series** — a 1×N row progressing by a rule; pick the next figure.
3. **Odd-one-out / classification** — N figures, one violates the shared concept.
4. **Figural analogy** — A : B :: C : ? applied to shapes.
5. **Mental rotation** — is the candidate a rotation (vs. a mirror) of the target?
6. **Paper folding** — fold + punch, predict the unfolded pattern.
7. **Visual puzzles** — which pieces combine to form the target shape.
8. **Cube/net folding** — which net folds into the shown cube.
9. **Figure weights** — balance scales, solve for the unknown equivalence.
10. **Topology / conditions** — where can a dot be placed satisfying the same relations.

### Numerical / quantitative
11. **Number series** — complete the sequence.
12. **Number analogies** — 3:9 :: 5:?
13. **Number matrices** — 3×3 grid of numbers with row/column rules.
14. **Arithmetic word problems** (Gq).

### Verbal
15. **Verbal analogies** — hot : cold :: up : ?
16. **Vocabulary / synonyms / antonyms** (Gc).
17. **Similarities** — how are X and Y alike? (open-ended, human-scored).
18. **Verbal classification** — odd word out.
19. **Letter series** — ACFJO…?
20. **Anagrams / word construction**.
21. **Syllogisms & deductive logic** — validity judgement.
22. **Seating/ordering puzzles** — constraint satisfaction.

### Memory & speed
23. **Digit span** forward/backward, **letter–number sequencing**.
24. **Corsi block-tapping** (visuospatial span).
25. **N-back** (working-memory updating; research task, not a clinical subtest).
26. **Symbol search** — does the target appear in the search group?
27. **Digit–symbol coding** — transcribe using a legend, timed.
28. **Cancellation** — cross out targets among distractors.

---

## 5. Automatic Item Generation (AIG) — what the literature establishes

AIG replaces hand-authored items with an **item model** (a template with a fixed logical
structure) plus **substitution/instantiation** of surface features. Two key benefits: unlimited
non-leaked items, and *predictable* difficulty when the model's cognitive operators are known.

### 5.1 Matrices

- **Hornke & Habon (1986)** provided the first widely used procedural rule set for
  Raven-like matrices — eight variation rules for geometric elements: *identity, addition,
  subtraction, intersection, exclusive union (symmetric difference), progression, and
  variation of open/closed gestalts*.
- **Wang & Su (IJCAI 2015), "Automatic Generation of Raven's Progressive Matrices"** —
  gave an abstract first-order-logic representation of RPMs, restricted instantiation to only
  *valid* matrices, and showed generated problems are statistically indistinguishable from real
  ones. Their three design goals are the right acceptance criteria for any generator:
  **authentic**, **interesting** (spread of difficulty), and **well-formed** (unambiguous).
  They also classify **error types** to generate the distractor options.
- **RAVEN (Zhang et al., CVPR 2019)** and **I-RAVEN** give the cleanest formal scheme, and it
  is the one this project adopts. Five rule-governing attributes:
  - Entity-level: **Type** (shape), **Size**, **Color**
  - Layout-level: **Number**, **Position**
  - Plus two *noise* attributes (Uniformity, Orientation) that carry no rule.

  Each attribute is governed by one of four rules, applied **row-wise**:

  | Rule | Definition |
  |------|------------|
  | **Constant** | value unchanged across the row |
  | **Progression** | value increments/decrements by 1 or 2 across the row |
  | **Arithmetic** | third = first ± second (value algebra across the row) |
  | **Distribute Three** | the same three values appear in every row, permuted |

  Seven figure configurations: *Center, 2×2Grid, 3×3Grid, Left-Right, Up-Down, Out-InCenter,
  Out-InGrid*. Answer candidates are made by **modifying a rule-constrained attribute of the
  correct answer so the relation breaks**, with a check that exactly one candidate satisfies all
  constraints.

  > ⚠️ **Known flaw:** the *original* RAVEN distractor scheme was shown to be exploitable — the
  > correct answer is the attribute-wise *mode* of the candidate set, so a solver can win by
  > looking only at the options. **I-RAVEN** fixed this with an attribute-bisection tree.
  > Any generator must avoid this bias. See `docs/GENERATABILITY.md` §Distractors.

- **matRiks** (R package) — a published, documented pipeline for generating rule-based
  matrices, useful as a design reference.

### 5.2 Number series

The **Automated Number Series Item Generator (ANSIG)** and the `numGen` R package define five
**cognitive operators**, in increasing order of difficulty:

1. **AOS** — Apprehension of Succession: one coherent series, no arithmetic.
2. **PS** — Parallel Sequences: two interleaved/alternating series in one item.
3. **CF** — Cluster Formation: groups of repeated elements.
4. **NPCP** — Non-Progressive Coefficient Patterns: constant difference-of-differences.
5. **PCP** — Progressive Coefficient Patterns: the coefficient itself changes across the series.

Evaluated with Linear Logistic Test Models, **all five operators significantly predicted item
difficulty, explaining ~77% of difficulty variance** — i.e. difficulty is genuinely controllable
from the generating structure. Additional findings: geometric sequences over integers are
harder than arithmetic ones; **items requiring two arithmetic operations are markedly harder**;
difficulty tracks *the amount of information held in working memory while assembling the rule*.

### 5.3 Syllogisms

Fully enumerable and mechanically decidable. Three terms, three categorical propositions of
type **A** (all S are P), **E** (no S are P), **I** (some S are P), **O** (some S are not P).

- 4 proposition types ^ 3 propositions = **64 moods**
- × 4 **figures** (placements of the middle term) = **256 standard forms**
- Exactly **24 are classically valid** — 15 unconditionally, 9 conditionally (requiring an
  existential-import assumption).

Validity is decidable by the distribution rules (middle term distributed at least once; no term
distributed in the conclusion unless distributed in its premise; no conclusion from two negative
premises; etc.), or by Venn/Carroll diagram algorithms. **Ground truth is provable, not
assumed** — the ideal property for auto-verification.

---

## 6. Difficulty control

Across item families, difficulty is driven by the same small set of levers:

| Lever | Matrix | Series | Spatial | Memory |
|-------|--------|--------|---------|--------|
| **Number of simultaneous rules** | # attributes under a rule | # interleaved sequences | # transformations | — |
| **Rule abstractness** | Constant < Progression < Distribute3 < Arithmetic | AOS < PS < CF < NPCP < PCP | 2D < 3D rotation | — |
| **Working-memory load** | # objects per cell | span of the pattern | rotation angle | span length |
| **Distractor similarity** | how minimal the perturbation | near-miss values | mirror vs. rotation | lures |
| **Time pressure** | seconds/item | seconds/item | seconds/item | ISI |

Rotation angle matters specifically: Shepard & Metzler showed **response time is linear in
rotation angle** — a well-behaved, tunable difficulty dial.

---

## 7. Which tests can be scored without a human

Two things get conflated in the phrase "automated test": **scoring the raw response** and
**interpreting the profile**. The first is fully mechanisable for any closed-response format;
the second is clinical work and is not.

| Instrument | Raw scoring | Construct | Why a human is / isn't needed |
|------------|-------------|-----------|-------------------------------|
| Raven's SPM/APM, Raven's 2 | fully automatic | Gf | Closed-choice figural items; modern editions are IRT-scored and computer-adaptive |
| ICAR | fully automatic | Gf, Gv | Built for unproctored web administration; published item parameters |
| CFIT (Cattell) | fully automatic | Gf | Pure MCQ under a strict time limit |
| Wonderlic (WPT) | fully automatic | *g* / speed | 50 closed items in 12 minutes |
| NNAT, CogAT, OLSAT | fully automatic | Gf/Gv | Group-administered answer sheets |
| **WAIS / WISC / SB5** | **partial only** | full profile | Similarities/Vocabulary/Comprehension are *open* verbal responses scored 0/1/2 against a rubric; Block Design is physical manipulation, timed and observed |

The trade the table encodes: **full automation eliminates examiner bias, at the price of
restricting the measurable constructs to Gf, Gv, Gwm and Gs.** Verbal comprehension (Gc) — the
part that needs a rubric and a judgement — is precisely the part that cannot be automated, which
is the same boundary `GENERATABILITY.md` §2 arrives at from the generation side.

### 7.1 What makes an automated test psychometrically defensible

Three conditions, all independent of how pretty the items are:

1. **Real normative calibration.** The output must be a percentile against a representative,
   age-stratified sample — not a percentage of items correct dressed up as an IQ.
2. **IRT / Rasch item parameters.** Each item needs an estimated difficulty (and ideally
   discrimination) fitted to real response data; this is also what makes *computerised adaptive
   testing* (CAT) possible, where item selection targets the current ability estimate.
3. **Controlled administration.** Enforced time limits, and a first-exposure assumption —
   practice effects on matrices are large enough to invalidate a repeat administration.

This site satisfies **none of the three**, by construction and by admission: difficulty bands
are *designed* from published cognitive operators rather than *estimated* from response data,
and the adaptive ladder is a 3-up/2-down staircase, not an IRT ability estimator. That is why
the output is accuracy and latency, never a score. See §8 and `GENERATABILITY.md` §5.

---

## 8. Honest limitations — what a practice site can and cannot claim

This section is deliberately part of the knowledge base because it constrains the product.

- **No norms ⇒ no IQ score.** Without a representative standardisation sample, a percentile or
  "IQ 132" readout is fabricated. The site reports **accuracy, speed, and personal progress**,
  never a normed IQ.
- **Practice effects are large and real.** Repeated testing yields roughly **5–15 points** on a
  second administration, declining thereafter, and the effect is **largest for novel formats
  like matrix reasoning** — precisely what a training site drills. Clinical practice recommends
  ≥12 months between administrations of the same instrument. So: training improves *test
  performance*, and there is no good evidence it raises *g*.
- **The Flynn effect** (~3 points/decade, ~0.33/year in developed countries) means norms age;
  batteries are renormed every 15–20 years. Any fixed conversion table drifts.
- **Copyright.** Real WAIS/Raven's/CFIT items are copyrighted and often trade-secret protected.
  Reproducing them is both illegal and self-defeating (leaked items lose validity). Everything
  in this project must be **procedurally generated from scratch**.
- **Self-selected, unproctored, uncontrolled environment** — the standard critique of online
  testing, and it applies here fully.

**Design conclusion:** frame the product as *deliberate practice on reasoning task formats*,
with transparent per-format performance analytics — not as an assessment instrument.

### 8.1 What IQ tests do not measure at all

Even a perfectly administered WAIS measures the efficiency of certain reasoning and
information-processing circuits. It is not a measurement of a mind. Outside its scope:

- **Divergent creativity** — generating original ideas outside a scored frame. Convergent
  (single-answer) items are the opposite construct by design.
- **Emotional and social intelligence** — empathy, emotion regulation, reading a room,
  negotiation, stress tolerance.
- **Practical / adaptive competence** — resourcefulness, situational judgement, everyday
  problem solving. Adaptive-behaviour scales exist precisely because FSIQ does not cover this.
- **Personality and conation** — conscientiousness, curiosity, persistence, motivation. These
  predict real-world outcomes at least as strongly as *g* in many domains.

Two things follow for this site. First, this belongs **in the product copy**, not just here: the
"no score" message is incomplete without it, because a visitor's implicit question is what the
number would have meant. Second, it applies recursively — a high accuracy on this site's ten
formats is evidence about those ten formats, and nothing else.

---

## 9. Intellectual property: what is protected, what is not

The distinction that matters is between **expression** (protected) and **method** (not).

| Protected | Free to use |
|-----------|-------------|
| Trade marks: *WAIS*, *WISC*, *Stanford–Binet*, *Raven's Progressive Matrices*, *Cattell*, *Wonderlic*, *NNAT* (Pearson, Riverside, Hogrefe, ECPA…) | The underlying logical principles — "rotate 90° per column", "XOR of cells 1 and 2", arithmetic progression |
| The published item plates and figures, as drawn | Original figures you author yourself that instantiate those principles |
| Scoring keys and answer documents | Published algorithms and rule taxonomies (Hornke & Habon, RAVEN, ANSIG) |
| Normative conversion tables (raw → standard score) | Open, explicitly licensed banks such as ICAR |

Practical rules this project follows:

1. **No item is reproduced or traced.** Every stimulus is generated from the seeded rule engine;
   there is no bank on disk to have copied from.
2. **No product name is used as this site's name or as a product claim.** Naming a page
   *"Raven's Matrices Test"* or *"WAIS Online"* would be trade-mark use. Referring to a format as
   *"the kind of item used in Raven's Progressive Matrices"* is descriptive nominative use and is
   allowed — that is the register the `seenIn` strings must stay in.
3. **No normative table is used or approximated**, which is the other half of why no score is
   reported (§8).

---

## Sources

- [Types of IQ Tests: Major Instruments — Cogn-IQ](https://www.cogn-iq.org/blog/iq-test-types/)
- [IQ Test Comparison: WAIS vs Stanford-Binet vs Cattell vs Raven's — Cogn-IQ](https://www.cogn-iq.org/reference-tables/test-comparison-matrix/)
- [IQ Test Question Types — Cogn-IQ](https://www.cogn-iq.org/blog/iq-test-question-types/)
- [Types of IQ Tests — Take-IQTest.com](https://www.take-iqtest.com/types-of-iq-tests.php)
- [Mensa and Raven IQ Assessments — Psychometrica](https://psychometrica.org/articles/mensa-and-raven-iq-assessments)
- [CHC Theory: The Three-Stratum Model Behind Modern IQ Tests — Cogn-IQ](https://www.cogn-iq.org/blog/chc-theory-cognitive-ability/)
- [The Cattell-Horn-Carroll Theory of Cognitive Abilities — Flanagan, Wiley](https://onlinelibrary.wiley.com/doi/full/10.1002/9781118660584.ese0431)
- [CHC broad and narrow cognitive ability definitions (PDF) — IAP](http://www.iapsych.com/articles/chcdefs031109.pdf)
- [Wang & Su, *Automatic Generation of Raven's Progressive Matrices*, IJCAI 2015 (PDF)](https://www.ijcai.org/Proceedings/15/Papers/132.pdf)
- [Zhang et al., *RAVEN: A Dataset for Relational and Analogical Visual rEasoNing* (arXiv 1903.02741)](https://arxiv.org/pdf/1903.02741)
- [*A Review of Emerging Research Directions in Abstract Visual Reasoning* (arXiv 2202.10284)](https://arxiv.org/pdf/2202.10284)
- [*Computational Models of Solving Raven's Progressive Matrices* (arXiv 2302.04238)](https://arxiv.org/abs/2302.04238)
- [*Generation of rule-based matrices with the matRiks package* — PMC](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12891094/)
- [*Evaluating an Automated Number Series Item Generator Using LLTM* — PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC6480725/)
- [*Automatic Generation of Number Series Reasoning Items of High Difficulty* — PMC](https://ncbi.nlm.nih.gov/pmc/articles/PMC6491774)
- [Vandenberg & Kuse, *Mental Rotations, a Group Test of Three-Dimensional Spatial Visualization*](https://journals.sagepub.com/doi/abs/10.2466/pms.1978.47.2.599)
- [Mental Rotations Test — Wikipedia](https://en.wikipedia.org/wiki/Mental_Rotations_Test)
- [*Ability and sex differences in spatial thinking* — Psychonomic Bulletin & Review](https://link.springer.com/article/10.3758/s13423-017-1347-z)
- [The Mood of a Categorical Syllogism — FIU](https://faculty.fiu.edu/~harrisk/Notes/Critical%20Thinking/Categorical%20Syllogisms,%20Venn%20Diagrams%20and%20Rules%20for%20Testing.htm)
- [Classical Syllogisms — 1000-Word Philosophy](https://1000wordphilosophy.com/2022/08/28/classical-syllogisms/)
- [The Flynn Effect — ScienceDirect Topics](https://www.sciencedirect.com/topics/psychology/flynn-effect)
- [The Flynn Effect Explained — ACIS](https://acisiq.com/the-flynn-effect-explained)
- [High Stakes IQ Testing: The Flynn Effect and Its Clinical Implications — JANZSSA](https://janzssa.scholasticahq.com/article/1334-high-stakes-iq-testing-the-flynn-effect-and-its-clinical-implications)
- [How Reliable are IQ Tests? — Riot IQ](https://www.riotiq.com/articles/accuracy-reliability-and-criticism/how-reliable-are-iq-tests)
- [International Cognitive Ability Resource (ICAR) — project site](https://icar-project.com/)
- [Condon & Revelle, *The International Cognitive Ability Resource: Development and initial validation of a public-domain measure*, Intelligence 2014](https://www.sciencedirect.com/science/article/pii/S0160289614000178)
- [jsPsych — browser framework for behavioural experiments](https://www.jspsych.org/)
- [PsychoJS / PsychoPy — online cognitive task deployment](https://psychopy.github.io/psychojs/)
- [Mega Society — Wikipedia (Hoeflin, Mega/Titan tests)](https://en.wikipedia.org/wiki/Mega_Society)
- [Prometheus Society — Wikipedia](https://en.wikipedia.org/wiki/Prometheus_Society)
- [Paul Cooijmans, *On the norming of high-range tests*](https://iq-tests-for-the-high-range.com/)
- [Computerized adaptive testing — Wikipedia (IRT-driven item selection)](https://en.wikipedia.org/wiki/Computerized_adaptive_testing)
- [Sternberg, *The Theory of Successful Intelligence* (practical/creative intelligence beyond g)](https://psycnet.apa.org/record/1999-05780-002)
- [Duckworth et al., *Grit: Perseverance and passion for long-term goals*, JPSP 2007](https://psycnet.apa.org/record/2007-07951-009)
- [Trademark nominative fair use — Wikipedia](https://en.wikipedia.org/wiki/Nominative_use)
