/**
 * The trail-making board: the site's only item answered by a *sequence* of clicks.
 *
 * Every other format collects one decision. This collects a path, times the whole thing as a unit,
 * and reports how many clicks went astray — so it owns its own progress state and tells the runner
 * only when the trail is finished.
 *
 * ## Why a wrong click does not end the run
 *
 * The real task lets the examiner say "no, that one" and the participant carries on; the score is
 * the time, which the correction is already inside. Ending the item on a mistake would turn a timed
 * task into a single-shot accuracy task and throw away the measurement.
 *
 * ## Why the path is drawn behind the nodes
 *
 * It is feedback that costs nothing to read: the reader can see where they have been without
 * counting, which is what the examiner's pencil line does in the paper version. It also makes a lost
 * place recoverable — the end of the line is where you are.
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { dict, type Locale } from '../lib/i18n';
import type { TrailNode } from '../lib/types';
/*
 * Imported rather than restated. The placement is built around this radius — targets are inset by one
 * and separated by more than two — so a second copy of the number would eventually disagree, and the
 * disagreement would surface as overlapping targets rather than as a type error.
 */
import { NODE_RADIUS } from '../lib/generators/trail-making';

interface Props {
  nodes: TrailNode[];
  locale: Locale;
  /** Fires once, when the last target is reached. Carries the clicks that went astray. */
  onComplete: (misses: number) => void;
  /** True once the item has been submitted, so the finished board stays readable but inert. */
  frozen: boolean;
}

export default function TrailBoard({ nodes, locale, onComplete, frozen }: Props) {
  const t = dict(locale).gen.trailMaking;
  const [progress, setProgress] = useState(0);
  const [misses, setMisses] = useState(0);
  /** The last wrong click, for a brief mark. Keyed by a counter so repeats re-animate. */
  const [wrong, setWrong] = useState<{ index: number; at: number } | null>(null);

  const key = nodes.map((n) => n.label).join('');
  useEffect(() => {
    setProgress(0);
    setMisses(0);
    setWrong(null);
  }, [key]);

  /*
   * `onComplete` is called from the click handler rather than from an effect watching `progress`.
   * An effect would fire again on any re-render that happened to leave progress at the end — and
   * more importantly it would fire after the parent had already advanced, submitting a second
   * response for an item that was gone.
   */
  const completeRef = useRef(onComplete);
  completeRef.current = onComplete;

  /*
   * Rendered in a stable shuffled order rather than in path order. The DOM order is the tab order,
   * and a tab order that walks the correct path would hand the whole task to anyone pressing Tab.
   * Derived from the labels so it is stable across re-renders but different per item.
   */
  const renderOrder = useMemo(() => {
    const indices = nodes.map((_, i) => i);
    // A tiny deterministic shuffle: sort by a hash of the label, which has no relation to the path.
    return indices.sort((a, b) => hash(nodes[a]!.label) - hash(nodes[b]!.label));
  }, [key]);

  const done = progress >= nodes.length;

  function click(index: number) {
    if (frozen || done) return;
    if (index === progress) {
      const next = progress + 1;
      setProgress(next);
      if (next >= nodes.length) completeRef.current(misses);
      return;
    }
    // Already-joined targets are inert rather than wrong: re-clicking one is not a mistake.
    if (index < progress) return;
    setMisses((m) => m + 1);
    setWrong({ index, at: performance.now() });
  }

  const joined = nodes.slice(0, Math.max(1, progress));
  const path = joined.map((n) => `${(n.x * 100).toFixed(2)},${(n.y * 100).toFixed(2)}`).join(' ');

  return (
    <div
      class="trail"
      /* The board is both the stimulus and the response surface, so it carries the stimulus marker
         the generic per-format contract test looks for. Rendering a second inert copy above it would
         be confusing and would look clickable. */
      data-stimulus="trail"
      data-testid="trail-board"
      data-trail-progress={String(progress)}
      data-trail-misses={String(misses)}
    >
      <div class="trail-status" role="status" aria-live="polite">
        <span class="trail-next" data-testid="trail-next">
          {done ? t.done : t.next(nodes[progress]!.label)}
        </span>
        <span class="subtle trail-progress">{t.progress(progress, nodes.length)}</span>
        {misses > 0 && (
          <span class="tag trail-misses" data-testid="trail-misses">
            {t.misses(misses)}
          </span>
        )}
      </div>

      <div class="trail-board">
        {/*
          * The path is a sibling of the buttons rather than their background, so it can never
          * intercept a click — `pointer-events: none` in the stylesheet, and behind them in z-order.
          */}
        <svg class="trail-path" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {progress > 1 && (
            <polyline points={path} fill="none" stroke="currentColor" stroke-width="0.6" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
          )}
        </svg>

        {renderOrder.map((index) => {
          const node = nodes[index]!;
          const state = index < progress ? 'joined' : index === progress ? 'next' : 'waiting';
          return (
            <button
              key={node.label}
              type="button"
              class="trail-node"
              data-testid={`trail-node-${node.label}`}
              data-trail-state={state}
              data-trail-wrong={wrong?.index === index ? String(wrong.at) : undefined}
              disabled={frozen}
              style={{
                left: `${node.x * 100}%`,
                top: `${node.y * 100}%`,
                /* A bare number, consumed as `cqw` in the stylesheet: the diameter as a share of
                   the board's width, which is the unit the generator's separation is expressed in. */
                '--trail-size': String(NODE_RADIUS * 200),
              } as never}
              onClick={() => click(index)}
              aria-label={t.nodeLabel(node.label)}
              aria-current={state === 'next' ? 'step' : undefined}
            >
              {node.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** FNV-1a over a label. Only used to order the DOM, never to place anything. */
function hash(label: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < label.length; i++) {
    h ^= label.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
