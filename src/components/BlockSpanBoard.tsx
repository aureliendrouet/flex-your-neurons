/**
 * The block-span board: watch the blocks light, then tap them back in order.
 *
 * Like the trail board this is both the stimulus and the response surface, so `StimulusView` draws
 * nothing for this format — a second, inert copy of the board above the live one would be confusing
 * and would look tappable. Unlike the trail board it plays itself first, so it owns the whole
 * lifecycle: a gate, playback, recall, and then a frozen state that shows what the answer was.
 *
 * ## What the board must not tell you
 *
 * Three helpful-looking behaviours are deliberately absent, because each would replace the
 * measurement with an easier one:
 *
 * - **No mark on a tapped block.** Leaving already-tapped blocks highlighted would show the reader
 *   which ones remain, and since a sequence never repeats a block, that narrows the choice at every
 *   step — most of all at the end, where the load is highest. A tap gets a flash that fades, which
 *   confirms it registered without holding the information.
 * - **No verdict during recall.** Nothing says whether a tap was right. Being told would let a
 *   reader recover the sequence by trial and error, which is recognition rather than recall.
 * - **No announcement of the sequence.** The lit state is a data attribute and a style, never
 *   accessible text. Reading the blocks out would convert a spatial task into a verbal one — and,
 *   since a screen reader would say them in order, would also read out the answer. This format is
 *   genuinely unavailable to a reader who cannot see the board, in the same way the rotation and
 *   matrix formats are; announcing it would not fix that, only misreport it.
 *
 * ## What it does allow
 *
 * Undo. A mis-tap on a phone is a slip of the finger rather than a memory failure, and taking the
 * last tap back leaks nothing: it says only "that is not what I meant", not "that was wrong". The
 * absence of any correctness feedback is what makes the affordance safe.
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { dict, type Locale } from '../lib/i18n';
import type { BlockPosition, Presentation } from '../lib/types';
/*
 * Imported rather than restated: the layout guarantee is expressed as "no two centres closer than a
 * diameter", so a second copy of the radius here could disagree with the one the geometry was
 * checked against, and the disagreement would show up as overlapping targets rather than as a type
 * error.
 */
import { BLOCK_RADIUS, encodeTaps } from '../lib/generators/block-span';

interface Props {
  blocks: BlockPosition[];
  /** Indices into `blocks`, in the order they light. */
  sequence: number[];
  presentation?: Presentation;
  reducedMotion?: boolean;
  locale: Locale;
  /** True once the item has been submitted: the board stays readable but inert, and shows the order. */
  frozen: boolean;
  /**
   * Fires when playback ends and tapping becomes possible. The response clock starts here, not at
   * mount — otherwise the time spent watching would be recorded as thinking time, and it grows with
   * difficulty, so the harder items would look like the slower ones by construction.
   */
  onRecallStart: () => void;
  /** Fires once, when the last required tap lands. Carries the tapped sequence, encoded. */
  onComplete: (tapped: string) => void;
}

type Phase = 'gate' | 'watch' | 'recall';

export default function BlockSpanBoard({
  blocks,
  sequence,
  presentation,
  reducedMotion,
  locale,
  frozen,
  onRecallStart,
  onComplete,
}: Props) {
  const t = dict(locale).gen.blockSpan;
  const [phase, setPhase] = useState<Phase>('gate');
  /** Which block is lit right now, or `null` in a gap. Playback state only. */
  const [lit, setLit] = useState<number | null>(null);
  const [taps, setTaps] = useState<number[]>([]);
  /** The last tap, for a brief mark. Keyed by a timestamp so a repeat re-animates. */
  const [pulse, setPulse] = useState<{ index: number; at: number } | null>(null);

  /*
   * Under reduced motion the flashes are slower and longer, following the same policy as the span
   * and n-back players. It does make the item easier, which is a real cost — but flicker at three
   * changes a second is exactly what the setting exists to prevent, and the site never compares one
   * reader's history against another's, so a consistently gentler presentation stays internally
   * comparable.
   */
  /* As in `StimulusView`: the accommodation lengthens the blank between flashes, never the flash
     itself. How long a block is lit is the encoding time the span depends on, and a preference must
     not move it — the board's own docs commit to flash rate being held constant across levels, and a
     setting that overrode it would be that same drift arriving from the other direction. */
  const stepMs = presentation?.stepMs ?? 650;
  const gapMs = reducedMotion ? Math.max(700, (presentation?.gapMs ?? 350) * 2) : (presentation?.gapMs ?? 350);

  /** Identity of "which item is this", for re-arming everything on the next one. */
  const key = sequence.join('|');

  useEffect(() => {
    setPhase('gate');
    setLit(null);
    setTaps([]);
    setPulse(null);
  }, [key]);

  /*
   * `onComplete` and `onRecallStart` are called from the handler and the timer respectively, through
   * refs rather than from an effect watching `taps`. An effect would fire again on any re-render
   * that left the tap count at the target — including after the parent had advanced — and submit a
   * second response for an item that no longer exists. The trail board learned this first.
   */
  const completeRef = useRef(onComplete);
  completeRef.current = onComplete;
  const recallRef = useRef(onRecallStart);
  recallRef.current = onRecallStart;

  /*
   * Enter starts playback, so a whole block-span drill stays on the keyboard like every other
   * format. There is no clash with the quiz's own Enter binding, which only acts in the `revealed`
   * and `ready` phases; the listener is gone the moment playback starts, so a held key cannot
   * restart it.
   */
  useEffect(() => {
    if (phase !== 'gate' || frozen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.repeat) return;
      e.preventDefault();
      setPhase('watch');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, frozen, key]);

  useEffect(() => {
    if (phase !== 'watch') return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let at = 400; // a brief settle, so the first block is not already lit as the gate disappears
    for (const index of sequence) {
      timers.push(setTimeout(() => setLit(index), at));
      at += stepMs;
      timers.push(setTimeout(() => setLit(null), at));
      at += gapMs;
    }
    timers.push(
      setTimeout(() => {
        setPhase('recall');
        recallRef.current();
      }, at),
    );
    return () => timers.forEach(clearTimeout);
  }, [phase, key, stepMs, gapMs]);

  function tap(index: number) {
    if (frozen || phase !== 'recall' || taps.length >= sequence.length) return;
    const next = [...taps, index];
    setTaps(next);
    setPulse({ index, at: performance.now() });
    if (next.length >= sequence.length) completeRef.current(encodeTaps(next));
  }

  function undo() {
    if (frozen || phase !== 'recall') return;
    setTaps((current) => current.slice(0, -1));
    setPulse(null);
  }

  /** The correct order, per block: `1` for the first to light, and so on. `0` means it never lit. */
  const order = useMemo(() => {
    const out = new Array<number>(blocks.length).fill(0);
    sequence.forEach((index, position) => {
      out[index] = position + 1;
    });
    return out;
  }, [key, blocks.length]);

  const wasWrong = frozen && encodeTaps(taps) !== encodeTaps(sequence);
  const path = (indices: readonly number[]) =>
    indices
      .map((index) => `${(blocks[index]!.x * 100).toFixed(2)},${(blocks[index]!.y * 100).toFixed(2)}`)
      .join(' ');

  return (
    <div
      class="blocks"
      /* Both the stimulus and the response surface, so it carries the marker the generic
         per-format contract test looks for. */
      data-stimulus="block-span"
      data-testid="block-span-board"
      data-block-phase={frozen ? 'revealed' : phase}
      data-block-taps={String(taps.length)}
    >
      <div class="blocks-status" role="status" aria-live="polite">
        {frozen ? (
          <span class="blocks-headline">{wasWrong ? t.revealWrong : t.revealRight}</span>
        ) : phase === 'gate' ? (
          <span class="subtle">{t.ready(sequence.length)}</span>
        ) : phase === 'watch' ? (
          /* No count and no position: "block 3 of 5" during playback would be a running tally of
             how much is left to hold, which is part of what the reader is supposed to be holding. */
          <span class="blocks-headline">{t.watching}</span>
        ) : (
          <>
            <span class="blocks-headline">{t.nowTapThemBack}</span>
            <span class="subtle blocks-count" data-testid="block-span-count">
              {t.progress(taps.length, sequence.length)}
            </span>
          </>
        )}
      </div>

      <div class="blocks-board">
        {/*
          * Two paths, drawn only once the answer is out: the order that lit, and — when they differ —
          * the order that was tapped. Solid against dashed rather than two colours, because a verdict
          * must never be carried by hue alone; the legend below names both in words.
          */}
        {frozen && (
          <svg class="blocks-path" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <polyline
              points={path(sequence)}
              fill="none"
              stroke="currentColor"
              stroke-width="0.6"
              stroke-linejoin="round"
              vector-effect="non-scaling-stroke"
            />
            {wasWrong && taps.length > 1 && (
              <polyline
                points={path(taps)}
                fill="none"
                stroke="currentColor"
                stroke-width="0.6"
                stroke-dasharray="3 2.5"
                stroke-opacity="0.75"
                stroke-linejoin="round"
                vector-effect="non-scaling-stroke"
                data-block-tapped-path=""
              />
            )}
          </svg>
        )}

        {blocks.map((block, index) => (
          <button
            key={index}
            type="button"
            class="blocks-block"
            data-testid={`block-${index + 1}`}
            data-block-lit={lit === index ? 'true' : undefined}
            data-block-pulse={pulse?.index === index ? String(pulse.at) : undefined}
            data-block-order={frozen && order[index] ? String(order[index]) : undefined}
            /* Tappable only during recall: a click during playback would otherwise be counted
               against a sequence the reader has not finished seeing. */
            disabled={frozen || phase !== 'recall'}
            style={{
              left: `${block.x * 100}%`,
              top: `${block.y * 100}%`,
              /* A bare number, consumed as `cqw`: the diameter as a share of the board's width,
                 which is the unit the generator's separation guarantee is expressed in. */
              '--block-size': String(BLOCK_RADIUS * 200),
            } as never}
            onClick={() => tap(index)}
            /* A position, and nothing about whether it is lit or wanted. See the note above. */
            aria-label={t.blockLabel(index + 1)}
          >
            {/* The order number appears only once the answer is out; before that a block is blank,
                because a labelled block would make this trail making with the labels hidden. */}
            {frozen && order[index] ? <span class="blocks-order">{order[index]}</span> : null}
          </button>
        ))}
      </div>

      {phase === 'gate' && !frozen && (
        <div class="blocks-actions">
          <button
            type="button"
            class="btn btn-primary"
            /* The same hook the span and n-back gates carry, so every helper that starts a gated
               format works here without knowing this format exists. */
            data-testid="span-start"
            onClick={() => setPhase('watch')}
          >
            {t.start} <span aria-hidden="true">↵</span>
          </button>
        </div>
      )}

      {phase === 'recall' && !frozen && (
        <div class="blocks-actions">
          <button
            type="button"
            class="btn"
            data-testid="block-span-undo"
            disabled={taps.length === 0}
            onClick={undo}
          >
            {t.undo}
          </button>
        </div>
      )}

      {frozen && (
        <p class="subtle blocks-legend">
          <span class="blocks-key blocks-key--answer">{t.legendAnswer}</span>
          {wasWrong && <span class="blocks-key blocks-key--tapped">{t.legendTapped}</span>}
        </p>
      )}
    </div>
  );
}
