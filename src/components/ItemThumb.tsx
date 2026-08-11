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
import ClockFaceView from './ClockFaceView';
import HandView from './HandView';
import { DEFAULT_LOCALE, type Locale } from '../lib/i18n';
import type { CellGrid, Figure, Item } from '../lib/types';

interface Props {
  item: Item;
  /**
   * Accessible name for the whole miniature. Omit inside a card that already names the
   * format in text — a second reading of "Matrix reasoning" is noise, not access.
   */
  label?: string;
  /**
   * Only reaches the few miniatures built from a component that names itself — the clock and the
   * hand. Nothing announces those names (the miniature as a whole is `aria-hidden` or carries its
   * own), but they are still text in the page, and shipping English inside a French card is the
   * kind of small wrongness nobody ever goes back and fixes.
   */
  locale?: Locale;
}

/** Enough terms to show the pattern turning over, few enough to stay readable. */
const SEQUENCE_TAIL = 3;
/** Figural options shown side by side before the row gets too dense to read. */
const SET_LIMIT = 4;

export default function ItemThumb({ item, label, locale = DEFAULT_LOCALE }: Props) {
  return (
    <div
      class="thumb"
      data-thumb={item.type}
      role={label ? 'img' : 'presentation'}
      aria-label={label}
      aria-hidden={label ? undefined : 'true'}
    >
      <ThumbBody item={item} locale={locale} />
    </div>
  );
}

function ThumbBody({ item, locale }: { item: Item; locale: Locale }) {
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
     * The board with its path drawn through it. The line is not decoration: a scatter of numbered
     * circles could be any format, and it is the wandering path that says "join these in order".
     */
    case 'trail': {
      const points = s.nodes.map((n) => ({ x: 8 + n.x * 84, y: 8 + n.y * 84, label: n.label }));
      return (
        <svg class="thumb-trail" viewBox="0 0 100 100" role="presentation">
          <polyline
            points={points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
            fill="none"
            stroke="currentColor"
            stroke-width="1.4"
            stroke-opacity="0.4"
            stroke-linejoin="round"
          />
          {points.map((p, i) => (
            <g key={i}>
              {/* Unfilled: a miniature may paint only currentColor, none, or a pattern (see previews.spec). */}
              <circle cx={p.x} cy={p.y} r={6} fill="none" stroke="currentColor" stroke-width="1.2" />
              <text
                x={p.x}
                y={p.y}
                text-anchor="middle"
                dominant-baseline="central"
                font-size="6"
                font-weight="700"
                fill="currentColor"
              >
                {p.label}
              </text>
            </g>
          ))}
        </svg>
      );
    }

    /*
     * The board with the lit order numbered on it — which is the answer, and that is correct here.
     *
     * A card is an advertisement, not an item: it has to say what the format asks of you, and a
     * scatter of blank circles says nothing at all. The numbers are what make it legible as "this
     * order, then reproduce it". Live items never draw them until the answer is out.
     */
    case 'block-span': {
      /*
       * A wide box rather than the square the live board is drawn in.
       *
       * The card slot is about 300 by 84, so a square drawing can never be wider than 84px however
       * it is scaled: the height binds first, two thirds of the card stays empty, and the order
       * numbers come out too small to read. Spreading the layout horizontally costs the board's true
       * proportions and buys legibility — the same trade the social card already makes by mapping the
       * unit box onto its own stage — and nothing about what the format asks depends on the board
       * being square. The height is what it is: nine blocks and their numbers inside 5.25rem is the
       * floor this slot imposes on every scattered-board format, the trail card included.
       */
      const points = s.blocks.map((b) => ({ x: 12 + b.x * 176, y: 11 + b.y * 63 }));
      const order = new Map(s.sequence.map((index, position) => [index, position + 1]));
      return (
        <svg class="thumb-blocks" viewBox="0 0 200 85" role="presentation">
          <polyline
            points={s.sequence.map((i) => `${points[i]!.x.toFixed(1)},${points[i]!.y.toFixed(1)}`).join(' ')}
            fill="none"
            stroke="currentColor"
            stroke-width="1.4"
            stroke-opacity="0.4"
            stroke-linejoin="round"
          />
          {points.map((p, i) => (
            <g key={i} opacity={order.has(i) ? 1 : 0.35}>
              {/* Unfilled: a miniature may paint only currentColor, none, or a pattern. */}
              <rect
                x={p.x - 9}
                y={p.y - 9}
                width={18}
                height={18}
                rx={3.5}
                fill="none"
                stroke="currentColor"
                stroke-width="1.4"
              />
              {order.has(i) && (
                <text
                  x={p.x}
                  y={p.y}
                  text-anchor="middle"
                  dominant-baseline="central"
                  font-size="10"
                  font-weight="700"
                  fill="currentColor"
                >
                  {order.get(i)}
                </text>
              )}
            </g>
          ))}
        </svg>
      );
    }

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

    /*
     * The pyramid, base filled and the rest blank. The *shape* is what identifies this format at
     * card size — a triangle of cells narrowing to one — so the miniature draws every row rather
     * than a sample of them, which it can afford: three rows is the whole item.
     */
    case 'pyramid': {
      const depth = s.base.length;
      return (
        <div class="thumb-pyramid">
          {Array.from({ length: depth }, (_, d) => (
            <div class="thumb-pyramid-row" key={d}>
              {Array.from({ length: d + 1 }, (_, i) =>
                d + 1 === depth ? (
                  <span class="thumb-term" key={i}>
                    {s.base[i]}
                  </span>
                ) : (
                  <span class="thumb-term" key={i} data-blank="true">
                    ?
                  </span>
                ),
              )}
            </div>
          ))}
        </div>
      );
    }

    /*
     * The two numerals at the sizes they were drawn at. That is the entire item, and the miniature
     * can show it whole — the conflict is legible at any size, because it is a *relation* between
     * the two rather than a property of either.
     */
    case 'high-number':
      return (
        <div class="thumb-numerals">
          {s.candidates.map((candidate, i) => (
            <span class="thumb-numeral" key={i} data-scale={String(candidate.scale)}>
              {candidate.value}
            </span>
          ))}
        </div>
      );

    /*
     * The dial, or both dials. Nothing is reduced: a clock face is already the smallest complete
     * statement of what these two formats ask, and shrinking one only shrinks it.
     */
    case 'clock':
      return (
        <div class="thumb-clocks">
          {s.faces.map((face, i) => (
            <ClockFaceView key={i} face={face} locale={locale} className="thumb-svg" />
          ))}
        </div>
      );

    /*
     * The hand, and the blank that says a hand is expected back. Without the blank the card is a
     * picture of a fist, which advertises nothing.
     */
    case 'hands':
      return (
        <div class="thumb-row">
          <div class="thumb-slot thumb-slot--wide">
            <HandView hand={s.hand} locale={locale} className="thumb-svg" />
          </div>
          <span class="thumb-op" aria-hidden="true">
            →
          </span>
          <div class="thumb-slot" data-blank="true">
            <span class="thumb-blank">?</span>
          </div>
        </div>
      );

    /*
     * The terms with a sum sign where the answer goes. Drawn as a sum rather than as a row of
     * numbers, because a row of numbers is what `span` looks like — what makes this format itself is
     * that they have to be added, and the miniature has to say so.
     */
    case 'math-recall': {
      const parts = s.terms.flatMap((term, i) => (i === 0 ? [String(term)] : ['+', String(term)]));
      return (
        <div class="thumb-seq">
          {parts.map((part, i) =>
            part === '+' ? (
              <span class="thumb-op" key={i} aria-hidden="true">
                +
              </span>
            ) : (
              <span class="thumb-term" key={i}>
                {part}
              </span>
            ),
          )}
          <span class="thumb-op" aria-hidden="true">
            =
          </span>
          <span class="thumb-term" data-blank="true">
            ?
          </span>
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
