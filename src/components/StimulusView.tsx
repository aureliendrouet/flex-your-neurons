/**
 * Renders any Stimulus variant. One component per item family keeps the quiz runner free
 * of format-specific logic.
 */
import { useEffect, useState } from 'preact/hooks';
import FigureView, { describeFigure } from './FigureView';
import GridView from './GridView';
import { dict, type Locale } from '../lib/i18n';
import type { Fold, Presentation, Stimulus } from '../lib/types';

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
        <div
          data-stimulus="sequence"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.5rem',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          {stimulus.terms.map((term, i) => (
            <span
              key={i}
              data-term={term ?? '?'}
              style={{
                minWidth: '3.25rem',
                padding: '0.6rem 0.75rem',
                textAlign: 'center',
                borderRadius: '0.75rem',
                border: `2px ${term === null ? 'dashed' : 'solid'} var(--border)`,
                background: term === null ? 'var(--bg-sunken)' : 'var(--bg-raised)',
                color: term === null ? 'var(--text-subtle)' : 'var(--text)',
                fontFamily: 'var(--font-mono)',
                fontSize: '1.25rem',
                fontWeight: 600,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {term ?? '?'}
            </span>
          ))}
        </div>
      );

    case 'text':
      return (
        <div data-stimulus="text" class="card" style={{ padding: '1.25rem' }}>
          <ol style={{ margin: 0, paddingLeft: '1.25rem', display: 'grid', gap: '0.5rem' }}>
            {stimulus.lines.map((line, i) => (
              <li key={i} data-premise={String(i)} style={{ fontSize: '1.05rem' }}>
                {line}
              </li>
            ))}
          </ol>
        </div>
      );

    case 'analogy':
      return (
        <div
          data-stimulus="analogy"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.75rem',
            flexWrap: 'wrap',
          }}
        >
          <AnalogyCell figure={stimulus.a} label={t.figureLabels.first} locale={locale} />
          <Arrow />
          <AnalogyCell figure={stimulus.b} label={t.figureLabels.second} locale={locale} />
          <span class="subtle" style={{ fontSize: '1.5rem', padding: '0 0.5rem' }} aria-hidden="true">
            ::
          </span>
          <AnalogyCell figure={stimulus.c} label={t.figureLabels.third} locale={locale} />
          <Arrow />
          <div
            class="matrix-cell"
            data-blank="true"
            style={{ width: '5rem', borderRadius: '0.75rem', border: '2px dashed var(--border)' }}
          >
            <span aria-label={t.missingFigure}>?</span>
          </div>
        </div>
      );

    case 'grid':
      return (
        <div data-stimulus="grid" style={{ display: 'grid', placeItems: 'center' }}>
          <div style={{ width: 'min(11rem, 60vw)' }}>
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
        <div data-stimulus="symbol-search" style={{ display: 'grid', gap: '1rem' }}>
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

    case 'span':
      return (
        <SpanPlayer
          sequence={stimulus.sequence}
          presentation={presentation}
          reducedMotion={reducedMotion}
          onDone={onPresentationDone}
          locale={locale}
        />
      );
  }
}

function Arrow() {
  return (
    <span class="subtle" style={{ fontSize: '1.5rem' }} aria-hidden="true">
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
    <div class="matrix-cell card" style={{ width: '5rem', borderRadius: '0.75rem' }}>
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
      <p class="subtle" style={{ margin: '0 0 0.4rem', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {title}
      </p>
      <div
        data-symbol-row={testid}
        style={{
          display: 'flex',
          gap: '0.5rem',
          flexWrap: 'wrap',
          padding: '0.6rem',
          border: '1px solid var(--border)',
          borderRadius: '0.75rem',
          background: 'var(--bg-raised)',
        }}
      >
        {figures.map((f, i) => (
          <div key={i} style={{ width: '3rem' }}>
            <FigureView figure={f} label={`${title} ${i + 1}: ${describeFigure(f, locale)}`} />
          </div>
        ))}
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
      // Constant cell size across frames, so the sheet visibly halves at each fold.
      style={{ width: `${viewW / 16}rem`, height: 'auto', color: 'var(--text)', flex: 'none' }}
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
    <div
      data-stimulus="paper-folding"
      style={{
        display: 'flex',
        gap: '0.4rem',
        alignItems: 'center',
        justifyContent: 'center',
        flexWrap: 'wrap',
      }}
    >
      {frames.map((frame, i) => (
        /*
         * The connector travels with the frame it points at. Left as siblings, a wrap on a
         * narrow screen strands the arrow alone at the end of the previous line.
         */
        <div
          key={i}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
        >
          {i > 0 && (
            <span class="subtle" style={{ fontSize: '1.35rem', flex: 'none' }} aria-hidden="true">
              →
            </span>
          )}
          <figure
            data-fold={frame.fold ?? undefined}
            style={{ margin: 0, textAlign: 'center', display: 'grid', gap: '0.15rem', justifyItems: 'center' }}
          >
            <FoldFrame
              rows={frame.rows}
              cols={frame.cols}
              fold={frame.fold}
              punches={frame.punches}
              label={frame.label}
            />
            <figcaption class="subtle" style={{ fontSize: '0.72rem', lineHeight: 1.3, maxWidth: '7rem' }}>
              {frame.fold ? (
                <>
                  <span aria-hidden="true">{FOLD_ARROW[frame.fold]}</span> {frame.caption}
                </>
              ) : (
                <>
                  {frame.caption}
                  <br />
                  <span style={{ opacity: 0.8 }}>{t.quiz.figureLabels.layers(layers)}</span>
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
 * Plays a sequence one element at a time. The whole point of a span task is that the
 * sequence is *gone* when you answer, so the elements are unmounted as they pass.
 */
function SpanPlayer({
  sequence,
  presentation,
  reducedMotion,
  onDone,
  locale,
}: {
  sequence: string[];
  presentation?: Presentation;
  reducedMotion?: boolean;
  onDone?: () => void;
  locale: Locale;
}) {
  const t = dict(locale).quiz;
  const stepMs = reducedMotion ? 1400 : (presentation?.stepMs ?? 900);
  const gapMs = reducedMotion ? 300 : (presentation?.gapMs ?? 200);
  const [index, setIndex] = useState(-1);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
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
    // Re-play whenever the sequence itself changes (i.e. a new item).
  }, [sequence.join(''), stepMs, gapMs]);

  return (
    <div
      data-stimulus="span"
      data-span-finished={String(finished)}
      style={{
        display: 'grid',
        placeItems: 'center',
        minHeight: '8rem',
        border: '2px dashed var(--border)',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--bg-sunken)',
      }}
    >
      {finished ? (
        <span class="subtle" data-span-prompt>
          {t.nowTypeItBack}
        </span>
      ) : (
        <span
          data-span-element={index >= 0 ? sequence[index] : ''}
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '3.5rem',
            fontWeight: 700,
            lineHeight: 1,
            color: 'var(--accent)',
          }}
        >
          {index >= 0 ? sequence[index] : ' '}
        </span>
      )}
    </div>
  );
}
