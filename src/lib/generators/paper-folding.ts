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
import { cloneGrid, gridGet, gridKey, gridSet, makeGrid } from '../geometry';
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

  // Forgot to unfold: only the topmost hole of each stack.
  const topOnly = makeGrid(SHEET, SHEET);
  for (const p of punches) {
    const first = at(sheet, p.r, p.c)[0];
    if (first) gridSet(topOnly, first[0], first[1], true);
  }
  out.push({ grid: topOnly, errorType: 'off-by-one' });

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
  out.push({ grid: flipH, errorType: 'mirror' });
  out.push({ grid: flipV, errorType: 'mirror' });

  // One hole too many, and one too few.
  const extra = cloneGrid(correct);
  const empties: [number, number][] = [];
  for (let r = 0; r < SHEET; r++) {
    for (let c = 0; c < SHEET; c++) if (!gridGet(extra, r, c)) empties.push([r, c]);
  }
  if (empties.length > 0) {
    const [er, ec] = rng.pick(empties);
    gridSet(extra, er, ec, true);
    out.push({ grid: extra, errorType: 'plausible' });
  }

  const fewer = cloneGrid(correct);
  const filled: [number, number][] = [];
  for (let r = 0; r < SHEET; r++) {
    for (let c = 0; c < SHEET; c++) if (gridGet(fewer, r, c)) filled.push([r, c]);
  }
  if (filled.length > 1) {
    const [fr, fc] = rng.pick(filled);
    gridSet(fewer, fr, fc, false);
    out.push({ grid: fewer, errorType: 'plausible' });
  }

  // A rotation of the correct pattern.
  const rot = makeGrid(SHEET, SHEET);
  for (let r = 0; r < SHEET; r++) {
    for (let c = 0; c < SHEET; c++) {
      if (gridGet(correct, r, c)) gridSet(rot, c, SHEET - 1 - r, true);
    }
  }
  out.push({ grid: rot, errorType: 'wrong-axis' });

  // Same hole count, one hole displaced. These matter because the symmetric patterns a
  // fold produces are often their own mirror image, which silently kills the flip
  // distractors above and would otherwise leave too few options to choose from.
  const filledCells: [number, number][] = [];
  const emptyCells: [number, number][] = [];
  for (let r = 0; r < SHEET; r++) {
    for (let c = 0; c < SHEET; c++) {
      (gridGet(correct, r, c) ? filledCells : emptyCells).push([r, c]);
    }
  }
  if (filledCells.length > 0 && emptyCells.length > 0) {
    for (const from of rng.shuffle(filledCells).slice(0, 4)) {
      for (const to of rng.shuffle(emptyCells).slice(0, 2)) {
        const moved = cloneGrid(correct);
        gridSet(moved, from[0], from[1], false);
        gridSet(moved, to[0], to[1], true);
        out.push({ grid: moved, errorType: 'plausible' });
      }
    }
  }

  return out;
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

    const seen = new Set<string>([gridKey(correct)]);
    const distractors = distractorsFor(correct, sheet, punches, rng).filter((d) => {
      const k = gridKey(d.grid);
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
        summary: t.summary(answerIndex + 1, plan.punches, plan.folds + 1, holeCount),
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
