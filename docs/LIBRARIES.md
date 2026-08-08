# Library Research & Verification

Every package below was checked against the live npm registry on **2026-08-08**
(`npm view <pkg> version license time`), and the load-bearing ones were additionally
**executed** to confirm their API, not just their existence.

---

## 1. The headline finding: no item-generation library exists for JS

I searched npm for `raven progressive matrices`, `iq test generator`, `syllogism`,
`matrix reasoning`, `number series generator`, `mental rotation`, and `cognitive test`.

**Result: zero relevant packages.** Every hit was a false positive — `nest-raven` (Sentry),
`matrix-js-sdk` (the chat protocol), `@syntax-syllogism/*` (a Salesforce CLI vendor),
`winston-daily-rotate-file`, and so on. There is no JavaScript implementation of Raven-style
matrix generation, number-series item models, or syllogism enumeration.

To be precise about the scope of that claim: **no JS package generates cognitive-test items.**
JS *does* have mature packages for the surrounding problem — administering a cognitive task in a
browser with millisecond chronometry (`jspsych`, `psychojs`) — and there is one open, calibrated
**item bank** (ICAR). Neither generates items; both are evaluated in §3.

The published prior art lives in other ecosystems:

| Tool | Language | What it does | Reusable here? |
|------|----------|--------------|----------------|
| `matRiks` | R | Rule-based Raven-like matrix generation | ❌ No JS port; used as a **design reference** |
| `numGen` | R | ANSIG number-series item models | ❌ Design reference only |
| RAVEN / I-RAVEN generator | Python | Dataset generation for ML benchmarks | ❌ Design reference only |
| ICAR item bank | — (item content) | Public-domain, IRT-calibrated cognitive items | ❌ Fixed bank, partly leaked — see §3 and `GENERATABILITY.md` §6.1 |

**Consequence:** the generators are implemented from scratch in TypeScript in
`src/lib/generators/`, following the published algorithms documented in
[`IQ-TESTS.md`](./IQ-TESTS.md) §5. Libraries are used for *infrastructure* — randomness,
rendering, state, testing — not for domain logic. This is a finding, not a shortcut: there was
nothing to reuse.

---

## 2. Verified dependencies

### Core framework

| Package | Version | License | Last publish | Role |
|---------|---------|---------|--------------|------|
| `astro` | 7.2.0 | MIT | 2026-08-07 | Static site generator; `output: 'static'` → GitHub Pages |
| `@astrojs/preact` | 6.0.2 | MIT | 2026-07-28 | Island hydration for interactive quiz components |
| `preact` | 10.29.8 | MIT | 2026-08-01 | 3 kB React-compatible VDOM — the interactive layer |
| `@astrojs/sitemap` | 3.7.3 | MIT | recent | Sitemap generation |

`astro@7` declares `engines: { node: ">=22.12.0" }`. Local Node is **v26.4.0** ✅.

### Randomness — the load-bearing dependency

| Package | Version | License | Last publish |
|---------|---------|---------|--------------|
| `pure-rand` | 8.4.2 | MIT | 2026-07-10 |

Chosen over `seedrandom@3.0.5` (last published **2022-06-26**, unmaintained, no bundled types).
`pure-rand` is the PRNG behind `fast-check`, ships TypeScript types, and implements
xoroshiro128+.

**Determinism is the core correctness property of this app** — a seed must reproduce the exact
same item, forever, so that a shared "seed 8F3K2" is the same test for two people and a saved
result can be replayed. So I executed it rather than trusting the README:

```
run A: 5,5,5,0,4,4,2,7
run B: 5,5,5,0,4,4,2,7
deterministic within process: true
--- second process:
run A: 5,5,5,0,4,4,2,7     ← identical across processes ✅
```

**⚠️ Two verified API gotchas in v8** that the docs do not lead with:

1. **There is no root export.** `import ... from 'pure-rand'` throws
   `ERR_PACKAGE_PATH_NOT_EXPORTED`. Only deep subpaths are exported:
   ```ts
   import { xoroshiro128plus } from 'pure-rand/generator/xoroshiro128plus';
   import { uniformInt } from 'pure-rand/distribution/uniformInt';
   ```
   (Note `xoroshiro128plus`, not `xoroshiro` — the shorter path is not exported either.)

2. **The generator is now mutable, and argument order changed.** v6/v7's pure tuple API
   (`uniformIntDistribution(from, to, rng) => [value, nextRng]`) is gone. v8 is:
   ```ts
   uniformInt(rng, from, to) // => number, and mutates rng
   ```

Both are wrapped once in `src/lib/rng.ts` so the rest of the codebase never touches them
directly and a future swap is a one-file change.

### State & persistence

| Package | Version | License | Last publish | Role |
|---------|---------|---------|--------------|------|
| `nanostores` | 1.4.2 | MIT | 2026-07-29 | 340-byte atomic store — right size for an island architecture |
| `@nanostores/persistent` | 1.3.5 | MIT | 2026-07-20 | localStorage-backed stores, cross-tab sync via the `storage` event |
| `@nanostores/preact` | 1.1.0 | MIT | recent | `useStore` hook |

Chosen over Redux/Zustand because Astro islands are **separate Preact roots** — a React context
provider cannot span them. Nanostores are module-level singletons, so independent islands
(header streak counter, quiz body, results panel) share state without a common ancestor. This
is the specific reason it's the recommended pairing for Astro.

### Styling

| Package | Version | License | Last publish |
|---------|---------|---------|--------------|
| `tailwindcss` | 4.3.3 | MIT | 2026-08-07 |
| `@tailwindcss/vite` | 4.3.3 | MIT | 2026-08-07 |

Tailwind v4 uses the Vite plugin + CSS-first `@theme` config (no `tailwind.config.js`,
no `@astrojs/tailwind` integration — that package is deprecated for v4).

### Internationalisation — deliberately none

The site is bilingual (English / French), and no i18n library is used. Candidates checked
on the registry (2026-08-08):

| Package | Version | Last publish | Verdict |
|---------|---------|--------------|---------|
| `i18next` | 26.3.6 | 2026-07-09 | Actively maintained, but built for runtime message loading, interpolation and plural rules — none of which a two-locale static site needs |
| `@inlang/paraglide-js` | 2.23.2 | 2026-08-06 | The strongest option: compiles messages to tree-shakeable functions. Rejected only because it adds a build step and a message-file format for a job the type system already does |
| `astro-i18next` | 1.0.0-beta.21 | **2023-03-09** | Abandoned in beta, three years stale |
| `astro-i18n` | 2.2.4 | 2024-01-23 | Unmaintained since early 2024 |

What replaces them is ~20 lines in `src/lib/i18n/index.ts` plus two plain TypeScript
objects. `Dict` is inferred from the English dictionary with `typeof`, so **a missing or
misspelled French key is a compile error** — stronger than the runtime `missingKey`
handler an i18n library would give, and with no bundle cost.

The dictionaries hold **functions, not format strings**, wherever grammar depends on a
value. That is the part a template-interpolation library handles badly: French needs
agreement in number, elision, and a singular form for "Aucun X n'est un Y" where English
says "No Xs are Ys". Those decisions belong in the locale file, not at the call site.

Routing is Astro's own `[lang]` dynamic route with `getStaticPaths`, which emits
`/en/…` and `/fr/…` as real static files — no integration required.

### Testing

| Package | Version | License | Last publish | Role |
|---------|---------|---------|--------------|------|
| `vitest` | 4.1.10 | MIT | 2026-07-24 | Unit tests for generators (property-style: generate N items, assert well-formedness) |
| `@playwright/test` | 1.62.1 | Apache-2.0 | 2026-08-07 | End-to-end tests against the built static site |

### TypeScript

| Package | Version | License |
|---------|---------|---------|
| `typescript` | **6.0.3** (pinned) | Apache-2.0 |

**Not `7.0.2`** (the current `latest`). Verified constraint: `@astrojs/check@0.9.10` declares
`peerDependencies: { typescript: "^5.0.0 || ^6.0.0" }`. Installing TS 7 breaks the type-check
step, so the project pins `^6.0.0`.

---

## 3. Evaluated and rejected

| Candidate | Version exists | Why not used |
|-----------|----------------|--------------|
| `seedrandom` | 3.0.5 ✅ | Unmaintained since 2022-06; no bundled types; `pure-rand` is strictly better |
| `chart.js` | 4.5.1 ✅ | Canvas-based, ~70 kB for a handful of small progress charts; canvas is also opaque to Playwright assertions |
| `uplot` | 1.6.32 ✅ | Excellent and tiny, but last publish 2025-03-14 and it is time-series-oriented; overkill for bar/spark charts |
| `d3-shape` | 3.2.0 ✅ | Only the path generators were wanted; the arcs/lines needed here are ~20 lines of hand-written SVG |
| `three` | ✅ | Considered for 3-D mental rotation. Rejected: ~600 kB and a WebGL canvas that E2E tests cannot introspect. Replaced by a hand-written isometric projection to SVG (~60 lines) — deterministic, inspectable, and server-renderable |
| `@astrojs/tailwind` | ✅ | Deprecated for Tailwind v4; superseded by `@tailwindcss/vite` |
| `jspsych` | 8.x ✅ (MIT) | The academic standard for browser-based cognitive tasks: trial sequencing, millisecond chronometry, keyboard/response plugins, per-trial data collection. Rejected as a **framework**: it owns the page (it renders into a display element and drives its own timeline), which conflicts with Astro's static pages + Preact islands, and it brings a data-collection model aimed at exporting participant data to a server — the opposite of this site's local-only design. Its *chronometry practice* is worth copying even though the package is not: see below |
| `psychojs` | ✅ | The JS runtime for PsychoPy experiments. Same objection, more so — it expects a PsychoPy-authored experiment and a Pavlovia-style host |
| ICAR item bank | n/a (CC/public domain) | Calibrated items with published IRT parameters, and the only legitimate way to get *externally* calibrated content. Rejected because a fixed bank of a few dozen items is exhausted in one drilling session and is already partly published online. Reasoning in `GENERATABILITY.md` §6.1 |

**Charts and all stimulus figures are rendered as hand-written inline SVG.** Beyond bundle
size, this is a testability decision: an SVG `<circle data-shape="circle" data-size="2">` can be
asserted directly by Playwright and read by a screen reader, whereas a `<canvas>` is an opaque
bitmap. Every generated item is server-renderable SVG with semantic `data-*` attributes.

**What jsPsych is right about, and we are not (yet).** Rejecting the package does not reject its
methodology. Two of its chronometry rules apply directly here:

- **Measure with `performance.now()`, not `Date.now()`.** `Date.now()` is wall-clock: it is
  coarse and it jumps when the system clock is adjusted. `performance.now()` is monotonic and
  sub-millisecond. `Quiz.tsx` currently uses `Date.now()` deltas for `latencyMs`.
- **Start the clock when the stimulus is actually painted**, i.e. in a `requestAnimationFrame`
  callback after the item renders, not in the effect that mounts it.

Both are small changes, and they matter most for the one format where latency *is* the score
(symbol search, Gs). A third point is specific to this app: for **span** items the timer starts
when the item mounts, so the sequence-playback duration is inside the recorded latency — that
type's median time is therefore not comparable with the others and should either exclude
playback or be excluded from the speed metric.

---

## 4. Final dependency set

```jsonc
// runtime
"astro": "^7.2.0",
"@astrojs/preact": "^6.0.2",
"@astrojs/sitemap": "^3.7.3",
"preact": "^10.29.8",
"nanostores": "^1.4.2",
"@nanostores/persistent": "^1.3.5",
"@nanostores/preact": "^1.1.0",
"pure-rand": "^8.4.2",

// dev
"typescript": "^6.0.0",     // NOT ^7 — @astrojs/check peer constraint
"@astrojs/check": "^0.9.10",
"tailwindcss": "^4.3.3",
"@tailwindcss/vite": "^4.3.3",
"vitest": "^4.1.10",
"@playwright/test": "^1.62.1"
```

Eight runtime dependencies, all MIT, none of them domain logic — and none of them
internationalisation.
