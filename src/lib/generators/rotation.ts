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

interface Plan {
  cells: number;
  box: number;
  /** Rotations offered as distractors alongside mirrors. */
  allowNearMiss: boolean;
}

function planFor(difficulty: Difficulty): Plan {
  switch (difficulty) {
    case 1:
      return { cells: 4, box: 3, allowNearMiss: false };
    case 2:
      return { cells: 5, box: 3, allowNearMiss: false };
    case 3:
      return { cells: 5, box: 4, allowNearMiss: true };
    case 4:
      return { cells: 6, box: 4, allowNearMiss: true };
    case 5:
      return { cells: 7, box: 4, allowNearMiss: true };
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
function nudge(g: CellGrid, rng: Rng): CellGrid | null {
  const work = cloneGrid(g);
  const filled: [number, number][] = [];
  for (let r = 0; r < work.rows; r++) {
    for (let c = 0; c < work.cols; c++) if (gridGet(work, r, c)) filled.push([r, c]);
  }
  // Grow the canvas so a cell can move outwards without being clipped.
  const padded = makeGrid(work.rows + 2, work.cols + 2);
  for (const [r, c] of filled) gridSet(padded, r + 1, c + 1, true);

  const [pr, pc] = rng.pick(filled);
  gridSet(padded, pr + 1, pc + 1, false);
  const spots: [number, number][] = [];
  for (let r = 0; r < padded.rows; r++) {
    for (let c = 0; c < padded.cols; c++) {
      if (gridGet(padded, r, c)) continue;
      const touches =
        gridGet(padded, r - 1, c) || gridGet(padded, r + 1, c) ||
        gridGet(padded, r, c - 1) || gridGet(padded, r, c + 1);
      if (touches) spots.push([r, c]);
    }
  }
  if (spots.length === 0) return null;
  const [nr, nc] = rng.pick(spots);
  gridSet(padded, nr, nc, true);
  const out = normaliseGrid(padded);
  if (!isConnected(out)) return null;
  if (countFilled(out) !== countFilled(g)) return null;
  return out;
}

const meta: ItemTypeMeta = { id: 'rotation', domain: 'Gv', icon: '↻' };

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

    const turns = rng.pick([1, 2, 3]);
    const answer = rotateGridTimes(target, turns);

    const mirrored = mirrorGrid(target);
    const candidates: { grid: CellGrid; errorType: ErrorType }[] = [];
    for (const turn of rng.shuffle([0, 1, 2, 3])) {
      candidates.push({ grid: rotateGridTimes(mirrored, turn), errorType: 'mirror' });
    }
    if (plan.allowNearMiss) {
      for (let i = 0; i < 4; i++) {
        const n = nudge(target, rng);
        if (n) candidates.push({ grid: rotateGridTimes(n, rng.int(0, 3)), errorType: 'plausible' });
      }
    }

    const seen = new Set<string>([gridKey(answer)]);
    const distractors = candidates.filter((c) => {
      // A "mirror" that is really a rotation of the target would be a second right answer.
      if (isRotationOf(target, c.grid)) return false;
      const k = gridKey(c.grid);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    if (distractors.length < 4) continue;

    const all = rng.shuffle([
      { grid: answer, errorType: 'correct' as ErrorType },
      ...distractors.slice(0, 4),
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
