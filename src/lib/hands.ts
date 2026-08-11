/**
 * The three hands of rock-paper-scissors, as path data on a 0–100 box.
 *
 * Shared for the same reason the clock geometry is: the live stimulus, the format-card miniature and
 * the social card all draw them, and three hands drawn three ways would be three different claims
 * about one item.
 *
 * They are diagrams rather than illustrations — the closed fist, the flat palm, the open blades —
 * because what the format needs is instant recognition of *which* hand, not a picture of a hand. At
 * card size an anatomical drawing turns to mush, while these three silhouettes stay apart. They are
 * drawn in `currentColor` and never in a hue, like everything else on the site
 * (`DESIGN-PLAN.md` §3.1), so nothing here depends on the reader's colour vision.
 */
import type { Hand } from './types';

export interface HandDrawing {
  /** The silhouette: one closed path, filled faintly and outlined. */
  body: string;
  /** Strokes on top of it — knuckles, finger partings, blades. Never filled. */
  detail: string;
}

/**
 * One drawing per hand.
 *
 * The three are distinguished by *outline*, not by detail: a wide rounded mass, a tall narrow one
 * with a straight top edge, and a narrow one with two strokes leaving it in a V. That is what
 * survives being drawn at 40px on a format card, and it is why the detail strokes are separate —
 * they are what makes each one read as a hand at full size, and they are the first thing to become
 * illegible when it shrinks.
 */
export const HAND_DRAWINGS: Record<Hand, HandDrawing> = {
  /*
   * A fist: a wide rounded mass whose *top edge* is scalloped into four knuckles. The knuckles are
   * in the outline rather than drawn on top of it, which is what stops this reading as a plain blob
   * — the first attempt drew them as strokes inside a smooth oval and looked like a pebble.
   */
  rock: {
    body: 'M20 62 C20 51 24 43 31 40 C35 32 44 32 47 40 C50 32 59 32 62 40 C65 34 74 34 77 42 C81 45 84 52 84 62 C84 78 71 88 52 88 C33 88 20 78 20 62 Z',
    detail: 'M24 60 C31 52 42 51 49 57',
  },
  // A flat hand: four fingers extended together above a squared palm.
  paper: {
    body: 'M30 84 L30 34 C30 28 39 28 39 34 L39 24 C39 18 48 18 48 24 L48 22 C48 16 57 16 57 22 L57 30 C57 24 66 24 66 30 L66 62 C66 75 57 84 45 84 Z',
    detail: 'M39 34 L39 60 M48 24 L48 60 M57 30 L57 60',
  },
  /*
   * Two fingers in a V above a folded fist, as three overlapping sub-paths. The fingers are closed
   * shapes rather than thick strokes so they take the same faint fill and firm outline as everything
   * else here; where they meet the fist the outline crosses, which reads as fingers rising out of a
   * hand rather than as a seam.
   */
  scissors: {
    body:
      'M20.6 26.6 A6 6 0 0 1 31.4 21.4 L50 60 L38 66 Z ' +
      'M79.4 26.6 A6 6 0 0 0 68.6 21.4 L50 60 L62 66 Z ' +
      'M30 68 C30 60 34 55 50 55 C66 55 70 60 70 68 C70 80 62 87 50 87 C38 87 30 80 30 68 Z',
    detail: 'M33 68 C38 63 46 62 51 66',
  },
};
