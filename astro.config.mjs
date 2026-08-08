// @ts-check
import { defineConfig } from 'astro/config';
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
  vite: {
    plugins: [tailwindcss()],
  },
  build: {
    // GitHub Pages serves no server, so emit real directories with index.html.
    format: 'directory',
  },
});
