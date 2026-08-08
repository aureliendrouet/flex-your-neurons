// @ts-check
import { defineConfig, fontProviders } from 'astro/config';
import preact from '@astrojs/preact';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// GitHub Pages project site: https://<user>.github.io/<repo>/
// Both are overridable so a fork (or a user/organisation page) needs no code change.
const SITE = process.env.SITE_URL ?? 'https://aureliendrouet.github.io';
const BASE = process.env.BASE_PATH ?? '/iq';

export default defineConfig({
  site: SITE,
  base: BASE,
  output: 'static',
  trailingSlash: 'ignore',
  integrations: [preact(), sitemap()],

  /*
   * Three type roles, self-hosted.
   *
   * The "no network" constraint is about the *deployed site*, not the build: Astro's Fonts
   * API downloads, subsets and fingerprints these at build time and emits local `woff2`
   * files, so the shipped page still makes zero third-party requests. (The cost is that a
   * cold build needs network access to the provider; CI has it, and `.astro/` caches it
   * locally between builds.)
   *
   * Two families, not three, and that is a measured decision rather than a compromise.
   *
   * The plan called for a display face, a neutral text face and a real mono inside ~60KB.
   * Measured, the naive version of that came to 381KB and the tightest to 90KB — Google
   * serves both Inter and JetBrains Mono as variable files, so a "static two weights" saving
   * does not exist. Something had to go, and the honest question is which family changes the
   * design per byte:
   *
   * - Space Grotesk for display (13KB) gives every heading and the wordmark a voice.
   * - JetBrains Mono for the data voice (31KB) replaces a system stack, which meant the one
   *   typeface carrying meaning — seeds, latencies, option keys, error-type names — was the
   *   one nobody had chosen.
   * - Inter for body copy (48KB, the most expensive of the three) would have replaced the
   *   system UI stack with something a reader can barely distinguish from it. The system
   *   stack *is* a competent neutral text face, and it costs nothing.
   *
   * So the text role stays on system fonts (`--font-text` in `global.css`) and the budget is
   * spent where it shows: 44KB for both faces, inside the target.
   *
   * Two further economies, both worth knowing about:
   *
   * - `subsets: ['latin']` only. It is tempting to add `latin-ext` "for French", but every
   *   glyph French needs is already in `latin`: the accented vowels live in U+0000-00FF and
   *   the ligature œ is U+0152-0153, which the `latin` range covers. `latin-ext` would have
   *   doubled the file count for glyphs no page here contains.
   * - `styles: ['normal']`. The default is `['normal', 'italic']`, and nothing in this site
   *   is italic — that default alone accounted for half of the original 381KB.
   */
  fonts: [
    {
      // Display: headings and the wordmark. A grotesque with actual character in its
      // details, which shares a skeleton with the mono below.
      provider: fontProviders.google(),
      name: 'Space Grotesk',
      cssVariable: '--font-display',
      weights: [700],
      styles: ['normal'],
      subsets: ['latin'],
      fallbacks: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
    },
    {
      // Mono: the site's data voice — seeds, latencies, option keys, error-type tags. It
      // was a system stack before, which meant the one typeface carrying meaning was the
      // one nobody had chosen.
      provider: fontProviders.google(),
      name: 'JetBrains Mono',
      cssVariable: '--font-code',
      weights: [400, 600],
      styles: ['normal'],
      subsets: ['latin'],
      fallbacks: ['ui-monospace', 'SF Mono', 'Cascadia Code', 'Menlo', 'monospace'],
    },
  ],
  vite: {
    plugins: [tailwindcss()],
  },
  build: {
    // GitHub Pages serves no server, so emit real directories with index.html.
    format: 'directory',
  },
});
