/**
 * Paper folding (VZ-2) — a sheet is folded, holes are punched through the stack, and you
 * predict the pattern when it is unfolded.
 *
 * The correct answer is *simulated*, not asserted: folding is modelled as a mapping from
 * each cell of the folded sheet back to the set of original cells stacked underneath it,
 * so punching a folded cell marks every original cell in that stack. There is exactly one
 * true unfolding, which makes this one of the cleanly verifiable formats.
 */
import { createRng, type Rng } from '../rng';
import { cloneGrid, gridCellsKey, gridGet, gridSet, makeGrid } from '../geometry';
import { dict, type Locale } from '../i18n';
import type {
  CellGrid,
  Difficulty,
  ErrorType,
  Fold,
  Generator,
  Item,
  ItemTypeMeta,
  Option,
} from '../types';

const SHEET = 4;

/** Each folded cell holds the original coordinates stacked beneath it. */
type Stack = [number, number][];

interface FoldedSheet {
  rows: number;
  cols: number;
  /** Row-major, length rows*cols. */
  stacks: Stack[];
}

function identitySheet(size: number): FoldedSheet {
  const stacks: Stack[] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) stacks.push([[r, c]]);
  }
  return { rows: size, cols: size, stacks };
}

function at(sheet: FoldedSheet, r: number, c: number): Stack {
  return sheet.stacks[r * sheet.cols + c]!;
}

/**
 * Applies one fold. A fold halves the sheet along one axis and lays the moving half on
 * top of the stationary half, so the two stacks merge.
 */
function applyFold(sheet: FoldedSheet, fold: Fold): FoldedSheet | null {
  const { rows, cols } = sheet;
  if ((fold === 'left' || fold === 'right') && cols % 2 !== 0) return null;
  if ((fold === 'top' || fold === 'bottom') && rows % 2 !== 0) return null;

  if (fold === 'left' || fold === 'right') {
    const half = cols / 2;
    const out: FoldedSheet = { rows, cols: half, stacks: [] };
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < half; c++) {
        // 'left': the left half swings right onto the right half; column c of the result
        // is right-half column c, with left-half column (half-1-c) laid over it.
        const stationary = fold === 'left' ? at(sheet, r, half + c) : at(sheet, r, c);
        const moving = fold === 'left' ? at(sheet, r, half - 1 - c) : at(sheet, r, cols - 1 - c);
        out.stacks.push([...stationary, ...moving]);
      }
    }
    return out;
  }

  const half = rows / 2;
  const out: FoldedSheet = { rows: half, cols, stacks: [] };
  for (let r = 0; r < half; r++) {
    for (let c = 0; c < cols; c++) {
      const stationary = fold === 'top' ? at(sheet, half + r, c) : at(sheet, r, c);
      const moving = fold === 'top' ? at(sheet, half - 1 - r, c) : at(sheet, rows - 1 - r, c);
      out.stacks.push([...stationary, ...moving]);
    }
  }
  return out;
}

interface Plan {
  folds: number;
  punches: number;
}

function planFor(difficulty: Difficulty): Plan {
  switch (difficulty) {
    case 1:
      return { folds: 1, punches: 1 };
    case 2:
      return { folds: 1, punches: 2 };
    case 3:
      return { folds: 2, punches: 1 };
    case 4:
      return { folds: 2, punches: 2 };
    case 5:
      return { folds: 2, punches: 3 };
  }
}

function unfoldedResult(sheet: FoldedSheet, punches: { r: number; c: number }[]): CellGrid {
  const out = makeGrid(SHEET, SHEET);
  for (const p of punches) {
    for (const [r, c] of at(sheet, p.r, p.c)) gridSet(out, r, c, true);
  }
  return out;
}

/** Plausible wrong unfoldings: the mistakes people actually make. */
function distractorsFor(
  correct: CellGrid,
  sheet: FoldedSheet,
  punches: { r: number; c: number }[],
  rng: Rng,
): { grid: CellGrid; errorType: ErrorType }[] {
  const out: { grid: CellGrid; errorType: ErrorType }[] = [];

  /*
   * Every option carries the same number of holes as the answer, and the same symmetry.
   *
   * Unfolding doubles a punch per fold, so the correct sheet has a hole count no other reading
   * produces and — because the outermost fold reflects across the sheet's own centre line — it is
   * always mirror-symmetric about that line. Both facts were readable straight off the option list.
   * "Keep only the symmetric options and guess among them" scored 50-63% against a 20% baseline, and
   * a quarter of the hardest items had exactly one symmetric option, which is not a guess at all.
   * The hole count gave away two more: the "forgot to unfold" sheet was always the strict minimum
   * and the "one hole too many" sheet always the strict maximum, so both were free eliminations and
   * a blind guess started from a third rather than a fifth.
   *
   * So the distractors below are all *rearrangements* — a wrong reflection, a quarter turn, or holes
   * displaced in symmetric groups. A reader has to work out where the holes go, which is the task,
   * rather than how many there are or whether the pattern looks balanced.
   *
   * The cost is the "forgot to unfold" option, which had the fewest holes by definition and could
   * not be made to match. It was also the one distractor whose label was untrue — it was typed
   * `off-by-one`, a miscount by a single step, when it is a whole stage of the task left undone.
   */

  // Mirrored the unfolding the wrong way, horizontally and vertically.
  const flipH = makeGrid(SHEET, SHEET);
  const flipV = makeGrid(SHEET, SHEET);
  for (let r = 0; r < SHEET; r++) {
    for (let c = 0; c < SHEET; c++) {
      if (!gridGet(correct, r, c)) continue;
      gridSet(flipH, r, SHEET - 1 - c, true);
      gridSet(flipV, SHEET - 1 - r, c, true);
    }
  }
  // A rotation of the correct pattern.
  const rot = makeGrid(SHEET, SHEET);
  for (let r = 0; r < SHEET; r++) {
    for (let c = 0; c < SHEET; c++) {
      if (gridGet(correct, r, c)) gridSet(rot, c, SHEET - 1 - r, true);
    }
  }

  /*
   * The structural mistakes are offered only when they leave the sheet's symmetry unchanged.
   *
   * A quarter turn of a sheet that is symmetric about one axis is symmetric about the other, and
   * that is visible without working anything out: it leaves one option whose balance differs from
   * the rest, and the answer sits in the group that matches. Holding every option to the same
   * symmetry profile costs a distractor now and then and removes the last thing about this option
   * set that could be read at a glance.
   */
  const wanted = symmetryAxes(correct);
  const sameSymmetry = (g: CellGrid) => {
    const a = symmetryAxes(g);
    return a.h === wanted.h && a.v === wanted.v;
  };
  for (const [grid, errorType] of [
    [flipH, 'mirror'],
    [flipV, 'mirror'],
    [rot, 'wrong-axis'],
  ] as const) {
    if (sameSymmetry(grid)) out.push({ grid, errorType });
  }

  /*
   * Holes displaced in symmetric groups, keeping both the count and the symmetry.
   *
   * These carry most of the option set. A single displaced hole would break the mirror symmetry the
   * answer always has and hand the item over; moving a whole orbit — the cell together with its
   * reflections in whichever axes the answer is symmetric about — produces a sheet that is wrong in
   * the same way a reader is wrong, and indistinguishable from the answer by any property except
   * where the holes actually are.
   */
  const axes = symmetryAxes(correct);
  const filledCells: [number, number][] = [];
  const emptyCells: [number, number][] = [];
  for (let r = 0; r < SHEET; r++) {
    for (let c = 0; c < SHEET; c++) {
      (gridGet(correct, r, c) ? filledCells : emptyCells).push([r, c]);
    }
  }

  /* Distinct orbits, not distinct cells: every cell of one orbit describes the same move, so
     iterating cells would spend the whole budget regenerating a handful of sheets. */
  const distinctOrbits = (cells: [number, number][]): [number, number][][] => {
    const byKey = new Map<string, [number, number][]>();
    for (const [r, c] of cells) {
      const orbit = orbitOf(r, c, axes);
      const key = orbit
        .map(([rr, cc]) => `${rr},${cc}`)
        .sort()
        .join(' ');
      if (!byKey.has(key)) byKey.set(key, orbit);
    }
    return [...byKey.values()];
  };

  const fromOrbits = rng.shuffle(distinctOrbits(filledCells));
  const toOrbits = rng.shuffle(distinctOrbits(emptyCells));

  for (const fromOrbit of fromOrbits) {
    for (const toOrbit of toOrbits) {
      // Only a like-for-like swap keeps the hole count, so the count can never single out an option.
      if (toOrbit.length !== fromOrbit.length) continue;
      if (fromOrbit.some(([r, c]) => toOrbit.some(([r2, c2]) => r === r2 && c === c2))) continue;

      const moved = cloneGrid(correct);
      for (const [r, c] of fromOrbit) gridSet(moved, r, c, false);
      for (const [r, c] of toOrbit) gridSet(moved, r, c, true);
      if (countHoles(moved) !== countHoles(correct)) continue;
      out.push({ grid: moved, errorType: 'plausible' });
    }
  }

  return out;
}

/** Which mirror axes a finished sheet is symmetric about. */
function symmetryAxes(grid: CellGrid): { h: boolean; v: boolean } {
  let h = true;
  let v = true;
  for (let r = 0; r < SHEET; r++) {
    for (let c = 0; c < SHEET; c++) {
      if (gridGet(grid, r, c) !== gridGet(grid, r, SHEET - 1 - c)) h = false;
      if (gridGet(grid, r, c) !== gridGet(grid, SHEET - 1 - r, c)) v = false;
    }
  }
  return { h, v };
}

/** A cell together with its reflections in the axes the sheet is symmetric about. */
function orbitOf(r: number, c: number, axes: { h: boolean; v: boolean }): [number, number][] {
  const cells = new Map<string, [number, number]>();
  const add = (rr: number, cc: number) => cells.set(`${rr},${cc}`, [rr, cc]);
  add(r, c);
  if (axes.h) add(r, SHEET - 1 - c);
  if (axes.v) add(SHEET - 1 - r, c);
  if (axes.h && axes.v) add(SHEET - 1 - r, SHEET - 1 - c);
  return [...cells.values()];
}

function countHoles(grid: CellGrid): number {
  return grid.cells.filter(Boolean).length;
}

const meta: ItemTypeMeta = {
  id: 'paper-folding',
  domain: 'Gv',
  icon: '⧉',
  sprintable: false,
};

const MAX_ATTEMPTS = 300;

function generate(seed: string, difficulty: Difficulty, locale: Locale): Item {
  const t = dict(locale).gen.paperFolding;
  const rng = createRng(`paper-folding:${seed}:${difficulty}`);
  const plan = planFor(difficulty);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let sheet = identitySheet(SHEET);
    const folds: Fold[] = [];
    let ok = true;
    for (let i = 0; i < plan.folds; i++) {
      const options: Fold[] =
        sheet.cols > 1 && sheet.rows > 1
          ? ['left', 'right', 'top', 'bottom']
          : sheet.cols > 1
            ? ['left', 'right']
            : ['top', 'bottom'];
      const fold = rng.pick(options);
      const next = applyFold(sheet, fold);
      if (!next) {
        ok = false;
        break;
      }
      folds.push(fold);
      sheet = next;
    }
    if (!ok) continue;

    const positions: { r: number; c: number }[] = [];
    for (let r = 0; r < sheet.rows; r++) {
      for (let c = 0; c < sheet.cols; c++) positions.push({ r, c });
    }
    if (positions.length < plan.punches) continue;
    const punches = rng.sample(positions, plan.punches);

    const correct = unfoldedResult(sheet, punches);
    const holeCount = correct.cells.filter(Boolean).length;
    // A sheet that ends up fully punched, or barely punched, is not discriminating.
    if (holeCount < 2 || holeCount >= SHEET * SHEET - 1) continue;

    const seen = new Set<string>([gridCellsKey(correct)]);
    const distractors = distractorsFor(correct, sheet, punches, rng).filter((d) => {
      const k = gridCellsKey(d.grid);
      if (seen.has(k)) return false;
      if (d.grid.cells.filter(Boolean).length === 0) return false;
      seen.add(k);
      return true;
    });
    if (distractors.length < 4) continue;

    // `distractorsFor` returns its candidates in priority order — the structural mistakes
    // (forgot to unfold, mirrored the wrong way) before the generic displacements — so
    // take the first four rather than shuffling, to keep distractors diagnostic.
    const all = rng.shuffle([
      { grid: correct, errorType: 'correct' as ErrorType },
      ...distractors.slice(0, 4),
    ]);
    const answerIndex = all.findIndex((x) => x.errorType === 'correct');

    // Options are drawn as sheets with punched holes, matching the stimulus, rather
    // than as filled blocks — an unfolded sheet is paper with holes in it.
    const options: Option[] = all.map((x) => ({ kind: 'grid', grid: x.grid, variant: 'holes' }));

    return {
      type: 'paper-folding',
      seed,
      difficulty,
      prompt: t.prompt,
      stimulus: {
        kind: 'paper-folding',
        folds,
        punches: punches.map((p) => ({ x: p.c, y: p.r })),
        size: SHEET,
      },
      responseMode: 'choice',
      options,
      answerIndex,
      errorTypes: all.map((x) => x.errorType),
      explanation: {
        /*
         * Layers double with each fold — `2 ** folds`, not `folds + 1`.
         *
         * The old arithmetic was right only for a single fold, so every two-fold item told the
         * reader "1 punch through 3 layers gives 4 holes", which does not multiply out and
         * contradicted the diagram printed beside it. `StimulusView` had it right all along, which
         * is why the two disagreed on screen.
         */
        summary: t.summary(answerIndex + 1, plan.punches, 2 ** plan.folds, holeCount),
        rules: [
          ...folds.map((f, i) => t.foldStep(i + 1, t.folds[f])),
          t.ruleUnfold,
        ],
      },
      suggestedSeconds: 30 + difficulty * 10,
    };
  }

  throw new Error(
    `paper-folding generator exhausted ${MAX_ATTEMPTS} attempts for seed "${seed}" d${difficulty}`,
  );
}

export const paperFoldingGenerator: Generator = { meta, generate };
