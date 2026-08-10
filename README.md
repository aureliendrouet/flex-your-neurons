# Flex Your Neurons — training on reasoning-test item formats

*Muscle Tes Neurones* in French. The name is translated per locale, title-cased in both; the URL
slug stays English.

A static site for practising the item formats used in IQ and aptitude tests, **in English and
French**. Every item is **generated from a seed**, **proved to have exactly one defensible
answer**, and **explained afterwards**. It runs entirely in the browser, stores everything in
localStorage, and deploys to GitHub Pages.

It deliberately reports **no IQ score**. See [Why there is no score](#why-there-is-no-score).

---

## Quick start

```bash
npm install
npm run dev            # http://localhost:4321/flex-your-neurons/ — redirects to /flex-your-neurons/en/ or /flex-your-neurons/fr/

npm test               # unit tests (generators, solvers, rng, geometry)
npm run build          # static output in dist/
npm run test:e2e       # Playwright, against the built site
npm run test:all       # everything, in the order CI runs it
```

Node 22.12+ is required (Astro 7).

## What is in here

| Path | What it is |
|------|------------|
| `docs/IQ-TESTS.md` | Research notes: test families, CHC theory, item formats, the automatic-item-generation literature, which tests can be machine-scored at all, high-range tests and the ceiling problem, the IP boundary, and the limits of online testing |
| `docs/GENERATABILITY.md` | Which formats can be generated *and* verified by a program, which cannot, and why |
| `docs/LIBRARIES.md` | Every dependency, verified against the npm registry, plus what was rejected |
| `docs/PLAN-2026-08.md` | Open work: a terms-of-use page, two chronometry defects, and the content the research now supports |
| `src/lib/generators/` | One generator per item format |
| `src/lib/solvers/` | Independent solvers used to prove items unambiguous |
| `src/lib/rules.ts` | The RAVEN rule algebra (Constant, Progression, Arithmetic, Distribute-Three) |
| `src/lib/i18n/` | Locale plumbing and the English/French dictionaries |
| `src/lib/charts.ts` | Data shaping for the progress charts, kept separate so it is testable without a browser |
| `docs/PLAN-2026-08.md` | The work plan this repository last executed, with its outcome recorded at the top |
| `tests/` | Property-style unit tests, swept over hundreds of seeds |
| `e2e/` | Playwright tests against the built static site |

## The seventeen formats

| Format | CHC | Verification |
|--------|-----|--------------|
| Matrix reasoning | Gf | Independent solver over the rule space + leakage-balanced options |
| Number series | Gf | Independent sequence solver; ambiguous sequences are regenerated |
| Letter series | Gf | Same solver, over alphabet positions |
| Odd one out | Gf | Every figure checked; exactly one may be defensibly odd |
| Figural analogy | Gf | Every transformation must be visible in *both* pairs |
| Syllogisms | Gf | Exhaustive model checking over all 256 models — provable |
| Mental rotation | Gv | Chirality proved; exactly one option is a rotation |
| Paper folding | Gv | The unfolding is simulated, not asserted |
| Figure weights | Gf | Every candidate group weighed; exactly one may balance — decidable |
| Digit span | Gwm | Exact string match, whitespace-insensitive |
| N-back | Gwm | Match count re-derived from the finished stream |
| Head count | Gwm | Total re-accumulated from the script; the room may never empty |
| Symbol search | Gs | Membership re-checked after shuffling |
| Digit–symbol coding | Gs | Every option is a key entry; the pairing is re-looked-up |
| Trail making | Gs | Targets proved non-overlapping and inside the board; the order is printed on them |
| Count, don’t read (Stroop) | Gs | The keyed answer is the array length the renderer draws; both congruency conditions occur |
| Mental arithmetic | Gq | The displayed expression is re-evaluated; two options share the answer's units digit |

## The three modes

| Mode | Ends when | Scored on | Difficulty |
|------|-----------|-----------|------------|
| Practice | a set number of items | accuracy, with an explanation after each answer | adapts as you go |
| Full test | every format has been seen twice | accuracy by format, no feedback until the end | adapts as you go |
| Sprint | the clock runs out | correct answers per minute | pinned for the whole block |

A sprint is the continuous timed block: one format, a fixed window, items back to back with no
explanation until the end. Only formats whose items are answerable in a couple of seconds opt in
(`meta.sprintable`), and a format that plays a sequence before it can be answered can never opt in.

Sprint results are kept strictly apart from the practice and test statistics. A sprint's latencies
measure how fast you *chose* to go and its accuracy is pushed down by the clock, so pooling the two
would have moved every per-format median the first time anyone sprinted without saying so.

### The one measurement that is a difference

Every other figure this site reports is a tally — how many right, how fast, how often. The
interference score is a contrast: incongruent trials minus congruent ones on the counting-Stroop
format. Neither half means much alone, but everything about the two conditions is identical except
the conflict, so the gap is a property of inhibition specifically.

It also came for free. Congruency was never stored on a response; it is a property of the item, and
every item regenerates exactly from its seed — so the partition is re-derived when the page is read,
out of history written before the read-out existed.

## How an item is made safe

Three guards, described in full in [`docs/GENERATABILITY.md`](docs/GENERATABILITY.md) §4:

1. **A separate solver must agree.** It re-derives the rule from what is visible and lists
   every rule that fits. Two fitting rules that disagree ⇒ the item is thrown away. This is
   why `2, 4, 8, ?` can never be emitted: ×2 predicts 16 and a growing gap predicts 14.
2. **The options must not leak the answer.** Matrix options form an attribute-balanced cube,
   so no single-attribute statistic identifies the answer — the flaw I-RAVEN found in RAVEN.
   A test plays that exact shortcut and asserts it scores at chance.
3. **Wrong answers must be wrong for a nameable reason** (rule applied down the columns,
   off by one step, a cell copied), so the explanation can diagnose the mistake.

## Why there is no score

A real IQ score is a comparison against a representative, age-matched standardisation sample
under standardised administration. No website has that. Reporting "IQ 132" after ten questions
would be a fabrication.

Also worth knowing, and stated in the app itself:

- **Practice effects are large** — 5–15 points on a second administration, largest for novel
  formats like matrix reasoning, which is exactly what this site drills. Training improves
  test performance; there is no good evidence it raises *g*.
- **Norms drift** (the Flynn effect, ~3 points/decade), which is why batteries are renormed
  every 15–20 years.
- **No verbal comprehension.** Verbal analogies and vocabulary cannot be procedurally
  generated with verifiable answers — their correctness lives in facts about a language, not
  in the generator. So Gc is untrained here, and a Full Scale IQ is not even approximable.
- **Difficulty is designed, not calibrated.** The five bands follow published cognitive
  operators, which is a defensible ordering — but no item has an IRT difficulty parameter fitted
  to real response data, so the adaptive ladder is a staircase, not an ability estimate.
- **Even a real IQ test leaves most of the mind unmeasured** — divergent creativity, emotional
  and social intelligence, practical judgement, and conscientiousness are all outside it.
- **Nothing is copied** from any published test. Item *formats* are described in the open
  literature; the items themselves are all generated. Test names are used descriptively
  ("the format used in Raven's Progressive Matrices"), never as a product claim.

## Languages

The site is available in **English (`/en/…`)** and **French (`/fr/…`)**. The root URL picks a
language from a previously stored choice, then `navigator.languages`, then English; a
`<noscript>` meta-refresh and visible links cover the case where that script never runs. Every
page carries a language switcher that keeps you on the same page.

Everything is translated: the interface, the page copy, and the generated items themselves —
prompts, rule explanations, and the syllogism premises, which need French grammar the English
templates cannot express ("Aucun Blick n'est un Zorn" needs a singular where "No Blicks are
Zorns" does not).

**Locale never touches the RNG.** A seed identifies an item; the language only decides how it
is described. Two people opening the same `?seed=` link get byte-identical figures, the same
options in the same order, and the same correct index, whichever language they read in. Both
`tests/i18n.test.ts` and `e2e/i18n.spec.ts` assert this directly.

Adding a language means adding one file next to `src/lib/i18n/fr.ts` and listing it in
`LOCALES`. `Dict` is inferred from the English dictionary with `typeof`, so **a missing key is
a compile error**, and a unit test additionally fails on any string that was copied across
untranslated. No i18n library is used; the reasoning is in
[`docs/LIBRARIES.md`](docs/LIBRARIES.md).

## Progress tracking

The progress page reports accuracy, median response time, streaks and per-type breakdowns,
plus charts of how those move over time: accuracy per session with a three-session rolling
average, median time per correct answer, an eight-week activity chart, and a trend
sparkline per item type. All hand-written SVG, themed, translated, and readable by
Playwright — see the note on charting libraries in [`docs/LIBRARIES.md`](docs/LIBRARIES.md).

Timing uses `performance.now()`, not `Date.now()`: wall-clock time jumps when the OS
adjusts it, which would write nonsense latencies into permanent history. The clock starts
when the item is painted — and for digit span, when playback ends, so the animation is not
counted as thinking time.

## Accessibility

Figures never encode information in hue. Shading levels are told apart by **texture** —
hollow, dots, hatch, cross-hatch, dense hatch, solid — each with its own background wash,
so two redundant cues carry the same information and neither depends on fine contrast
discrimination. Size levels follow a geometric ramp with a per-layout floor, so nothing is
ever drawn too small to judge. The densest layout drops the size rule entirely rather than
asking readers to compare shapes a few pixels apart.

Everything is operable from the keyboard, every option carries a text label, and both
themes are covered by tests.

## Data

Everything lives in `localStorage` under `iq:v1:*`. There is no server and no network request.
Sessions store `(type, seed, difficulty, response, latency)` — never the items — because a seed
regenerates its item exactly. A full history is a few kilobytes, and can be exported, imported,
or deleted from the progress page.

Adding `?seed=ABC12345&d=3&n=10` to a practice or test URL replays an exact run — two people
opening the same link get byte-identical items, in either language.

## Deployment

`.github/workflows/deploy.yml` type-checks, runs the unit tests, builds, runs the Playwright
suite, and publishes `dist/` to GitHub Pages on every push to `main`.

The site URL and base path are derived from the repository, so a fork deploys to its own URL
with no code change. Locally they default to `/iq`; override with `SITE_URL` and `BASE_PATH`.

Enable Pages once, under **Settings → Pages → Source → GitHub Actions**.

## Testing notes

- Unit tests are **property-style**: each generator is swept over hundreds of seeds at every
  difficulty, asserting reproducibility, distinct options, a single correct key, no positional
  tell, and no distractor leakage. A generator is only as good as its worst seed.
- `tests/i18n.test.ts` checks the dictionaries have identical structure, that no string was
  left in English, and — the important one — that a seed yields a structurally identical item
  in every locale.
- E2E tests **import the generators in Node** to work out what the browser should be showing
  for a pinned seed, then assert against the rendered page. That makes them real end-to-end
  checks rather than "click something and hope".
- `e2e/rendering.spec.ts` exists because of a bug the other layers structurally could not
  catch: SVG presentation attributes were being emitted in camelCase, which browsers ignore,
  so every figure painted fully opaque and the shading attribute was invisible. Unit tests
  assert on data, not pixels; the other E2E tests compute the answer and click it, so they
  never needed the item to be *legible*. Those tests are verified to fail on the old code.
- Playwright runs against the built static site via `scripts/serve-static.mjs`, which mimics
  how GitHub Pages serves files. `astro preview` is not used: in Astro 7 it always detaches
  into a background daemon, which Playwright's `webServer` cannot manage.
- The E2E server uses port **4331**, not Astro's default 4321, and never reuses an existing
  server. A stray `astro dev` on 4321 was once picked up as the "existing server", so the
  suite quietly ran against the dev server instead of `dist` — and passed, while testing an
  artefact nobody was going to deploy.

## Licence

MIT.
