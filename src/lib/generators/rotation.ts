/**
 * Mental rotation — which figure is the same shape, merely turned?
 *
 * A 2-D polyomino stands in for the Shepard & Metzler cube figures. The 2-D form keeps
 * the construct (deciding rotation vs. reflection) while staying renderable as inspectable
 * SVG rather than a WebGL canvas (docs/LIBRARIES.md §3).
 *
 * The item only works if the shape is CHIRAL — if its mirror image is also one of its own
 * rotations, then the mirror distractor is in fact a correct answer. Chirality is checked
 * explicitly, and distractors are proved to be proper mirrors, not rotations.
 */
import { createRng, type Rng } from '../rng';
import { dict, type Locale } from '../i18n';
import {
  cloneGrid,
  countFilled,
  gridGet,
  gridKey,
  gridSet,
  isChiral,
  isConnected,
  isRotationOf,
  makeGrid,
  mirrorGrid,
  normaliseGrid,
  rotateGridTimes,
} from '../geometry';
import type { CellGrid, Difficulty, ErrorType, Generator, Item, ItemTypeMeta, Option } from '../types';

/** Options per item, and how many of the four distractors are reflections. See `generate`. */
const OPTION_COUNT = 5;
const MIRROR_QUOTA = 2;

/** Quarter turns offered per difficulty: 2 is a half turn, 1 and 3 the quarter turns. */
const TURN_POOL: Record<Difficulty, number[]> = {
  1: [2, 2, 1, 3],
  2: [2, 2, 1, 3],
  3: [2, 1, 1, 3, 3],
  4: [2, 1, 1, 3, 3],
  5: [1, 1, 3, 3],
};

interface Plan {
  cells: number;
  box: number;
}

/**
 * Difficulty 1 draws from five cells rather than four, and the reason is not subtlety.
 *
 * A four-cell polyomino in a 3-box that is chiral *and* survives the distractor construction is
 * only ever the L-tetromino or its mirror J: the S/Z pair is rejected because its own symmetry
 * collapses the candidate set. So the entire level was two shapes, drilled forever. Five cells give
 * it a real vocabulary while staying the easiest rung.
 */
function planFor(difficulty: Difficulty): Plan {
  switch (difficulty) {
    case 1:
      return { cells: 5, box: 4 };
    case 2:
      return { cells: 6, box: 4 };
    case 3:
      return { cells: 6, box: 5 };
    case 4:
      return { cells: 7, box: 5 };
    case 5:
      return { cells: 8, box: 5 };
  }
}

/** Grows a connected polyomino by repeatedly adding a cell adjacent to the existing ones. */
function randomPolyomino(rng: Rng, cells: number, box: number): CellGrid | null {
  const g = makeGrid(box, box);
  let r = rng.int(0, box - 1);
  let c = rng.int(0, box - 1);
  gridSet(g, r, c, true);
  let placed = 1;

  for (let guard = 0; guard < 200 && placed < cells; guard++) {
    // Pick a random filled cell, then a random empty neighbour.
    const filled: [number, number][] = [];
    for (let i = 0; i < box; i++) {
      for (let j = 0; j < box; j++) if (gridGet(g, i, j)) filled.push([i, j]);
    }
    const [fr, fc] = rng.pick(filled);
    const dirs: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    const [dr, dc] = rng.pick(dirs);
    r = fr + dr;
    c = fc + dc;
    if (r < 0 || c < 0 || r >= box || c >= box) continue;
    if (gridGet(g, r, c)) continue;
    gridSet(g, r, c, true);
    placed++;
  }

  if (placed !== cells) return null;
  const n = normaliseGrid(g);
  if (!isConnected(n)) return null;
  return n;
}

/** A near-miss: the same shape with one cell relocated. Still connected, still same size. */
/**
 * Everything about a drawn shape except its handedness.
 *
 * Cell count, the bounding box *as presented*, and how many cells coincide with their own reflection
 * in each axis. Two options differing on any of these can be told apart without solving anything —
 * a rotation and a reflection of one shape share all of them, so an option set that mixes
 * target-derived shapes with freely drawn ones splits cleanly into "congruent to the target" and
 * "not", and the answer is always on the first side.
 *
 * Requiring one signature across the whole set leaves the turn-versus-flip distinction as the only
 * thing separating the options, which is the distinction the format exists to measure.
 */
function signatureOf(g: CellGrid): string {
  const n = normaliseGrid(g);
  const filled = n.cells.filter(Boolean).length;
  let symH = 0;
  let symV = 0;
  for (let r = 0; r < n.rows; r++) {
    for (let c = 0; c < n.cols; c++) {
      if (gridGet(n, r, c) === gridGet(n, r, n.cols - 1 - c)) symH++;
      if (gridGet(n, r, c) === gridGet(n, n.rows - 1 - r, c)) symV++;
    }
  }
  return `${filled}|${n.rows}x${n.cols}|${symH},${symV}`;
}

/**
 * Every shape reachable by moving one cell of `g` to another edge-adjacent free position.
 *
 * Enumerated rather than sampled. The near-misses have to match the answer's signature exactly (see
 * `signatureOf`), and drawing single nudges at random until one happens to match burned hundreds of
 * attempts per item and still came up empty on the smaller shapes. The whole neighbourhood is only
 * a few hundred grids, so it is cheaper to generate it once and filter.
 */
function allNudges(g: CellGrid): CellGrid[] {
  const filled: [number, number][] = [];
  for (let r = 0; r < g.rows; r++) {
    for (let c = 0; c < g.cols; c++) if (gridGet(g, r, c)) filled.push([r, c]);
  }

  const out: CellGrid[] = [];
  const seen = new Set<string>();
  for (const [pr, pc] of filled) {
    // Grow the canvas so a cell can move outwards without being clipped.
    const padded = makeGrid(g.rows + 2, g.cols + 2);
    for (const [r, c] of filled) gridSet(padded, r + 1, c + 1, true);
    gridSet(padded, pr + 1, pc + 1, false);

    for (let r = 0; r < padded.rows; r++) {
      for (let c = 0; c < padded.cols; c++) {
        if (gridGet(padded, r, c)) continue;
        const touches =
          gridGet(padded, r - 1, c) || gridGet(padded, r + 1, c) ||
          gridGet(padded, r, c - 1) || gridGet(padded, r, c + 1);
        if (!touches) continue;

        gridSet(padded, r, c, true);
        const candidate = normaliseGrid(padded);
        gridSet(padded, r, c, false);

        if (!isConnected(candidate)) continue;
        if (countFilled(candidate) !== countFilled(g)) continue;
        const key = gridKey(candidate);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(candidate);
      }
    }
  }
  return out;
}

const meta: ItemTypeMeta = {
  id: 'rotation',
  domain: 'Gv',
  icon: '↻',
  sprintable: false,
};

const MAX_ATTEMPTS = 400;

function generate(seed: string, difficulty: Difficulty, locale: Locale): Item {
  const t = dict(locale).gen.rotation;
  const rng = createRng(`rotation:${seed}:${difficulty}`);
  const plan = planFor(difficulty);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const target = randomPolyomino(rng, plan.cells, plan.box);
    if (!target) continue;
    // Without chirality the mirror distractors would also be correct answers.
    if (!isChiral(target)) continue;

    /*
     * The angle is a difficulty dial, as the docs and the format's own description have always said
     * it was. It was not: `[1, 2, 3]` was drawn uniformly at every level, so the only thing that
     * actually moved was the cell count, while `en.ts` told the reader "difficulty comes from the
     * angle and the number of cells — response time is known to rise linearly with rotation angle".
     *
     * A half turn is the easiest to picture and a three-quarter turn the hardest, so the easy levels
     * weight 180° and the hard ones weight the quarter turns.
     */
    const turns = rng.pick(TURN_POOL[difficulty]);
    const answer = rotateGridTimes(target, turns);

    /*
     * Two mirrors and two near-misses, never four mirrors.
     *
     * Every distractor used to be a rotation of the single mirrored shape, which made the four wrong
     * options mutually rotation-equivalent and left the correct one as the only shape in the set not
     * congruent to the others. "Pick the odd one out" then answered the item without ever looking at
     * the stimulus — measured at 96-100% across every difficulty, on a format whose entire job is to
     * make the reader turn a shape in their head. The near-miss branch that would have diluted it
     * existed but was unreachable: mirrors were pushed first and the slice took them, so a "hard"
     * item shipped near-misses in about one item in twenty.
     *
     * Mixing the classes is the fix, and it is also the reason near-misses now run at every level
     * rather than from difficulty 3: this is a fairness property, not a difficulty knob.
     */
    const mirrored = mirrorGrid(target);
    const seen = new Set<string>([gridKey(answer)]);
    const usable = (grid: CellGrid): boolean => {
      // A "mirror" that is really a rotation of the target would be a second right answer.
      if (isRotationOf(target, grid)) return false;
      const k = gridKey(grid);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    };

    /*
     * Every option carries the answer's signature — see `signatureOf`. That is what stops the set
     * from splitting into "congruent to the target" and "not", which is a split a reader can make
     * without ever looking at the stimulus, and which the answer is always on one side of.
     */
    const wanted = signatureOf(answer);

    const mirrors: { grid: CellGrid; errorType: ErrorType }[] = [];
    for (const turn of rng.shuffle([0, 1, 2, 3])) {
      if (mirrors.length >= MIRROR_QUOTA) break;
      const grid = rotateGridTimes(mirrored, turn);
      if (signatureOf(grid) !== wanted) continue;
      if (usable(grid)) mirrors.push({ grid, errorType: 'mirror' });
    }

    const nearMissQuota = OPTION_COUNT - 1 - MIRROR_QUOTA;
    const nearMisses: { grid: CellGrid; errorType: ErrorType }[] = [];
    for (const n of rng.shuffle(allNudges(target))) {
      if (nearMisses.length >= nearMissQuota) break;
      for (const turn of rng.shuffle([0, 1, 2, 3])) {
        const grid = rotateGridTimes(n, turn);
        if (signatureOf(grid) !== wanted) continue;
        if (!usable(grid)) continue;
        nearMisses.push({ grid, errorType: 'plausible' });
        break;
      }
    }

    if (mirrors.length < MIRROR_QUOTA || nearMisses.length < nearMissQuota) continue;

    const all = rng.shuffle([
      { grid: answer, errorType: 'correct' as ErrorType },
      ...mirrors,
      ...nearMisses,
    ]);
    const answerIndex = all.findIndex((x) => x.errorType === 'correct');

    // Final independent check: exactly one option is a rotation of the target.
    const rotations = all.filter((x) => isRotationOf(target, x.grid));
    if (rotations.length !== 1) continue;

    const options: Option[] = all.map((x) => ({ kind: 'grid', grid: x.grid }));

    return {
      type: 'rotation',
      seed,
      difficulty,
      prompt: t.prompt,
      stimulus: { kind: 'grid', grid: target },
      responseMode: 'choice',
      options,
      answerIndex,
      errorTypes: all.map((x) => x.errorType),
      explanation: {
        summary: t.summary(answerIndex + 1, turns * 90),
        rules: [t.ruleMirrors, t.ruleHint],
      },
      suggestedSeconds: 20 + difficulty * 8,
    };
  }

  throw new Error(
    `rotation generator exhausted ${MAX_ATTEMPTS} attempts for seed "${seed}" d${difficulty}`,
  );
}

export const rotationGenerator: Generator = { meta, generate };
