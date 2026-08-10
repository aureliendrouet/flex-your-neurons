/**
 * Renders any Stimulus variant. One component per item family keeps the quiz runner free
 * of format-specific logic.
 */
import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import FigureView, { describeFigure } from './FigureView';
import GridView from './GridView';
import { dict, type Locale } from '../lib/i18n';
import type { Figure, Fold, Presentation, Stimulus } from '../lib/types';

interface Props {
  stimulus: Stimulus;
  locale: Locale;
  presentation?: Presentation;
  /** Fires when a transient stimulus (digit span) has finished playing. */
  onPresentationDone?: () => void;
  reducedMotion?: boolean;
}

export default function StimulusView({
  stimulus,
  locale,
  presentation,
  onPresentationDone,
  reducedMotion,
}: Props) {
  const t = dict(locale).quiz;
  switch (stimulus.kind) {
    case 'none':
      return null;

    case 'matrix':
      return (
        <div class="matrix-grid" data-stimulus="matrix" role="group" aria-label={t.patternMatrix}>
          {stimulus.cells.map((cell, i) => (
            <div class="matrix-cell" key={i} data-cell-index={String(i)} data-blank={String(cell === null)}>
              {cell === null ? (
                <span aria-label={t.missingCell}>?</span>
              ) : (
                <FigureView figure={cell} label={t.cellLabel(i + 1, describeFigure(cell, locale))} />
              )}
            </div>
          ))}
        </div>
      );

    case 'sequence':
      return (
        <div data-stimulus="sequence" class="seq-row">
          {stimulus.terms.map((term, i) => (
            <span key={i} class="seq-term" data-term={term ?? '?'} data-blank={String(term === null)}>
              {term ?? '?'}
            </span>
          ))}
        </div>
      );

    case 'text':
      return (
        <div data-stimulus="text" class="card premises">
          <ol class="premises-list">
            {stimulus.lines.map((line, i) => (
              <li key={i} data-premise={String(i)}>
                {line}
              </li>
            ))}
          </ol>
        </div>
      );

    case 'analogy':
      return (
        <div data-stimulus="analogy" class="analogy-row">
          <AnalogyCell figure={stimulus.a} label={t.figureLabels.first} locale={locale} />
          <Arrow />
          <AnalogyCell figure={stimulus.b} label={t.figureLabels.second} locale={locale} />
          <span class="subtle analogy-op" aria-hidden="true">
            ::
          </span>
          <AnalogyCell figure={stimulus.c} label={t.figureLabels.third} locale={locale} />
          <Arrow />
          <div class="matrix-cell analogy-cell analogy-cell--blank" data-blank="true">
            <span aria-label={t.missingFigure}>?</span>
          </div>
        </div>
      );

    case 'grid':
      return (
        <div data-stimulus="grid" class="grid-stimulus">
          <div class="grid-stimulus-inner">
            <GridView grid={stimulus.grid} label={t.figureLabels.target} />
          </div>
        </div>
      );

    case 'paper-folding':
      return (
        <PaperFolding
          folds={stimulus.folds}
          punches={stimulus.punches}
          size={stimulus.size}
          locale={locale}
        />
      );

    case 'symbol-search':
      return (
        <div data-stimulus="symbol-search" class="symbol-search">
          <SymbolRow
            title={t.figureLabels.targets}
            figures={stimulus.targets}
            testid="targets"
            locale={locale}
          />
          <SymbolRow
            title={t.figureLabels.searchGroup}
            figures={stimulus.search}
            testid="search"
            locale={locale}
          />
        </div>
      );

    case 'figure-weights':
      return (
        <div data-stimulus="figure-weights" class="weights">
          <div>
            <p class="subtle symbol-row-title">{t.weights.premisesLabel}</p>
            <div class="weights-premises">
              {stimulus.premises.map((premise, i) => (
                <Balance
                  key={i}
                  left={premise.left}
                  right={premise.right}
                  locale={locale}
                  label={t.weights.premiseLabel(i + 1)}
                />
              ))}
            </div>
          </div>
          <div>
            <p class="subtle symbol-row-title">{t.weights.targetLabel}</p>
            <Balance
              left={stimulus.target}
              right={null}
              locale={locale}
              label={t.weights.targetLabel}
            />
          </div>
        </div>
      );

    case 'coding':
      return (
        <div data-stimulus="coding" class="coding">
          <div>
            <p class="subtle symbol-row-title">{t.coding.keyLabel}</p>
            <div class="coding-key" data-coding-key>
              {stimulus.pairs.map((pair) => (
                <div
                  key={pair.digit}
                  class="coding-pair"
                  data-coding-digit={pair.digit}
                  data-coding-probe={String(pair.digit === stimulus.probe)}
                >
                  <span class="coding-digit">{pair.digit}</span>
                  <div class="coding-symbol">
                    <FigureView
                      figure={pair.figure}
                      label={t.coding.pairLabel(pair.digit, describeFigure(pair.figure, locale))}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
          {/*
            * The probe is repeated below the key rather than only named in the prompt. The
            * prompt is a heading the eye leaves as soon as it starts scanning, and having
            * to look back up to remember which digit you are hunting adds a memory load
            * this format is not trying to measure. Restating the digit is not a hint —
            * *finding* it in the key is the task, so its column is never marked.
            */}
          <p class="coding-probe">
            <span class="subtle coding-probe-label">{t.coding.probeLabel}</span>
            <span class="coding-probe-digit" data-coding-probe-digit>
              {stimulus.probe}
            </span>
          </p>
        </div>
      );

    case 'span':
      return (
        <StreamPlayer
          kind="span"
          sequence={stimulus.sequence}
          presentation={presentation}
          reducedMotion={reducedMotion}
          onDone={onPresentationDone}
          locale={locale}
          readyText={t.spanReady(stimulus.sequence.length)}
          doneText={t.nowTypeItBack}
        />
      );

    case 'n-back':
      return (
        <StreamPlayer
          kind="n-back"
          sequence={stimulus.sequence}
          presentation={presentation}
          reducedMotion={reducedMotion}
          onDone={onPresentationDone}
          locale={locale}
          readyText={t.nBackReady(stimulus.sequence.length, stimulus.n)}
          doneText={t.nBackDone}
        />
      );

    /*
     * The expression, shown whole. It carries no `presentation` and no gate: this is the one format
     * meant to be answered in a couple of seconds, so anything between painting and answering is
     * pure overhead on a measurement about calculation.
     */
    case 'expression':
      return (
        <div data-stimulus="expression" class="expression-stage">
          <span class="expression-text" data-expression={stimulus.expression}>
            {stimulus.expression}
          </span>
          <span class="expression-blank" aria-hidden="true">
            = ?
          </span>
        </div>
      );

    case 'head-count':
      return (
        <StreamPlayer<number>
          kind="head-count"
          sequence={stimulus.events}
          presentation={presentation}
          reducedMotion={reducedMotion}
          onDone={onPresentationDone}
          locale={locale}
          readyText={t.headCountReady(stimulus.events.length)}
          doneText={t.headCountDone}
          renderElement={(delta) => <Movement delta={delta} locale={locale} />}
        />
      );
  }
}

/**
 * One step of the head-count stream: a group of figures, and which way they are going.
 *
 * ## Why a sign rather than an arrow
 *
 * The first version drew an arrow beside the group, pointing right to arrive and left to
 * leave, with the row reversed so the arrow trailed a departing group. Rendered, both
 * directions came out as an arrow pointing *at* the figures — the only difference was which
 * side of them it sat on. For a frame that is on screen for under a second and never repeats,
 * that is not a distinction anyone can be asked to make, and getting it wrong is a perception
 * failure rather than the memory failure this format exists to measure.
 *
 * A sign cannot be misread the way a mirrored arrow can, and it is reinforced by a second,
 * non-positional channel: arriving figures are solid, leaving figures are hollow. Neither
 * channel is colour, so neither depends on the reader's colour vision.
 */
function Movement({ delta, locale }: { delta: number; locale: Locale }) {
  const t = dict(locale).quiz.headCount;
  const arriving = delta > 0;
  const n = Math.abs(delta);
  return (
    <span class="movement" data-movement={arriving ? 'in' : 'out'} data-movement-count={String(n)}>
      {/* A true minus sign, not a hyphen: at this size a hyphen reads as a dash between
          things rather than as an operator. */}
      <span class="movement-sign" aria-hidden="true">
        {arriving ? '+' : '−'}
      </span>
      <span class="movement-figures" aria-hidden="true">
        {Array.from({ length: n }, (_, i) => (
          <svg key={i} class="movement-figure" viewBox="0 0 14 22" role="presentation">
            {/* A head and a body: legible at 20px, and unmistakably a person rather than a
                dot, which matters because the count is read at a glance. The viewBox carries
                a unit of padding so the stroked (leaving) variant is not clipped. */}
            <circle cx="7" cy="5" r="3.2" />
            <path d="M7 9 C3.4 9 2.2 12 2.2 20 L11.8 20 C11.8 12 10.6 9 7 9 Z" />
          </svg>
        ))}
      </span>
      <span class="sr-only">{arriving ? t.arriving(n) : t.leaving(n)}</span>
    </span>
  );
}

function Arrow() {
  return (
    <span class="subtle analogy-op" aria-hidden="true">
      →
    </span>
  );
}

function AnalogyCell({
  figure,
  label,
  locale,
}: {
  figure: Parameters<typeof FigureView>[0]['figure'];
  label: string;
  locale: Locale;
}) {
  return (
    <div class="matrix-cell card analogy-cell">
      <FigureView figure={figure} label={`${label}: ${describeFigure(figure, locale)}`} />
    </div>
  );
}

function SymbolRow({
  title,
  figures,
  testid,
  locale,
}: {
  title: string;
  figures: Parameters<typeof FigureView>[0]['figure'][];
  testid: string;
  locale: Locale;
}) {
  return (
    <div>
      <p class="subtle symbol-row-title">{title}</p>
      <div data-symbol-row={testid} class="symbol-row">
        {figures.map((f, i) => (
          <div key={i} class="symbol-slot">
            <FigureView figure={f} label={`${title} ${i + 1}: ${describeFigure(f, locale)}`} />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * One balance scale: two pans and a fulcrum, or one pan and a blank to be filled.
 *
 * The pans are ordinary `grid2x2` figures, so the objects in them are drawn by exactly the
 * renderer that draws every other figure on the site — same sizes, same textures, same
 * `data-*` hooks. Only the beam and the fulcrum are new, and they are inline SVG rather than
 * a glyph so they inherit `currentColor` and scale with the box.
 *
 * The beam is drawn level in both states. A tilted beam would be a second, wordless claim
 * about which side is heavier, and for the target scale that claim would give the answer away.
 */
function Balance({
  left,
  right,
  locale,
  label,
}: {
  left: Figure;
  /** `null` draws the empty pan the reader has to fill. */
  right: Figure | null;
  locale: Locale;
  label: string;
}) {
  const t = dict(locale).quiz;
  return (
    <div class="weights-scale" role="group" aria-label={label} data-weights-scale>
      <div class="weights-pan" data-weights-pan="left">
        <FigureView figure={left} label={describeFigure(left, locale)} />
      </div>
      <svg
        class="weights-beam"
        viewBox="0 0 48 40"
        aria-hidden="true"
        focusable="false"
      >
        <line x1="2" y1="14" x2="46" y2="14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
        <line x1="24" y1="14" x2="24" y2="30" stroke="currentColor" stroke-width="2.5" />
        <polygon points="24,26 33,38 15,38" fill="currentColor" />
      </svg>
      <div class="weights-pan" data-weights-pan="right" data-blank={String(right === null)}>
        {right === null ? (
          <span aria-label={t.missingFigure}>?</span>
        ) : (
          <FigureView figure={right} label={describeFigure(right, locale)} />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Paper folding diagram
// ---------------------------------------------------------------------------

const FOLD_ARROW: Record<Fold, string> = {
  left: '→',
  right: '←',
  top: '↓',
  bottom: '↑',
};

const CELL = 22;
/** Generous enough for the flip arc, which is drawn just outside the sheet. */
const PAD = 20;

interface FoldGeometry {
  /** The fold line itself. */
  line: { x1: number; y1: number; x2: number; y2: number };
  /** The half that lifts and swings over. */
  moving: { x: number; y: number; width: number; height: number };
  /** The flip arc, drawn outside the sheet, from the moving half to where it lands. */
  arc: { sx: number; sy: number; cx: number; cy: number; ex: number; ey: number };
}

/**
 * Where the fold line sits, which half moves, and where that half lands.
 *
 * The three cues have to agree: shading marks the half that moves, the dashed line is the
 * crease it pivots on, and the arc shows it travelling over that crease. Any one of them
 * alone is ambiguous — an arrow with no crease does not say where the paper bends, and a
 * crease with no shading does not say which side lifts.
 */
function foldGeometry(fold: Fold, cols: number, rows: number): FoldGeometry {
  const w = cols * CELL;
  const h = rows * CELL;
  const x0 = PAD;
  const y0 = PAD;
  const midX = x0 + w / 2;
  const midY = y0 + h / 2;
  // The arc clears the sheet edge by this much before curving back.
  const lift = 15;

  if (fold === 'left' || fold === 'right') {
    const line = { x1: midX, y1: y0 - 4, x2: midX, y2: y0 + h + 4 };
    const leftQuarter = x0 + w * 0.25;
    const rightQuarter = x0 + w * 0.75;
    const movingLeft = fold === 'left';
    return {
      line,
      moving: {
        x: movingLeft ? x0 : midX,
        y: y0,
        width: w / 2,
        height: h,
      },
      arc: {
        sx: movingLeft ? leftQuarter : rightQuarter,
        sy: y0 - 3,
        cx: midX,
        cy: y0 - lift,
        ex: movingLeft ? rightQuarter : leftQuarter,
        ey: y0 - 3,
      },
    };
  }

  const line = { x1: x0 - 4, y1: midY, x2: x0 + w + 4, y2: midY };
  const topQuarter = y0 + h * 0.25;
  const bottomQuarter = y0 + h * 0.75;
  const movingTop = fold === 'top';
  return {
    line,
    moving: {
      x: x0,
      y: movingTop ? y0 : midY,
      width: w,
      height: h / 2,
    },
    arc: {
      sx: x0 - 3,
      sy: movingTop ? topQuarter : bottomQuarter,
      cx: x0 - lift,
      cy: midY,
      ex: x0 - 3,
      ey: movingTop ? bottomQuarter : topQuarter,
    },
  };
}

/** Arrowhead at the end of a quadratic curve, pointing along its final tangent. */
function arrowHead(cx: number, cy: number, ex: number, ey: number, size = 5): string {
  const dx = ex - cx;
  const dy = ey - cy;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;
  const back = size * 1.1;
  const side = size * 0.65;
  return [
    `${ex},${ey}`,
    `${ex - ux * back + px * side},${ey - uy * back + py * side}`,
    `${ex - ux * back - px * side},${ey - uy * back - py * side}`,
  ].join(' ');
}

/**
 * One frame of the folding diagram: the sheet at this stage, plus either the fold about
 * to happen or the punches that were made.
 */
function FoldFrame({
  rows,
  cols,
  fold,
  punches,
  label,
}: {
  rows: number;
  cols: number;
  /** `null` on the final frame, which shows the punches instead. */
  fold: Fold | null;
  punches?: { x: number; y: number }[];
  label: string;
}) {
  const w = cols * CELL;
  const h = rows * CELL;
  const viewW = w + PAD * 2;
  const viewH = h + PAD * 2;
  const geom = fold ? foldGeometry(fold, cols, rows) : null;

  const cells: preact.JSX.Element[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push(
        <rect
          key={`c${r}-${c}`}
          x={PAD + c * CELL}
          y={PAD + r * CELL}
          width={CELL}
          height={CELL}
          fill="none"
          stroke="currentColor"
          stroke-width={1}
          stroke-opacity={0.28}
        />,
      );
    }
  }

  return (
    <svg
      viewBox={`0 0 ${viewW} ${viewH}`}
      class="fold-frame"
      // Constant cell size across frames, so the sheet visibly halves at each fold: the
      // width is derived from the sheet's own dimensions, so it has to be inline.
      style={{ '--frame-width': `${viewW / 16}rem` } as never}
      role="img"
      aria-label={label}
      data-grid=""
      data-fold-frame={fold ?? 'punched'}
      data-rows={String(rows)}
      data-cols={String(cols)}
    >
      {/* The half that will swing over. */}
      {geom && (
        <rect
          x={geom.moving.x}
          y={geom.moving.y}
          width={geom.moving.width}
          height={geom.moving.height}
          fill="var(--accent)"
          fill-opacity={0.16}
          data-moving-half=""
        />
      )}

      {/* The sheet outline and its cells. */}
      <rect
        x={PAD}
        y={PAD}
        width={w}
        height={h}
        fill="none"
        stroke="currentColor"
        stroke-width={1.75}
        stroke-opacity={0.75}
      />
      {cells}

      {/* The crease. */}
      {geom && (
        <line
          x1={geom.line.x1}
          y1={geom.line.y1}
          x2={geom.line.x2}
          y2={geom.line.y2}
          stroke="var(--accent)"
          stroke-width={2.25}
          stroke-dasharray="5 3"
          stroke-linecap="round"
          data-fold-line=""
        />
      )}

      {/* The flip: an arc over the crease, from the moving half to where it lands. */}
      {geom && (
        <>
          <path
            d={`M ${geom.arc.sx} ${geom.arc.sy} Q ${geom.arc.cx} ${geom.arc.cy} ${geom.arc.ex} ${geom.arc.ey}`}
            fill="none"
            stroke="var(--accent)"
            stroke-width={1.75}
            stroke-linecap="round"
          />
          <polygon
            points={arrowHead(geom.arc.cx, geom.arc.cy, geom.arc.ex, geom.arc.ey)}
            fill="var(--accent)"
          />
        </>
      )}

      {/* Final frame: the punches, through every layer. */}
      {punches?.map((p, i) => (
        <circle
          key={`p${i}`}
          cx={PAD + p.x * CELL + CELL / 2}
          cy={PAD + p.y * CELL + CELL / 2}
          r={CELL * 0.26}
          fill="currentColor"
          data-hole=""
        />
      ))}
    </svg>
  );
}

function PaperFolding({
  folds,
  punches,
  size,
  locale,
}: {
  folds: Fold[];
  punches: { x: number; y: number }[];
  size: number;
  locale: Locale;
}) {
  const t = dict(locale);

  /*
   * One frame per fold, showing the sheet as it is *before* that fold with the crease and
   * the direction marked, then a final frame of the folded sheet with its punches.
   *
   * The previous version showed only a blank sheet, a couple of text pills, and the end
   * result — which said that a fold happened but never where the crease was or which half
   * moved, so the item was much harder than the reasoning it is supposed to measure.
   */
  const frames: {
    rows: number;
    cols: number;
    fold: Fold | null;
    punches?: { x: number; y: number }[];
    caption: string;
    label: string;
  }[] = [];

  let cols = size;
  let rows = size;
  folds.forEach((fold, i) => {
    frames.push({
      rows,
      cols,
      fold,
      caption: t.gen.paperFolding.foldShort[fold],
      label: t.quiz.figureLabels.foldFrameLabel(i + 1, t.gen.paperFolding.folds[fold]),
    });
    if (fold === 'left' || fold === 'right') cols = cols / 2;
    else rows = rows / 2;
  });

  const layers = 2 ** folds.length;
  frames.push({
    rows,
    cols,
    fold: null,
    punches,
    caption: t.quiz.figureLabels.punched,
    label: t.quiz.figureLabels.punchedFrameLabel(layers),
  });

  return (
    <div data-stimulus="paper-folding" class="fold-strip">
      {frames.map((frame, i) => (
        /*
         * The connector travels with the frame it points at. Left as siblings, a wrap on a
         * narrow screen strands the arrow alone at the end of the previous line.
         */
        <div key={i} class="fold-step">
          {i > 0 && (
            <span class="subtle fold-arrow" aria-hidden="true">
              →
            </span>
          )}
          <figure class="fold-figure" data-fold={frame.fold ?? undefined}>
            <FoldFrame
              rows={frame.rows}
              cols={frame.cols}
              fold={frame.fold}
              punches={frame.punches}
              label={frame.label}
            />
            <figcaption class="subtle fold-caption">
              {frame.fold ? (
                <>
                  <span aria-hidden="true">{FOLD_ARROW[frame.fold]}</span> {frame.caption}
                </>
              ) : (
                <>
                  {frame.caption}
                  <br />
                  <span class="fold-layers">{t.quiz.figureLabels.layers(layers)}</span>
                </>
              )}
            </figcaption>
          </figure>
        </div>
      ))}
    </div>
  );
}

/**
 * Plays a sequence one element at a time, for the two transient formats.
 *
 * The whole point of both is that the sequence is *gone* when you answer, so the elements
 * are unmounted as they pass. Span then asks you to type it back; n-back asks how many
 * repeats went by. Only the surrounding copy differs, so only the copy is a prop — a second
 * player would be the same twenty lines of timers with a different word in the middle, and
 * the two would drift.
 *
 * Playback waits for an explicit start, because these are the only items that can be lost by
 * not looking at the right moment. It used to begin 400ms after the page appeared: a reader
 * who was still orienting — or who had just landed from a link — watched the sequence go by
 * before realising it had begun, and there is deliberately no replay. The gate also makes
 * the task fairer than the timing accident it was, since everyone now starts attending at
 * the moment they chose. Latency is unaffected either way: the response clock is reset by
 * `onDone`, so neither the playback nor the wait before it counts towards the answer.
 */
function StreamPlayer<T>({
  sequence,
  presentation,
  reducedMotion,
  onDone,
  locale,
  kind,
  readyText,
  doneText,
  renderElement,
}: {
  sequence: T[];
  presentation?: Presentation;
  reducedMotion?: boolean;
  onDone?: () => void;
  locale: Locale;
  /** Drives `data-stimulus`, so the e2e suite can tell the formats apart. */
  kind: 'span' | 'n-back' | 'head-count';
  /** Shown on the gate, above the start button: what is about to happen. */
  readyText: string;
  /** Shown once playback has finished: what to do now. */
  doneText: string;
  /**
   * Draws one element. Omitted by the two formats whose elements *are* characters, which get
   * the default single-glyph rendering; supplied by head-count, whose elements are signed
   * counts that have to be drawn rather than printed.
   */
  renderElement?: (element: T) => ComponentChildren;
}) {
  const t = dict(locale).quiz;
  const stepMs = reducedMotion ? 1400 : (presentation?.stepMs ?? 900);
  const gapMs = reducedMotion ? 300 : (presentation?.gapMs ?? 200);
  const [index, setIndex] = useState(-1);
  const [finished, setFinished] = useState(false);
  const [started, setStarted] = useState(false);

  /*
   * Identity of "which stream is this", used to re-arm the gate on a new item. `String` per
   * element rather than `join` on the array, because a signed-number stream joined on the
   * empty string would collapse `[1, -2]` and `[1, -2]` correctly but `[1, 2]` and `[12]`
   * into the same key.
   */
  const key = sequence.map(String).join('|');

  /*
   * A new item must re-arm the gate. This is keyed on the sequence rather than done in the
   * playback effect, because that effect no longer runs on a new item until the reader asks
   * it to — so it is not a place where "reset for the next item" can live.
   */
  useEffect(() => {
    setStarted(false);
    setIndex(-1);
    setFinished(false);
  }, [key]);

  /*
   * Enter starts the sequence, so a whole span drill stays on the keyboard like every other
   * format. The button is a real <button>, so Enter and Space already work once it has
   * focus; this covers the far more common case of not having tabbed to it.
   *
   * There is no clash with the quiz's own Enter binding, which only advances from the
   * `revealed` phase — the gate is by definition still unanswered. The listener is torn down
   * the moment playback starts, so a second Enter cannot restart or double-fire it.
   */
  useEffect(() => {
    if (started) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.repeat) return;
      e.preventDefault();
      setStarted(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [started, key]);

  useEffect(() => {
    if (!started) return;
    setIndex(-1);
    setFinished(false);
    const timers: ReturnType<typeof setTimeout>[] = [];
    let t = 400; // brief settle before the first element
    for (let i = 0; i < sequence.length; i++) {
      timers.push(setTimeout(() => setIndex(i), t));
      t += stepMs;
      timers.push(setTimeout(() => setIndex(-1), t));
      t += gapMs;
    }
    timers.push(
      setTimeout(() => {
        setFinished(true);
        onDone?.();
      }, t),
    );
    return () => timers.forEach(clearTimeout);
    // Re-play whenever the sequence itself changes (i.e. a new item), once started.
  }, [started, key, stepMs, gapMs]);

  return (
    <div
      data-stimulus={kind}
      class="span-stage"
      data-span-finished={String(finished)}
      data-span-started={String(started)}
    >
      {!started ? (
        <div class="span-gate">
          <p class="subtle" data-span-ready>
            {readyText}
          </p>
          {/*
            * The key cap goes inside the button, the way the Next button carries its own —
            * the shortcut belongs to the control, not to a note beside it. `aria-hidden`
            * because a screen reader reads the accessible name, and "Start the sequence
            * return-arrow" is noise; the sheet at `?` is where the bindings are announced.
            */}
          <button
            type="button"
            class="btn btn-primary"
            data-testid="span-start"
            onClick={() => setStarted(true)}
          >
            {t.spanStart} <span aria-hidden="true">↵</span>
          </button>
        </div>
      ) : finished ? (
        <span class="subtle" data-span-prompt>
          {doneText}
        </span>
      ) : renderElement ? (
        /* The drawn variant keeps the same stage box, so the layout does not shift between
           the gate, the elements, and the closing prompt. */
        <span class="span-element span-element--drawn">
          {index >= 0 ? renderElement(sequence[index]!) : null}
        </span>
      ) : (
        <span class="span-element" data-span-element={index >= 0 ? String(sequence[index]) : ''}>
          {index >= 0 ? String(sequence[index]) : ' '}
        </span>
      )}
    </div>
  );
}
