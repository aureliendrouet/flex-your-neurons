# Design plan — UX first, appearance as a consequence

Status: **plan only, nothing implemented.** Written 2026-08-08.
Supersedes the earlier `DESIGN-2026-08.md` and `DESIGN-IDEAS.md` drafts, which are folded in
here: the reverse-engineered CSS techniques survive as Appendix A, the strategic argument as §1.

---

## 1. The thesis

The request that started this was "modernize the appearance — more vibrant and appealing", with
<https://kuragestudios.github.io/> as the reference. That site's neon-arcade grammar is excellent
*for an arcade game studio* — form matching content exactly. Transplanted here it says nothing,
because this is a psychometric training tool, and a shimmering gradient ring around a
"we report no IQ score" disclaimer reads as marketing, not craft.

So the plan inverts the usual order. **Every phase below is justified by a user outcome, and the
visual treatment is whatever serves that outcome.** That is not a retreat from making the site
look good — it is the only way it will. This site's aesthetic advantage is that it owns a
generative figure engine (`src/lib/geometry.ts`, `rules.ts`, `rng.ts`) that no competitor has.
Ornament drawn *by that engine* is both more beautiful and more meaningful than any gradient,
and it cannot be copied.

One more thing appearance genuinely does here, and it is a UX function: this site makes a
credibility claim ("generated, verified, honestly caveated"). A dated interface undercuts that
claim before a word is read. Looking current is load-bearing, which is why the visual foundation
lands at Phase 3 rather than last.

---

## 2. UX audit — what's actually weak today

Grounded in the code, not assumed.

| # | Finding | Evidence | Severity |
|---|---|---|---|
| 1 | **The teaching moment is wasted.** An eight-value error taxonomy (`wrong-rule`, `wrong-axis`, `off-by-one`, `copy`, `wrong-attribute`, `mirror`, `plausible`) is computed for every distractor and stored per item — and rendered **nowhere**. The user sees green/red plus a generic rule list. | `types.ts:129`; `errorTypes` has zero references in `src/components`, `src/pages`, `src/lib/i18n` | **High** |
| 2 | **Choosing a format is guesswork.** The ten home-page cards carry an emoji glyph and a sentence. You cannot tell what a "paper folding" item looks like without committing to one. | `types.ts:196` `ItemTypeMeta.icon`; `[lang]/index.astro:52` | **High** |
| 3 | **The return-visit page is undesigned.** Progress is the only page holding the user's *own* data — the reason to come back — and it is tables. No error-type breakdown, no speed/accuracy view. | `ProgressDashboard.tsx`, `table.data` | Medium |
| 4 | **Timed formats fight the interface.** Speeded tasks (symbol search, digit span, the test) run inside full site chrome; a numeric countdown races the user and confounds what is being measured. | `Presentation` in `types.ts:161`; `Quiz.tsx` timing paths | Medium |
| 5 | **Seed sharing is invisible.** Replaying an exact item in either language is the single most distinctive capability, and it surfaces as a URL parameter. | README "Data"; `?seed=` handling | Medium |
| 6 | **Styling can't express interaction.** ~174 inline `style=` attributes across pages and components. Hover states, focus states and pseudo-elements are *impossible* to write inline — the exact vocabulary any redesign needs. | 18 in `Base.astro`, 30 in `Quiz.tsx`, 25 in `StimulusView.tsx` | Medium (blocker) |
| 7 | Empty states are bare; the progress page before first use is an empty table. | `ProgressDashboard.tsx` | Low |

**Not a finding — verified good, leave alone:** keyboard input is already properly built (number
keys select, Enter/Space advances, listener registered once through a ref so no keystroke is lost
between renders, `Quiz.tsx:250-280`); colour-blind safety is deliberate and correct (figures are
`currentColor` + an opacity ramp, never hue); the token architecture is sound (light-first `:root`,
dark override under both `prefers-color-scheme` and `[data-theme]`); reduced-motion is already
handled globally.

---

## 3. Hard constraints

Any phase violating one of these is wrong, however good it looks.

1. **No hue inside a figure.** Ever. Colour-blind solvability depends on it (`global.css:5-9`).
   All colour lives in chrome.
2. **No motion near a live stimulus**, and none at all on speeded formats — it changes what is
   being measured. This is a validity constraint, not a taste one.
3. **No translucency over a figure.** Glassmorphism shifts effective contrast; same problem.
4. **Static, offline, zero network.** No CDN, no runtime fetch. (Astro's Fonts API self-hosts and
   subsets at build time, so this no longer forces system fonts — see §4.3.)
5. **The tests are the contract.** `e2e/rendering.spec.ts` exists because camelCased SVG
   attributes silently broke every figure; `data-testid` hooks (`nav-*`, `lang-*`, `cta-*`,
   `type-card-*`, `feedback`, `quiz-loading`) must survive. `npm run test:all` green after each
   phase.
6. **Both locales, always.** Every string added needs `en.ts` and `fr.ts`; a missing key is a
   compile error and a copied-across string fails a unit test.
7. **Never imply a score.** No number that could be mistaken for an IQ, no count-up odometer
   animation implying precision the data doesn't have.

---

## 4. The phases

Ordered by user value per unit of cost. Each is independently shippable and revertable.

### Phase 1 — Name the mistake *(fixes audit #1)*

The highest-value change on the list, and it needs no CSS refactor and no new dependency.

- Surface `Item.errorTypes[chosen]` on the feedback panel as a **named diagnosis**: "Right rule —
  read down the column instead of across the row", not a red border. Eight strings × two locales.
- Reorder the panel around it: diagnosis first, then the rule list, then the correct answer. The
  user's own mistake is what they came to understand.
- Tag the other distractors on the revealed state too, so the option grid becomes a map of the
  ways this item can be misread.
- Accumulate error types into the session summary: *"most of your errors this session were
  wrong-axis"* — a real, actionable finding about how someone reads a matrix.

Visual treatment: semantic colour only (the existing `--correct` / `--wrong` families), a
one-shot 320ms reveal, and a monospace tag chip. **No spectrum gradient anywhere near feedback** —
decorative colour next to the correct/wrong channel would be read as an answer signal.

*Cost: low. Payoff: turns a verdict into a diagnosis — the best single reason to use this site.*

### Phase 2 — Show the item before it's chosen *(fixes audit #2, #5)*

- Replace the emoji on each format card with a **real generated miniature** of that format at a
  pinned seed, rendered at build time by the actual generator. More informative *and* more
  attractive; the artwork and the product are the same thing.
- Same treatment on the practice index and as the per-format identity everywhere.
- Promote the **seed to a designed object**: a monospace chip with a copy affordance, on both the
  item and result screens, with a one-line explanation of what sharing it does.
- Build-time OG images per format, then per seed, so a shared `?seed=` link previews the actual
  item. Pure build script emitting SVG — no runtime cost.

*Cost: medium (one `scripts/` build step). Risk: low — touches no item rendering.*

### Phase 3 — The substrate, and the first visible refresh *(fixes audit #6)*

Two things at once: the invisible refactor, and the typography/colour foundation that makes the
site read as current.

- **De-inline.** Move the ~174 `style=` attributes into named classes in `global.css`
  (`.site-header`, `.nav-link`, `.page-head`, `.type-card`, `.quiz-*`, `.stat`). Zero visual
  change; `test:all` must be byte-identical in behaviour. This unblocks every hover, focus and
  pseudo-element below.
- **Tokens in OKLCH.** Rebuild the palette in OKLCH so "same lightness, different hue" is actually
  true — required for the ten-format hue set in Phase 4 without one member vibrating. Keep the
  existing indigo as the anchor so identity is continuous. Add motion tokens (`--ease-out`,
  `--dur-fast/-/-slow`) so timings stop being ad-hoc.
- **Type with a spine.** Astro's Fonts API is stable in this version
  (`node_modules/astro/components/Font.astro`) — it downloads, subsets and self-hosts at build
  time, so the offline constraint no longer forces system Inter. Three roles: a display face with
  character, a neutral text face, and a **real mono** — the mono is the site's data voice (seeds,
  latencies, option keys) and is currently a system-stack afterthought. Budget ≤60KB, Latin +
  French accents, two weights each, preload display only.

*This is the phase where the site starts looking different, and it does so through type and
colour rather than effects — which ages better.*

### Phase 4 — First impression *(the home page)*

Now the visual layer, on the one page whose job is comprehension and trust.

- **A live hero.** A genuine solvable 3×3 matrix at a fixed seed, low-contrast behind the H1,
  cells resolving in sequence on load. The page demonstrates the product instead of describing it.
- **Ten formats, ten identities.** A stable hue per `ItemTypeId` (hashed, distributed in OKLCH at
  constant lightness), used for that format's card accent, practice page, progress row and OG
  image. Chrome only; stimulus stays grey.
- **Chrome.** Sticky header with `backdrop-filter` (`@supports`-guarded, opaque fallback), a
  gradient underline fading out at both ends that intensifies once scrolled, a wordmark that
  shimmers once on load and then settles. Card hover: lift, shadow, and the mask-composite
  gradient ring from Appendix A — animated **only while hovered**, so ten cards aren't burning
  battery at rest, and mirrored onto `:focus-visible` so keyboard users get the same affordance.
- Keep `:focus-visible` a solid 2px outline. Focus must be unmistakable; it is not a place for
  gradients.

### Phase 5 — Get out of the way *(fixes audit #4)*

The boldest move available, and it follows from the constraints rather than fighting them.

- **Focus mode.** While an item is live, chrome recedes: header desaturates to a hairline,
  background flattens, ornament fades, the stimulus is the only lit thing on screen. On reveal,
  the interface returns. An instrument that visibly quiets itself while measuring is more
  distinctive than one that gets louder — and here it is also more valid.
- **Replace the countdown number with a hairline.** A 1px rule quietly retracting across the top
  of the stimulus carries the same information at a fraction of the salience. A ticking digit is
  an anxiety generator and, on speeded formats, an active confound.
- Audit the speeded paths explicitly: symbol search and digit span must render with **zero**
  animation on or near the stimulus.

### Phase 6 — Make progress worth returning to *(fixes audit #3, #7)*

Data as the decoration — real data is more interesting than any gradient.

- A CHC profile across Gf/Gv/Gwm/Gs; accuracy against latency to expose the speed/accuracy
  trade-off; a per-format sparkline wall; and the **error-type breakdown** fed by Phase 1.
- Tabular numerals throughout, fixed decimals, no jitter on update, **no count-up animations**.
- A designed empty state — for a new user this page is the invitation, not a void.
- Build with the `dataviz` skill loaded; palette and mark specs are its job. Profiles and trends
  only — never a single composite number.

### Phase 7 — Motion that means something

Last, because it is the most expensive and the least essential.

- **View transitions.** `ClientRouter.astro` is already in `node_modules`. Share a
  `view-transition-name` between a card's miniature and the practice stimulus so the card *morphs*
  into the question; likewise option → explanation. ~10 lines, graceful fallback. Exclude anything
  measuring latency, and verify in-flight quiz state and timers survive navigation.
- **Diagnostic animations** — the expensive half of Phase 1. `wrong-axis` sweeps the rule down the
  column then across the row; `off-by-one` steps too far and snaps back; `mirror` flips; `copy`
  slides the duplicated cell in. The one place animation is genuinely the explanation.
- **Scrollytelling the proof** on the About page: "`2, 4, 8, ?` can never be emitted — ×2 predicts
  16 and a growing gap predicts 14" is the most persuasive sentence in the README and it is
  currently a paragraph. Scroll-driven CSS (`animation-timeline: view()`, ~84% support, all
  `@supports`-guarded, no JS).
- **Discoverability polish** for the keyboard support that already exists: real keycap styling on
  `.option-key`, and a `?` shortcuts sheet. The feature works; nobody is told about it.

---

## 5. Rejected, and why

| Idea | Why not |
|---|---|
| Permanent neon glow, scanlines, glitch, pixel fonts | Arcade grammar; actively undermines a psychometrics tool |
| Glassmorphism near a stimulus | Translucency changes effective contrast — a measurement confound |
| Parallax / scroll effects on item pages | Motion beside a timed task corrupts the measurement |
| Count-up odometers on results | Implies precision the data doesn't have, on a site built on not overclaiming |
| AI-blob mesh gradients | The 2024 default; dated, and says nothing about this site |
| Gradient on `h1` or body text | Readability tax on the pages that most need reading |
| Any hue inside a figure | Breaks colour-blind solvability — the one inviolable rule |
| Ambient shimmer on the About/Terms pages | A disclaimer wrapped in gradient reads as marketing. Restraint there *is* the design |

---

## 6. Risks

- **`mask-composite`**: ship `-webkit-mask-composite: xor` and `mask-composite: exclude`. Degrades
  to lift-and-shadow, which is fine.
- **`backdrop-filter`** on a sticky header is a compositing cost on low-end Android —
  `@supports`-guard it, opaque fallback.
- **Battery**: rings animate only while hovered; `will-change` only during interaction.
- **Reduced motion**: the global block neutralises durations, but decorative elements should
  *disappear*, not merely run fast. Add explicit rules per effect.
- **Colour-blind**: one deuteranopia-simulator pass over practice and results, confirming
  correct/wrong still reads from position and text, never hue alone.
- **i18n**: Phase 1 and Phase 7 both add substantial French copy. The error-type strings need real
  translation, not glossing — the same trap the syllogism premises hit.
- **Scope**: Phase 7's diagnostic animations are ten formats × eight error types × two locales.
  Ship the Phase 1 tags first and decide from real use whether the animations earn their cost.

---

## 7. Done looks like

- Getting an item wrong tells you **which** mistake you made, by name.
- You can see what a format looks like before choosing it.
- The interface gets out of the way while you're being timed, and comes back after.
- The progress page is worth opening for its own sake.
- The home page demonstrates the generator instead of describing it.
- Every figure, matrix cell and option stimulus renders exactly as it does today.
- `npm run test:all` passes; `package.json` gains no dependency.

---

## Appendix A — techniques reverse-engineered from the reference

Read from `kuragestudios.github.io/assets/css/style.css`. Used in Phase 4, in moderation.

**Animated gradient ring** — the effect the request asked about. A pseudo-element fills the
padding box with a gradient and masks out the content box, leaving only the ring:

```css
.card--interactive::after {
  content: ''; position: absolute; inset: 0;
  border-radius: calc(var(--radius-lg) - 1px);
  padding: 1.5px;                                   /* = ring thickness */
  background: var(--gradient-accent);
  background-size: 200% auto;
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  mask-composite: exclude;
  opacity: 0; transition: opacity var(--dur) var(--ease-out);
  animation: shimmer 4s linear infinite paused;     /* runs only on hover */
  pointer-events: none;
}
.card--interactive:hover, .card--interactive:focus-visible { border-color: transparent; }
.card--interactive:hover::after, .card--interactive:focus-visible::after {
  opacity: 1; animation-play-state: running;
}
@keyframes shimmer { to { background-position: -200% center } }
```

Two details easy to miss: the base border must go `transparent` on hover or two lines stack, and
the ring's radius is 1px inside the card's.

**Top-bar underline** — a 2px gradient rule fading to transparent at both ends, which is what
makes it read as a horizon rather than a divider:

```css
.site-header::after {
  content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 2px;
  background: linear-gradient(90deg, transparent 8%, var(--spectrum-1) 35%,
                                     var(--spectrum-2) 65%, transparent 92%);
  opacity: .5; transition: opacity var(--dur) var(--ease-out);
}
[data-scrolled] .site-header::after { opacity: 1; }
```

The reference pulses this forever on a 4s loop; here it earns its life from the scroll state
instead — same vitality, no permanent animation. Toggle `data-scrolled` with an
IntersectionObserver on a sentinel element, not a scroll listener.

**Gradient text** — `background-clip: text` + `-webkit-text-fill-color: transparent`, lifted with
`filter: drop-shadow()`. Use `drop-shadow`, not `text-shadow`: the latter paints behind the
clipped gradient and muddies it. Wordmark only, one cycle on load.

Sources for the 2026 CSS baseline claims:
[scroll-driven animations](https://cssawwwards.com/blog/css-scroll-driven-animations-guide-2026),
[what's new in CSS 2026](https://modern-css.com/whats-new-in-css-2026/),
[CSS features replacing JS](https://locallylost.com/guides/css-innovations-2026-features-that-replace-javascript/).
