/**
 * Progress dashboard: personal statistics, settings, and data export/import.
 *
 * Charts are hand-written SVG rather than a charting library — small enough to justify
 * the ~20 lines, theme-aware for free via `currentColor`, and readable by Playwright and
 * screen readers in a way a canvas is not (docs/LIBRARIES.md §3).
 */
import { useState } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import { ALL_META, getItemText } from '../lib/generators';
import { typeHue } from '../lib/identity';
import ActivityChart from './charts/ActivityChart';
import BarRows from './charts/BarRows';
import Sparkline from './charts/Sparkline';
import SpeedAccuracy from './charts/SpeedAccuracy';
import TrendChart, { type Series } from './charts/TrendChart';
import {
  dailyActivity,
  firstVsRecent,
  movingAverage,
  niceScale,
  sessionTrend,
  typeTrend,
} from '../lib/charts';
import { allResponses, formatDuration, formatPercent, tallyErrorTypes } from '../lib/scoring';
import {
  $sessions,
  $settings,
  $sprints,
  $summary,
  DEFAULT_SETTINGS,
  clearHistory,
  exportData,
  importData,
  updateSettings,
} from '../lib/store';
import { dict, type Locale } from '../lib/i18n';
import { localeHref, practiceHref } from '../lib/links';
import type { Session } from '../lib/types';
import type { SprintStats } from '../lib/scoring';

export default function ProgressDashboard({ locale }: { locale: Locale }) {
  const t = dict(locale);
  const summary = useStore($summary);
  const sprints = useStore($sprints) ?? [];
  const sessions = useStore($sessions) ?? [];
  const settings = useStore($settings) ?? DEFAULT_SETTINGS;
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);

  if (!summary) return <p class="muted">{t.dashboard.loading}</p>;

  const { overall, byType, byDomain } = summary;
  const hasData = overall.attempts > 0;

  const trend = sessionTrend(sessions);
  const activity = dailyActivity(sessions, ACTIVITY_DAYS);
  const change = firstVsRecent(trend);

  return (
    <div
      class="stack dashboard"
      data-testid="dashboard"
      data-has-data={String(hasData)}
      data-locale={locale}
    >
      <section>
        <h2 class="dash-heading">{t.dashboard.overall}</h2>
        <div class="card-grid card-grid--fit stat-grid" style={{ '--card-min': '8.5rem' } as never}>
          <Stat label={t.dashboard.itemsAnswered} value={String(overall.attempts)} testid="total-attempts" />
          <Stat label={t.dashboard.accuracy} value={formatPercent(overall.accuracy, locale)} testid="total-accuracy" />
          <Stat label={t.dashboard.medianTime} value={formatDuration(overall.medianLatencyMs, locale)} testid="total-speed" />
          <Stat label={t.dashboard.sessions} value={String(overall.sessions)} testid="total-sessions" />
          <Stat label={t.dashboard.dayStreak} value={String(overall.dayStreak)} testid="day-streak" />
        </div>
        {!hasData && <EmptyState locale={locale} />}
      </section>

      {hasData && (
        <section data-testid="charts-section">
          <h2 class="dash-heading dash-heading--tight">{t.dashboard.charts.heading}</h2>
          <p class="muted dash-lede">{t.dashboard.charts.lede}</p>

          {change && (
            <p
              class="card change-note"
              data-testid="improvement"
              data-delta={String(Math.round(change.delta * 100))}
              data-improved={String(change.delta > 0.02)}
            >
              {Math.abs(change.delta) < 0.02
                ? t.dashboard.charts.steady
                : change.delta > 0
                  ? t.dashboard.charts.improvedBy(Math.round(change.delta * 100))
                  : t.dashboard.charts.declinedBy(Math.round(-change.delta * 100))}
            </p>
          )}

          <div class="card-grid card-grid--fit" style={{ '--card-min': '18rem' } as never}>
            <ChartCard title={t.dashboard.charts.accuracyTitle}>
              <TrendChart
                testid="accuracy-chart"
                label={t.dashboard.charts.accuracyLabel}
                emptyMessage={t.dashboard.charts.needMore}
                scale={{ min: 0, max: 1 }}
                formatY={(v) => formatPercent(v, locale)}
                xLabels={trendLabels(trend, t.dashboard.charts.session)}
                series={accuracySeries(trend)}
              />
              {trend.length >= ROLLING_WINDOW && (
                <Legend text={t.dashboard.charts.rollingAverage} />
              )}
            </ChartCard>

            <ChartCard title={t.dashboard.charts.speedTitle}>
              <TrendChart
                testid="speed-chart"
                label={t.dashboard.charts.speedLabel}
                emptyMessage={t.dashboard.charts.needMore}
                scale={niceScale(
                  trend.flatMap((p) => (p.medianLatencyMs === null ? [] : [p.medianLatencyMs])),
                )}
                formatY={(v) => formatDuration(v, locale)}
                xLabels={trendLabels(trend, t.dashboard.charts.session)}
                series={[
                  {
                    id: 'speed',
                    label: t.dashboard.charts.speedTitle,
                    values: trend.map((p) => p.medianLatencyMs),
                  },
                ]}
              />
            </ChartCard>

            <ChartCard title={t.dashboard.charts.activityTitle}>
              <ActivityChart
                days={activity}
                label={t.dashboard.charts.activityLabel}
                emptyMessage={t.dashboard.charts.noActivity}
                formatDay={(date) =>
                  new Intl.DateTimeFormat(t.locale.intl, { dateStyle: 'medium' }).format(date)
                }
                describeDay={t.dashboard.charts.describeDay}
                xFirst={t.dashboard.charts.weeksAgo(Math.round(ACTIVITY_DAYS / 7))}
                xLast={t.dashboard.charts.today}
              />
            </ChartCard>
          </div>
        </section>
      )}

      {hasData && (
        <section data-testid="profile-section">
          <h2 class="dash-heading dash-heading--tight">{t.dashboard.byDomain}</h2>
          <p class="muted dash-lede">{t.dashboard.domainLede}</p>
          <div class="card domain-chart-card scroll-x">
            <BarRows
              testid="domain-chart"
              label={t.dashboard.domainChartLabel}
              rows={byDomain.map((d) => ({
                key: d.domain,
                label: `${t.domains[d.domain]} (${d.domain})`,
                value: d.accuracy ?? 0,
                display: formatPercent(d.accuracy, locale),
                provisional: d.attempts < PROVISIONAL_BELOW,
                title:
                  d.attempts < PROVISIONAL_BELOW
                    ? `${t.domains[d.domain]} — ${t.dashboard.provisional(d.attempts)}`
                    : `${t.domains[d.domain]} — ${formatPercent(d.accuracy, locale)}, ${d.attempts}`,
              }))}
            />
            {byDomain.some((d) => d.attempts < PROVISIONAL_BELOW) && (
              <p class="subtle chart-legend" data-testid="provisional-key">
                {t.dashboard.provisionalKey}
              </p>
            )}
          </div>
        </section>
      )}

      {hasData && (
        <section data-testid="speed-section">
          <h2 class="dash-heading dash-heading--tight">{t.dashboard.speed.heading}</h2>
          <p class="muted dash-lede">{t.dashboard.speed.lede}</p>
          <div class="card chart-card scroll-x">
            <SpeedAccuracy
              locale={locale}
              label={t.dashboard.speed.label}
              axisX={t.dashboard.speed.axisX}
              axisY={t.dashboard.speed.axisY}
              emptyMessage={t.dashboard.speed.needMore}
              fastestLabel={t.dashboard.speed.fastest}
              mostAccurateLabel={t.dashboard.speed.mostAccurate}
              describePoint={t.dashboard.speed.point}
              points={byType.flatMap((stats) =>
                /*
                 * Both coordinates have to mean something. Median latency is computed over
                 * correct answers only, so a format with no correct answers has no x
                 * position at all, and under five attempts the median is not a median.
                 */
                stats.attempts >= SPEED_MIN_ATTEMPTS &&
                stats.accuracy !== null &&
                stats.medianLatencyMs !== null
                  ? [
                      {
                        key: stats.type,
                        name: getItemText(stats.type, locale).name,
                        accuracy: stats.accuracy,
                        medianLatencyMs: stats.medianLatencyMs,
                        attempts: stats.attempts,
                      },
                    ]
                  : [],
              )}
            />
          </div>
        </section>
      )}

      {sprints.length > 0 && <SprintBoard locale={locale} sprints={sprints} />}
      {hasData && <MistakeProfile locale={locale} sessions={sessions} />}

      {hasData && (
        <section data-testid="wall-section">
          <h2 class="dash-heading dash-heading--tight">{t.dashboard.wall.heading}</h2>
          <p class="muted dash-lede">{t.dashboard.wall.lede}</p>
          <div class="card-grid sparkline-wall" style={{ '--card-min': '9rem' } as never}>
            {ALL_META.map((meta) => {
              const buckets = typeTrend(sessions, meta.id, TREND_BUCKETS);
              const stats = byType.find((x) => x.type === meta.id);
              const name = getItemText(meta.id, locale).name;
              return (
                <a
                  key={meta.id}
                  class="card card--interactive wall-cell"
                  href={practiceHref(meta.id)}
                  data-testid={`wall-${meta.id}`}
                  style={{ '--type-hue': typeHue(meta.id) } as never}
                >
                  <span class="wall-name">{name}</span>
                  {buckets.length > 0 ? (
                    <>
                      <Sparkline
                        testid={`trend-${meta.id}`}
                        label={t.dashboard.charts.trendLabel(name)}
                        values={buckets.map((b) => b.accuracy)}
                      />
                      <span class="wall-value">
                        {formatPercent(stats?.accuracy ?? null, locale)}
                        <span class="subtle wall-attempts"> · {stats?.attempts ?? 0}</span>
                      </span>
                    </>
                  ) : (
                    <span class="subtle wall-never">{t.dashboard.wall.never}</span>
                  )}
                </a>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <h2 class="dash-heading">{t.dashboard.byItemType}</h2>
        <div class="card scroll-x">
          <table class="data" data-testid="type-table">
            <thead>
              <tr>
                <th>{t.dashboard.colType}</th>
                <th>{t.dashboard.colDomain}</th>
                <th class="num">{t.dashboard.colAnswered}</th>
                <th class="num">{t.dashboard.colAccuracy}</th>
                <th class="num">{t.dashboard.colMedianTime}</th>
                <th class="num">{t.dashboard.colBestRun}</th>
                <th class="num">{t.dashboard.colPeakLevel}</th>
              </tr>
            </thead>
            <tbody>
              {ALL_META.map((meta) => {
                const stats = byType.find((t) => t.type === meta.id);
                return (
                  <tr key={meta.id} data-testid={`type-row-${meta.id}`}>
                    <td>
                      <a href={practiceHref(meta.id)}>
                        {meta.icon} {getItemText(meta.id, locale).name}
                      </a>
                    </td>
                    <td class="muted">{meta.domain}</td>
                    <td class="num">{stats?.attempts ?? 0}</td>
                    <td class="num">{formatPercent(stats?.accuracy ?? null, locale)}</td>
                    <td class="num">{formatDuration(stats?.medianLatencyMs ?? null, locale)}</td>
                    <td class="num">{stats?.bestStreak ?? 0}</td>
                    <td class="num">{stats?.peakDifficulty ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 class="dash-heading">{t.dashboard.settings}</h2>
        <div class="card dash-panel">
          <Toggle
            id="setting-feedback"
            label={t.dashboard.settingFeedback}
            hint={t.dashboard.settingFeedbackHint}
            checked={settings.instantFeedback}
            onChange={(v) => updateSettings({ instantFeedback: v })}
          />
          <Toggle
            id="setting-adaptive"
            label={t.dashboard.settingAdaptive}
            hint={t.dashboard.settingAdaptiveHint}
            checked={settings.adaptive}
            onChange={(v) => updateSettings({ adaptive: v })}
          />
          <Toggle
            id="setting-motion"
            label={t.dashboard.settingMotion}
            hint={t.dashboard.settingMotionHint}
            checked={settings.reducedMotion}
            onChange={(v) => updateSettings({ reducedMotion: v })}
          />
          <label class="cluster">
            <span>{t.dashboard.settingLength}</span>
            <input
              type="number"
              min={3}
              max={50}
              value={settings.practiceLength}
              data-testid="setting-length"
              onInput={(e) => {
                const v = Number((e.currentTarget as HTMLInputElement).value);
                if (Number.isFinite(v) && v >= 3 && v <= 50) updateSettings({ practiceLength: v });
              }}
              class="number-input"
            />
          </label>
        </div>
      </section>

      <section>
        <h2 class="dash-heading">{t.dashboard.yourData}</h2>
        <div class="card dash-panel">
          <p class="muted flush">{t.dashboard.storageNote(sessions.length)}</p>
          <div class="cluster" style={{ '--cluster-gap': '0.6rem' } as never}>
            <button class="btn" data-testid="export" onClick={() => download(exportData())}>
              {t.dashboard.exportJson}
            </button>
            <label class="btn btn--file">
              {t.dashboard.importJson}
              <input
                type="file"
                accept="application/json,.json"
                data-testid="import"
                class="sr-only"
                onChange={async (e) => {
                  const file = (e.currentTarget as HTMLInputElement).files?.[0];
                  if (!file) return;
                  const result = importData(await file.text(), locale);
                  setNotice({ ok: result.ok, text: result.message });
                }}
              />
            </label>
            {confirming ? (
              <>
                <button
                  class="btn btn-danger"
                  data-testid="reset-confirm"
                  onClick={() => {
                    clearHistory();
                    setConfirming(false);
                    setNotice({ ok: true, text: t.dashboard.historyCleared });
                  }}
                >
                  {t.dashboard.resetConfirm}
                </button>
                <button class="btn" data-testid="reset-cancel" onClick={() => setConfirming(false)}>
                  {t.dashboard.resetCancel}
                </button>
              </>
            ) : (
              <button class="btn" data-testid="reset" onClick={() => setConfirming(true)}>
                {t.dashboard.reset}
              </button>
            )}
          </div>
          {notice && (
            <p class="data-notice" data-testid="data-notice" data-ok={String(notice.ok)}>
              {notice.text}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

/**
 * Sprint results, on their own board.
 *
 * Separate from everything above it, and that separation is the point rather than a layout
 * choice. `summarise` excludes sprints, so none of the accuracy, latency or trend figures on this
 * page contain a single timed response — pooling the two regimes would have moved every per-type
 * median the first time someone sprinted, with nothing on screen to say the measurement underneath
 * had changed. The cost of keeping them apart is that sprint work would otherwise be invisible
 * here, which is what this section repays.
 *
 * Best and latest, per format, and no ranking against anybody else. A rate is shown beside the
 * count because the window is a setting: without it, a run of a different length would look like
 * an improvement.
 */
function SprintBoard({ locale, sprints }: { locale: Locale; sprints: SprintStats[] }) {
  const t = dict(locale);
  return (
    <section data-testid="sprint-section">
      <h3 class="section-heading section-heading--sm">{t.dashboard.sprintHeading}</h3>
      <p class="muted dashboard-lede">{t.dashboard.sprintLede}</p>
      <div class="card-grid card-grid--fit">
        {sprints.map((s) => (
          <div
            class="card sprint-stat"
            key={s.type}
            data-testid={`sprint-row-${s.type}`}
            style={{ '--type-hue': typeHue(s.type) } as never}
          >
            <div class="cluster" style={{ '--cluster-gap': '0.5rem' } as never}>
              <strong>{getItemText(s.type, locale).name}</strong>
              <span class="pill">{t.dashboard.sprintRuns(s.runs)}</span>
            </div>
            <dl class="sprint-stat-figures">
              <div>
                <dt class="subtle">{t.dashboard.sprintBest}</dt>
                <dd class="num-tabular" data-testid={`sprint-best-${s.type}`}>
                  {t.dashboard.sprintScore(s.best.correct, Math.round(s.best.plannedMs / 1000))}
                  {' '}
                  <span class="subtle">
                    {t.results.perMinute(Math.round(s.best.perMinute * 10) / 10)}
                  </span>
                </dd>
              </div>
              <div>
                <dt class="subtle">{t.dashboard.sprintLatest}</dt>
                <dd class="num-tabular" data-testid={`sprint-latest-${s.type}`}>
                  {t.dashboard.sprintScore(s.latest.correct, Math.round(s.latest.plannedMs / 1000))}
                  {' '}
                  <span class="subtle">
                    {t.dashboard.sprintAccuracy(formatPercent(s.latest.accuracy, locale))}
                  </span>
                </dd>
              </div>
            </dl>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * The mistake breakdown, across the whole history.
 *
 * The payoff of Phase 1: because every wrong answer was diagnosed at the moment it was made,
 * this page can report *which* misreadings recur rather than only how often the reader was
 * wrong. Sorted by frequency, so the habit is the first row.
 *
 * Note what is not here: no total, no grade, no comparison. A count and a name.
 */
function MistakeProfile({ locale, sessions }: { locale: Locale; sessions: Session[] }) {
  const t = dict(locale);
  const tally = tallyErrorTypes(allResponses(sessions));
  const total = tally.reduce((sum, x) => sum + x.count, 0);

  return (
    <section data-testid="mistake-section">
      <h2 class="dash-heading dash-heading--tight">{t.dashboard.mistakes.heading}</h2>
      <p class="muted dash-lede">{t.dashboard.mistakes.lede}</p>
      <div class="card domain-chart-card scroll-x" data-testid="mistake-profile" data-count={String(total)}>
        {total === 0 ? (
          <p class="muted chart-empty" data-testid="mistake-profile-empty">
            {t.dashboard.mistakes.empty}
          </p>
        ) : (
          <BarRows
            testid="mistake-chart"
            label={t.dashboard.mistakes.label}
            labelWidth={130}
            rows={tally.map((x) => {
              const share = x.count / total;
              return {
                key: x.errorType,
                label: t.diagnosis.tags[x.errorType],
                // Scaled against the commonest mistake, not against the total: the question
                // this chart answers is "which of these dominates", and a share-of-total
                // scale flattens everything when the errors are spread.
                value: x.count / tally[0]!.count,
                display: String(x.count),
                title: t.dashboard.mistakes.bar(
                  t.diagnosis.tags[x.errorType],
                  x.count,
                  formatPercent(share, locale),
                ),
              };
            })}
          />
        )}
      </div>
    </section>
  );
}

/**
 * The empty state.
 *
 * For a new reader this page *is* this component, so it gets designed rather than left as a
 * bare sentence over an empty table: it explains why the page is empty, says what will appear,
 * and offers the two ways to fill it.
 */
function EmptyState({ locale }: { locale: Locale }) {
  const t = dict(locale);
  return (
    <div class="card note note--accent dash-empty-card" data-testid="empty-state">
      <h3 class="section-heading section-heading--sm">{t.dashboard.emptyHeading}</h3>
      <p class="note-body">{t.dashboard.emptyBody}</p>
      <div class="cluster dash-empty-actions">
        <a class="btn btn-primary" href={localeHref('practice/')}>
          {t.dashboard.emptyCtaPractice}
        </a>
        <a class="btn" href={localeHref('test/')}>
          {t.dashboard.emptyCtaTest}
        </a>
      </div>
      <p class="subtle small flush">{t.dashboard.emptyPrivacy}</p>
    </div>
  );
}

/** Eight weeks is long enough to show a habit, short enough to stay readable. */
const ACTIVITY_DAYS = 56;
/**
 * Below this many attempts a bar is drawn faded and labelled as provisional.
 *
 * Ten is not a statistical threshold — nothing here is calibrated — but a domain read off
 * three items would be presented with exactly the same confidence as one read off three
 * hundred, and that is the overclaiming this whole site is built to avoid.
 */
const PROVISIONAL_BELOW = 10;
/** A median over fewer than five attempts is not a median. */
const SPEED_MIN_ATTEMPTS = 5;
const ROLLING_WINDOW = 3;
const TREND_BUCKETS = 8;

function trendLabels(
  trend: { index: number }[],
  session: (n: number) => string,
): string[] {
  if (trend.length === 0) return [];
  return [session(trend[0]!.index), session(trend[trend.length - 1]!.index)];
}

function accuracySeries(trend: { accuracy: number }[]): Series[] {
  const accuracy = trend.map((p) => p.accuracy);
  const series: Series[] = [{ id: 'accuracy', label: 'accuracy', values: accuracy }];
  // The raw line is noisy with short sessions; the average says whether it is trending.
  if (accuracy.length >= ROLLING_WINDOW) {
    series.push({
      id: 'rolling',
      label: 'rolling average',
      values: movingAverage(accuracy, ROLLING_WINDOW),
      dashed: true,
    });
  }
  return series;
}

function ChartCard({ title, children }: { title: string; children: preact.ComponentChildren }) {
  return (
    <div class="card chart-card">
      <h3 class="subtle chart-card-title">{title}</h3>
      {children}
    </div>
  );
}

function Legend({ text }: { text: string }) {
  return (
    <p class="subtle chart-legend">
      <span aria-hidden="true">┄┄</span> {text}
    </p>
  );
}

function Stat({ label, value, testid }: { label: string; value: string; testid: string }) {
  return (
    <div class="card stat" data-testid={testid}>
      <div class="stat-label subtle">{label}</div>
      <div class="stat-value">{value}</div>
    </div>
  );
}

function Toggle({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div>
      <label class="toggle">
        <input
          id={id}
          type="checkbox"
          data-testid={id}
          checked={checked}
          onChange={(e) => onChange((e.currentTarget as HTMLInputElement).checked)}
          class="toggle-box"
        />
        <span>{label}</span>
      </label>
      <p class="subtle toggle-hint">{hint}</p>
    </div>
  );
}

function download(payload: unknown): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `iq-training-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
