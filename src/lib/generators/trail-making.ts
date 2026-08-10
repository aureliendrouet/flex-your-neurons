/**
 * Trail making — connect the targets in order, against the clock.
 *
 * From the Army Individual Test Battery (1944), and one of the most-administered
 * neuropsychological tasks in existence. Form A is numbers alone (1, 2, 3 …): visual search plus
 * motor speed. Form B alternates numbers and letters (1, A, 2, B …), which adds set-switching —
 * holding two sequences and alternating between them without losing either.
 *
 * ## Why the form is a within-format condition, not a difficulty level
 *
 * The obvious plan is form A at the low levels and form B at the high ones. That is the mistake
 * `head-count` made in a different costume: it would make level 4 measure a *different construct*
 * from level 1 rather than more of the same one, so the levels would not be comparable and "you
 * improved" could mean only "you were given form A".
 *
 * So difficulty scales the node count — the search load — and the form varies per item, roughly
 * half and half. That buys something better than a difficulty ladder: **B minus A is the classic
 * executive-function measure**, and it is computable here the same way the Stroop contrast is, by
 * regenerating items from their seeds. Neither form's time means much alone; the difference between
 * them is a property of switching specifically, because the search and the motor demand are matched.
 *
 * ## Why the layout is placed on a jittered grid
 *
 * Nodes must not overlap — two circles on top of each other are not a harder item, they are an
 * unclickable one. Rejection sampling ("keep throwing darts until they are far enough apart") does
 * that but can fail at high counts, and a generator that sometimes gives up is a generator that
 * gives up at the worst moment. Choosing distinct cells of a coarse grid and jittering inside each
 * one makes the minimum separation a property of the construction: it cannot fail, and it needs no
 * retry loop.
 *
 * Labels are then assigned in order to cells picked at random, so the path wanders across the board
 * — which is the search the task is about. Placing them in reading order would leave a trail anyone
 * could follow without reading a single label.
 */
import { createRng, type Rng } from '../rng';
import { dict, type Locale } from '../i18n';
import type { Difficulty, Generator, Item, ItemTypeMeta, TrailNode } from '../types';

/** Letters used by form B. No I or O: at node size they are a 1 and a 0. */
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'.split('');

interface Plan {
  /** How many targets the board carries. */
  nodes: number;
}

/**
 * Node radius as a share of the board's width. Must match `TrailBoard`, and the placement below is
 * built around it: targets are inset by a radius so none is clipped, and the guaranteed separation
 * is checked against a diameter in `tests/solvers.test.ts`.
 */
export const NODE_RADIUS = 0.04;

/**
 * Sixteen targets at the top, not the twenty-five of the paper test — a deliberate deviation.
 *
 * Twenty-five circles fit an A4 sheet comfortably. On a phone-width board they do not: at a tappable
 * size they would cover well over half the area, and no placement makes that non-overlapping. The
 * choice was between targets too small to hit, targets that overlap, and fewer targets. Fewer targets
 * changes the *amount* of search while leaving the task intact, which is the only one of the three
 * that does not break something. Recorded here rather than quietly absorbed.
 */
function planFor(difficulty: Difficulty): Plan {
  switch (difficulty) {
    case 1:
      return { nodes: 8 };
    case 2:
      return { nodes: 10 };
    case 3:
      return { nodes: 12 };
    case 4:
      return { nodes: 14 };
    case 5:
      return { nodes: 16 };
  }
}

/**
 * Whether a board is form B — numbers alternating with letters.
 *
 * Derived from the labels rather than stored, so there is one source of truth, and recoverable from
 * history for the B-minus-A contrast: the item regenerates from its seed, so no per-response field
 * had to be added. Same trick as `isCongruent` in the interference format.
 */
export function isFormB(nodes: TrailNode[]): boolean {
  return nodes.some((node) => /[A-Z]/.test(node.label));
}

/** The labels in the order they must be clicked. */
export function labelsFor(form: 'A' | 'B', count: number): string[] {
  if (form === 'A') return Array.from({ length: count }, (_, i) => String(i + 1));
  /*
   * 1, A, 2, B, … — numbers on the even positions, letters on the odd ones. An odd count ends on a
   * number, which is correct: the real form B ends on whichever sequence runs out last.
   */
  return Array.from({ length: count }, (_, i) =>
    i % 2 === 0 ? String(i / 2 + 1) : LETTERS[(i - 1) / 2]!,
  );
}

/**
 * Jitter as a share of a cell, in each direction from its centre.
 *
 * Two nodes in adjacent cells can each move this far towards the other, so the guaranteed separation
 * is `(1 - 2 * JITTER)` of a cell. That has to stay above a node diameter *in the narrower axis*,
 * which is where the first version went wrong: it reasoned in "cells" as though cells were square.
 * With sixteen nodes the grid is six columns by four rows, so a column is 0.167 wide against a row
 * of 0.25 — and 0.4 of a column is 0.067, well under the 0.08 diameter. Hence 0.2 rather than 0.3.
 */
const JITTER = 0.2;

/**
 * Places `count` nodes on a jittered grid inside the unit box.
 *
 * The grid is deliberately sparser than the node count (about 2.2 cells per node), so the chosen
 * cells are spread rather than packed — a fully-occupied grid would look like a lattice, and a
 * lattice is a different, much easier search than a scatter.
 *
 * Everything is then mapped into a box inset by one node radius. Without that a target on the edge
 * is clipped by it: the first version put a node at x = 0.040 with a radius of 0.042, so it hung off
 * the left-hand side. The inset shrinks the separations by the same factor, which is why the
 * guarantee is checked after it rather than before.
 */
function placeNodes(count: number, rng: Rng): { x: number; y: number }[] {
  const columns = Math.ceil(Math.sqrt(count * 2.2));
  const rows = Math.ceil(count / columns) + 1;
  const cells: { row: number; col: number }[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) cells.push({ row, col });
  }

  const span = 1 - NODE_RADIUS * 2;
  const inset = (v: number) => NODE_RADIUS + v * span;

  return rng.sample(cells, count).map(({ row, col }) => ({
    x: inset((col + 0.5 + (rng.float() * 2 - 1) * JITTER) / columns),
    y: inset((row + 0.5 + (rng.float() * 2 - 1) * JITTER) / rows),
  }));
}

const meta: ItemTypeMeta = {
  id: 'trail-making',
  domain: 'Gs',
  icon: '⟿',
  /*
   * Not sprintable, and not because it is slow to answer. A trail *is* a timed block — one item
   * under one clock, which is how the real task is administered — so putting it inside another
   * timed block would nest two clocks and score neither.
   */
  sprintable: false,
};

function generate(seed: string, difficulty: Difficulty, locale: Locale): Item {
  const t = dict(locale).gen.trailMaking;
  const rng = createRng(`trail-making:${seed}:${difficulty}`);
  const plan = planFor(difficulty);

  const form: 'A' | 'B' = rng.bool() ? 'B' : 'A';
  const labels = labelsFor(form, plan.nodes);
  const positions = placeNodes(plan.nodes, rng);
  const nodes: TrailNode[] = labels.map((label, i) => ({ label, ...positions[i]! }));

  return {
    type: 'trail-making',
    seed,
    difficulty,
    prompt: form === 'B' ? t.promptB : t.promptA,
    stimulus: { kind: 'trail', nodes },
    responseMode: 'trail',
    options: [],
    answerIndex: -1,
    errorTypes: [],
    explanation: {
      summary: t.summary(plan.nodes, form === 'B'),
      rules: [
        form === 'B' ? t.ruleAlternate : t.ruleSequence,
        t.ruleTimed,
        t.ruleContrast,
      ],
    },
    // Generous: this is a whole task, not a single decision.
    suggestedSeconds: Math.round(plan.nodes * (form === 'B' ? 2.2 : 1.4)),
  };
}

export const trailMakingGenerator: Generator = { meta, generate };
