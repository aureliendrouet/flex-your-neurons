/**
 * The triangle-math board: a pyramid of cells, the base given and the rest to be filled in.
 *
 * It is a *response surface*, not a stimulus, which is why it lives in the answer tray beside the
 * trail and block-span boards rather than in `StimulusView`. The reason is the same as the block
 * board's: the blanks have to sit in the pyramid, above the numbers they are sums of. A copy of the
 * pyramid drawn somewhere else with a row of inputs underneath would be a different task — you would
 * be reading a diagram and typing into a list, rather than filling in the diagram.
 *
 * Left mounted and frozen after answering, again like the other two boards, because the finished
 * pyramid *is* the explanation: seeing the right number beside the one you wrote, in the cell where
 * it belongs, says where the chain broke in a way no sentence can.
 */
import { useCallback, useMemo, useState } from 'preact/hooks';
import { buildPyramid } from '../lib/generators/triangle-math';
import { splitBlanks } from '../lib/scoring';
import { dict, type Locale } from '../lib/i18n';

interface Props {
  /** The given row, left to right. */
  base: number[];
  locale: Locale;
  /** The expected blanks, comma-separated — only read once `frozen`, to draw the answer. */
  answerText: string;
  /** What the reader submitted, once they have. */
  submitted?: string;
  frozen: boolean;
  onComplete: (filled: string) => void;
}

export default function PyramidBoard({
  base,
  locale,
  answerText,
  submitted,
  frozen,
  onComplete,
}: Props) {
  const t = dict(locale).quiz.pyramid;
  /*
   * The shape is derived from the base rather than passed in, which is what keeps the board and the
   * generator from ever disagreeing about how many blanks there are: both call `buildPyramid`.
   */
  const rows = useMemo(() => buildPyramid(base), [base.join(',')]);
  const blankRows = rows.slice(1);
  const total = blankRows.reduce((n, row) => n + row.length, 0);

  /*
   * Initialised once and never reset from an effect.
   *
   * There was a `useEffect` here that emptied the board whenever the base changed, and it was both
   * redundant and actively wrong. Redundant because `Quiz` keys this component by item, so a new
   * pyramid is a new mount with fresh state. Wrong because an effect runs *after* the first paint:
   * anything typed into a cell in that window was silently reverted, which is exactly what happened
   * to the first blank of the last item in a full test — filled, then wiped, then waiting forever for
   * a submit button that would not enable.
   */
  const [values, setValues] = useState<string[]>(() => new Array(total).fill(''));

  const complete = values.every((v) => v.trim() !== '');

  const submit = useCallback(() => {
    if (frozen || !complete) return;
    onComplete(values.map((v) => v.trim()).join(','));
  }, [frozen, complete, values, onComplete]);

  const expected = splitBlanks(answerText);
  const given = submitted === undefined ? null : splitBlanks(submitted);

  /** Flat index of a cell, counting the blanks bottom-up and left to right. */
  let cursor = 0;
  const flat: number[][] = blankRows.map((row) => row.map(() => cursor++));

  return (
    <div class="pyramid" data-stimulus="pyramid" data-testid="pyramid-board" data-pyramid-blanks={String(total)}>
      {/*
        * Drawn top row first, because that is how a pyramid looks — but *numbered* bottom-up, which
        * is the order the cells can actually be worked out in and therefore the order the inputs are
        * tabbed through. The two orders differing is the whole reason the flat index is computed
        * before rendering rather than during it.
        */}
      {[...blankRows].reverse().map((row, reversed) => {
        const rowIndex = blankRows.length - 1 - reversed;
        return (
          <div class="pyramid-row" key={`r${rowIndex}`}>
            {row.map((value, i) => {
              const index = flat[rowIndex]![i]!;
              const wrong = frozen && given !== null && given[index] !== expected[index];
              return (
                <label class="pyramid-cell" key={`c${index}`} data-pyramid-wrong={String(wrong)}>
                  <span class="sr-only">{t.cellLabel(index + 1, total)}</span>
                  <input
                    class="pyramid-input"
                    data-testid={`pyramid-input-${index}`}
                    inputMode="numeric"
                    autocomplete="off"
                    value={frozen ? (given?.[index] ?? '') : values[index]}
                    disabled={frozen}
                    onInput={(e) => {
                      const typed = (e.currentTarget as HTMLInputElement).value.replace(/[^\d-]/g, '');
                      /*
                       * The functional form, and it is not a style preference. Copying `values` from
                       * the render closure loses an edit whenever two cells change before a re-render
                       * lands: the second handler still holds the array as it was *before* the first,
                       * so it writes its own cell and reverts the other. It showed up as a full test
                       * that hung on the last item with one blank mysteriously empty — and it is
                       * equally reachable by a reader typing quickly across the row.
                       */
                      setValues((prev) => {
                        const next = [...prev];
                        next[index] = typed;
                        return next;
                      });
                    }}
                    onKeyDown={(e) => {
                      /*
                       * Enter submits from any cell rather than only from the last, because a reader
                       * who fills the pyramid out of order — top row last is unusual but legal —
                       * would otherwise have to hunt for the button.
                       */
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        submit();
                      }
                    }}
                  />
                  {/* Once the answer is out, the right number appears beside a wrong one. Only
                      beside a wrong one: a correct board is already showing every answer. */}
                  {wrong && (
                    <span class="pyramid-expected" data-testid={`pyramid-answer-${index}`}>
                      {expected[index]}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        );
      })}

      <div class="pyramid-row pyramid-row--base">
        {base.map((value, i) => (
          <span class="pyramid-cell pyramid-cell--given" key={`b${i}`}>
            {value}
          </span>
        ))}
      </div>

      {!frozen && (
        <div class="pyramid-actions">
          <button
            type="button"
            class="btn btn-primary"
            data-testid="submit-pyramid"
            disabled={!complete}
            onClick={submit}
          >
            {dict(locale).quiz.submit} <span aria-hidden="true">↵</span>
          </button>
          <span class="subtle pyramid-count" data-testid="pyramid-count">
            {t.progress(values.filter((v) => v.trim() !== '').length, total)}
          </span>
        </div>
      )}
    </div>
  );
}
