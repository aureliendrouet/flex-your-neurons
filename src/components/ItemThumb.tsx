/**
 * A miniature of a real generated item, for the format cards.
 *
 * Rendered at build time — the component takes an `Item` and has no state, no effects and
 * no client directive, so Astro emits static markup and the browser ships no JavaScript
 * for it.
 *
 * Two constraints shape every branch below:
 *
 * 1. **No hue.** These are figures, so they are `currentColor` and texture only, exactly
 *    like the ones inside a live item (docs/DESIGN-PLAN.md §3.1). All colour lives in the
 *    card chrome around them.
 * 2. **Legible, not complete.** A thumbnail is not a shrunken item. Where an item has more
 *    parts than read at this size — seven sequence terms, five options — the miniature
 *    shows the tail of the pattern and the blank, because the blank is the thing that
 *    tells you what the format asks of you.
 *
 * It is deliberately not decorative artwork: the same generator draws it as draws the
 * question, which is why the card cannot advertise something the drill does not deliver.
 */
import FigureView from './FigureView';
import GridView from './GridView';
import type { CellGrid, Figure, Item } from '../lib/types';

interface Props {
  item: Item;
  /**
   * Accessible name for the whole miniature. Omit inside a card that already names the
   * format in text — a second reading of "Matrix reasoning" is noise, not access.
   */
  label?: string;
}

/** Enough terms to show the pattern turning over, few enough to stay readable. */
const SEQUENCE_TAIL = 3;
/** Figural options shown side by side before the row gets too dense to read. */
const SET_LIMIT = 4;

export default function ItemThumb({ item, label }: Props) {
  return (
    <div
      class="thumb"
      data-thumb={item.type}
      role={label ? 'img' : 'presentation'}
      aria-label={label}
      aria-hidden={label ? undefined : 'true'}
    >
      <ThumbBody item={item} />
    </div>
  );
}

function ThumbBody({ item }: { item: Item }) {
  const s = item.stimulus;

  switch (s.kind) {
    case 'matrix':
      return (
        <div class="thumb-matrix">
          {s.cells.map((cell, i) => (
            <div class="thumb-matrix-cell" key={i} data-blank={String(cell === null)}>
              {cell === null ? <span class="thumb-blank">?</span> : <Mini figure={cell} />}
            </div>
          ))}
        </div>
      );

    case 'sequence': {
      // The head of a long sequence is the least informative part of it: what a reader
      // needs to see is a couple of steps and then the gap.
      const shown = s.terms.slice(-(SEQUENCE_TAIL + 1));
      const elided = s.terms.length > shown.length;
      return (
        <div class="thumb-seq">
          {elided && <span class="thumb-ellipsis">…</span>}
          {shown.map((term, i) => (
            <span class="thumb-term" key={i} data-blank={String(term === null)}>
              {term ?? '?'}
            </span>
          ))}
        </div>
      );
    }

    /*
     * Odd-one-out has no stimulus of its own — the options *are* the question — so the
     * miniature has to be built from them. Anything else would show an empty card for the
     * one format whose whole nature is "compare these figures".
     */
    case 'none':
      return (
        <div class="thumb-row">
          {item.options.slice(0, SET_LIMIT).map((option, i) => (
            <div class="thumb-slot" key={i}>
              {option.kind === 'figure' ? <Mini figure={option.figure} /> : null}
            </div>
          ))}
        </div>
      );

    case 'figure-set':
      return (
        <div class="thumb-row">
          {s.figures.slice(0, SET_LIMIT).map((figure, i) => (
            <div class="thumb-slot" key={i}>
              <Mini figure={figure} />
            </div>
          ))}
        </div>
      );

    case 'analogy':
      return (
        <div class="thumb-row">
          <div class="thumb-slot">
            <Mini figure={s.a} />
          </div>
          <span class="thumb-op">→</span>
          <div class="thumb-slot">
            <Mini figure={s.b} />
          </div>
          <span class="thumb-op">::</span>
          <div class="thumb-slot">
            <Mini figure={s.c} />
          </div>
          <span class="thumb-op">→</span>
          <div class="thumb-slot" data-blank="true">
            <span class="thumb-blank">?</span>
          </div>
        </div>
      );

    /*
     * The only format made of words. Showing the real premises — invented category names
     * and all — is the point: it tells a reader at a glance that this one is read, not
     * looked at, which is exactly the distinction the card has to make.
     */
    case 'text':
      return (
        <div class="thumb-text">
          {s.lines.map((line, i) => (
            <span class="thumb-line" key={i}>
              {line}
            </span>
          ))}
          {/* The blank the reader has to fill, in the same shape as the premises above. */}
          <span class="thumb-line thumb-line--blank">?</span>
        </div>
      );

    /* Target, then the same shape turned. The distinction the task rests on is visible. */
    case 'grid': {
      const answer = item.options[item.answerIndex];
      return (
        <div class="thumb-row">
          <div class="thumb-slot thumb-slot--wide">
            <GridView grid={s.grid} className="thumb-svg" />
          </div>
          <span class="thumb-op" aria-hidden="true">
            ↻
          </span>
          <div class="thumb-slot thumb-slot--wide">
            {answer?.kind === 'grid' ? (
              <GridView grid={answer.grid} variant={answer.variant ?? 'solid'} className="thumb-svg" />
            ) : null}
          </div>
        </div>
      );
    }

    /* The folded, punched sheet, then the sheet opened out again. */
    case 'paper-folding': {
      const answer = item.options[item.answerIndex];
      return (
        <div class="thumb-row">
          <div class="thumb-slot thumb-slot--wide">
            <GridView grid={foldedSheet(s.folds, s.punches, s.size)} variant="holes" className="thumb-svg" />
          </div>
          <span class="thumb-op" aria-hidden="true">
            →
          </span>
          <div class="thumb-slot thumb-slot--wide">
            {answer?.kind === 'grid' ? (
              <GridView grid={answer.grid} variant="holes" className="thumb-svg" />
            ) : null}
          </div>
        </div>
      );
    }

    case 'span':
      return (
        <div class="thumb-seq">
          {s.sequence.map((element, i) => (
            <span class="thumb-term" key={i}>
              {element}
            </span>
          ))}
        </div>
      );

    /*
     * One premise and the unknown pan. The blank is what tells a reader at card size that
     * this format asks them to *complete* a balance rather than just look at scales.
     */
    case 'figure-weights':
      return (
        <div class="thumb-weights">
          {s.premises[0] && (
            <div class="thumb-row thumb-row--tight">
              <div class="thumb-slot">
                <Mini figure={s.premises[0].left} />
              </div>
              <span class="thumb-op" aria-hidden="true">
                =
              </span>
              <div class="thumb-slot">
                <Mini figure={s.premises[0].right} />
              </div>
            </div>
          )}
          <div class="thumb-row thumb-row--tight">
            <div class="thumb-slot">
              <Mini figure={s.target} />
            </div>
            <span class="thumb-op" aria-hidden="true">
              =
            </span>
            <div class="thumb-slot" data-blank="true">
              <span class="thumb-blank">?</span>
            </div>
          </div>
        </div>
      );

    /*
     * The stream, with the first matching pair marked. A row of letters alone would not say
     * what the format asks; the mark is the difference between "letters" and "n-back".
     */
    case 'n-back': {
      const shown = s.sequence.slice(0, SET_LIMIT);
      let pair: [number, number] | null = null;
      for (let i = s.n; i < shown.length && pair === null; i++) {
        if (shown[i] === shown[i - s.n]) pair = [i - s.n, i];
      }
      return (
        <div class="thumb-seq">
          {shown.map((element, i) => (
            <span
              class="thumb-term"
              key={i}
              data-thumb-match={String(pair !== null && (i === pair[0] || i === pair[1]))}
            >
              {element}
            </span>
          ))}
        </div>
      );
    }

    /*
     * The script as signed steps with its running total under them. Drawing the figures at card
     * size would be a row of specks, and the arrows alone would not say what is being tracked —
     * the total is the thing the format asks for, so the total is what the miniature shows.
     */
    /*
     * The glyphs, and nothing else. No count and no label: a card that showed the answer would give
     * away the one thing the format asks, and the tension between "which digit" and "how many" is
     * legible from the row on its own.
     */
    case 'interference':
      return (
        <div class="thumb-glyphs">
          {s.glyphs.map((glyph, i) => (
            <span class="thumb-glyph" key={i}>
              {glyph}
            </span>
          ))}
        </div>
      );

    /*
     * The expression itself, at card size. The one format whose stimulus needs no reduction to fit
     * a miniature — it is already one short line, so the thumbnail is the item.
     */
    case 'expression':
      return (
        <div class="thumb-expression">
          <span class="thumb-expression-text">{s.expression}</span>
          <span class="thumb-expression-blank" aria-hidden="true">
            = ?
          </span>
        </div>
      );

    case 'head-count': {
      let running = 0;
      /*
       * Each step and its resulting total share one column, rather than sitting in two
       * independent rows. Two rows was the first attempt and it did not line up: the chips and
       * the bare numbers have different widths, so the totals drifted out of correspondence
       * with the steps they belong to — which is the one relationship the miniature exists to
       * show. Pairing them in a column makes the alignment structural.
       */
      const steps = s.events.slice(0, SET_LIMIT).map((delta) => ({ delta, total: (running += delta) }));
      return (
        <div class="thumb-heads">
          {steps.map(({ delta, total }, i) => (
            <div class="thumb-heads-step" key={i}>
              <span class="thumb-term" data-thumb-sign={delta > 0 ? 'in' : 'out'}>
                {delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`}
              </span>
              <span class="thumb-heads-total">{total}</span>
            </div>
          ))}
        </div>
      );
    }

    case 'symbol-search':
      return (
        <div class="thumb-search">
          <div class="thumb-row thumb-row--tight">
            {s.targets.map((figure, i) => (
              <div class="thumb-slot" key={i}>
                <Mini figure={figure} />
              </div>
            ))}
          </div>
          <span class="thumb-rule" aria-hidden="true" />
          <div class="thumb-row thumb-row--tight">
            {s.search.slice(0, SET_LIMIT).map((figure, i) => (
              <div class="thumb-slot" key={i}>
                <Mini figure={figure} />
              </div>
            ))}
          </div>
        </div>
      );

    /*
     * The digit is what makes this miniature legible as *coding* rather than as another row
     * of symbols, so each pair keeps its digit even at card size. Capped at SET_LIMIT for
     * the same reason as the search row: a nine-column key drawn at 10rem is a smudge.
     */
    case 'coding':
      return (
        <div class="thumb-coding">
          {s.pairs.slice(0, SET_LIMIT).map((pair) => (
            <div class="thumb-coding-pair" key={pair.digit}>
              <span class="thumb-coding-digit">{pair.digit}</span>
              <div class="thumb-slot">
                <Mini figure={pair.figure} />
              </div>
            </div>
          ))}
        </div>
      );
  }
}

/** A figure with no accessible name of its own; the miniature as a whole carries one. */
function Mini({ figure }: { figure: Figure }) {
  return <FigureView figure={figure} className="thumb-svg" />;
}

/**
 * The folded sheet, with the punches marked where they were made.
 *
 * Reconstructed from the fold list rather than carried on the stimulus, because the
 * stimulus states the *sheet* size and the folds — the folded dimensions are a consequence
 * of them, and deriving it here keeps the single source of truth in the generator.
 */
function foldedSheet(
  folds: readonly ('left' | 'right' | 'top' | 'bottom')[],
  punches: readonly { x: number; y: number }[],
  size: number,
): CellGrid {
  let rows = size;
  let cols = size;
  for (const fold of folds) {
    if (fold === 'left' || fold === 'right') cols = Math.max(1, cols / 2);
    else rows = Math.max(1, rows / 2);
  }
  const cells = new Array<boolean>(rows * cols).fill(false);
  for (const p of punches) {
    if (p.y < rows && p.x < cols) cells[p.y * cols + p.x] = true;
  }
  return { rows, cols, cells };
}
