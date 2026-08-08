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
import ActivityChart from './charts/ActivityChart';
import Sparkline from './charts/Sparkline';
import TrendChart, { type Series } from './charts/TrendChart';
import {
  dailyActivity,
  firstVsRecent,
  movingAverage,
  niceScale,
  sessionTrend,
  typeTrend,
} from '../lib/charts';
import { formatDuration, formatPercent } from '../lib/scoring';
import {
  $sessions,
  $settings,
  $summary,
  DEFAULT_SETTINGS,
  clearHistory,
  exportData,
  importData,
  updateSettings,
} from '../lib/store';
import { dict, type Locale } from '../lib/i18n';

export default function ProgressDashboard({ locale }: { locale: Locale }) {
  const t = dict(locale);
  const summary = useStore($summary);
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
    <div class="stack" data-testid="dashboard" data-has-data={String(hasData)} data-locale={locale} style={{ '--stack-gap': '2rem' } as never}>
      <section>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '0.75rem' }}>{t.dashboard.overall}</h2>
        <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(8.5rem, 1fr))' }}>
          <Stat label={t.dashboard.itemsAnswered} value={String(overall.attempts)} testid="total-attempts" />
          <Stat label={t.dashboard.accuracy} value={formatPercent(overall.accuracy, locale)} testid="total-accuracy" />
          <Stat label={t.dashboard.medianTime} value={formatDuration(overall.medianLatencyMs, locale)} testid="total-speed" />
          <Stat label={t.dashboard.sessions} value={String(overall.sessions)} testid="total-sessions" />
          <Stat label={t.dashboard.dayStreak} value={String(overall.dayStreak)} testid="day-streak" />
        </div>
        {!hasData && (
          <p class="muted" data-testid="empty-state" style={{ marginTop: '1rem' }}>
            {t.dashboard.empty}
          </p>
        )}
      </section>

      {hasData && (
        <section data-testid="charts-section">
          <h2 style={{ fontSize: '1.25rem', marginBottom: '0.35rem' }}>{t.dashboard.charts.heading}</h2>
          <p class="muted" style={{ margin: '0 0 1rem', fontSize: '0.94rem' }}>
            {t.dashboard.charts.lede}
          </p>

          {change && (
            <p
              class="card"
              data-testid="improvement"
              data-delta={String(Math.round(change.delta * 100))}
              style={{
                margin: '0 0 1rem',
                padding: '0.85rem 1.1rem',
                borderColor: change.delta > 0.02 ? 'var(--correct-border)' : 'var(--border)',
                background: change.delta > 0.02 ? 'var(--correct-soft)' : 'var(--bg-raised)',
              }}
            >
              {Math.abs(change.delta) < 0.02
                ? t.dashboard.charts.steady
                : change.delta > 0
                  ? t.dashboard.charts.improvedBy(Math.round(change.delta * 100))
                  : t.dashboard.charts.declinedBy(Math.round(-change.delta * 100))}
            </p>
          )}

          <div
            style={{
              display: 'grid',
              gap: '1rem',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 18rem), 1fr))',
            }}
          >
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
        <section>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '0.75rem' }}>{t.dashboard.byDomain}</h2>
          <DomainChart
            label={t.dashboard.domainChartLabel}
            locale={locale}
            data={byDomain.map((d) => ({
              label: t.domains[d.domain],
              value: d.accuracy ?? 0,
              n: d.attempts,
            }))}
          />
        </section>
      )}

      <section>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '0.75rem' }}>{t.dashboard.byItemType}</h2>
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
                <th class="num">{t.dashboard.charts.colTrend}</th>
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
                    <td class="num">
                      <Sparkline
                        testid={`trend-${meta.id}`}
                        label={t.dashboard.charts.trendLabel(getItemText(meta.id, locale).name)}
                        values={typeTrend(sessions, meta.id, TREND_BUCKETS).map((b) => b.accuracy)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '0.75rem' }}>{t.dashboard.settings}</h2>
        <div class="card" style={{ padding: '1rem 1.25rem', display: 'grid', gap: '0.85rem' }}>
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
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
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
              style={{
                width: '5rem',
                padding: '0.4rem 0.6rem',
                borderRadius: '0.5rem',
                border: '1px solid var(--border-strong)',
                background: 'var(--bg-raised)',
                color: 'var(--text)',
              }}
            />
          </label>
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '0.75rem' }}>{t.dashboard.yourData}</h2>
        <div class="card" style={{ padding: '1rem 1.25rem', display: 'grid', gap: '0.85rem' }}>
          <p class="muted" style={{ margin: 0 }}>
            {t.dashboard.storageNote(sessions.length)}
          </p>
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
            <button class="btn" data-testid="export" onClick={() => download(exportData())}>
              {t.dashboard.exportJson}
            </button>
            <label class="btn" style={{ cursor: 'pointer' }}>
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
                  class="btn"
                  data-testid="reset-confirm"
                  style={{ borderColor: 'var(--wrong-border)', color: 'var(--wrong)' }}
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
            <p
              data-testid="data-notice"
              style={{ margin: 0, color: notice.ok ? 'var(--correct)' : 'var(--wrong)' }}
            >
              {notice.text}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function DomainChart({
  data,
  label,
  locale,
}: {
  data: { label: string; value: number; n: number }[];
  label: string;
  locale: Locale;
}) {
  if (data.length === 0) return null;
  const rowHeight = 34;
  const height = data.length * rowHeight + 8;
  const labelWidth = 148;
  const barWidth = 300;

  return (
    <div class="card scroll-x" style={{ padding: '1rem' }}>
      <svg
        viewBox={`0 0 ${labelWidth + barWidth + 52} ${height}`}
        style={{ width: '100%', maxWidth: '34rem', height: 'auto', color: 'var(--text)' }}
        role="img"
        aria-label={label}
        data-testid="domain-chart"
      >
        {data.map((d, i) => {
          const y = i * rowHeight + 4;
          return (
            <g key={d.label} data-domain-bar={d.label}>
              <text x={0} y={y + 17} font-size="12" fill="currentColor" opacity="0.75">
                {d.label}
              </text>
              <rect
                x={labelWidth}
                y={y + 6}
                width={barWidth}
                height={14}
                rx={7}
                fill="currentColor"
                opacity="0.08"
              />
              <rect
                x={labelWidth}
                y={y + 6}
                width={Math.max(2, barWidth * d.value)}
                height={14}
                rx={7}
                fill="var(--accent)"
              />
              <text
                x={labelWidth + barWidth + 8}
                y={y + 17}
                font-size="12"
                fill="currentColor"
                opacity="0.75"
                font-variant-numeric="tabular-nums"
              >
                {formatPercent(d.value, locale)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Eight weeks is long enough to show a habit, short enough to stay readable. */
const ACTIVITY_DAYS = 56;
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
    <div class="card" style={{ padding: '0.9rem 1rem' }}>
      <h3
        class="subtle"
        style={{
          fontSize: '0.75rem',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          margin: '0 0 0.6rem',
          fontWeight: 600,
        }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

function Legend({ text }: { text: string }) {
  return (
    <p class="subtle" style={{ margin: '0.4rem 0 0', fontSize: '0.75rem' }}>
      <span aria-hidden="true">┄┄</span> {text}
    </p>
  );
}

function Stat({ label, value, testid }: { label: string; value: string; testid: string }) {
  return (
    <div class="card" style={{ padding: '0.9rem 1rem' }} data-testid={testid}>
      <div class="subtle" style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </div>
      <div style={{ fontSize: '1.5rem', fontWeight: 650, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
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
      <label style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', cursor: 'pointer' }}>
        <input
          id={id}
          type="checkbox"
          data-testid={id}
          checked={checked}
          onChange={(e) => onChange((e.currentTarget as HTMLInputElement).checked)}
          style={{ width: '1.1rem', height: '1.1rem', accentColor: 'var(--accent)' }}
        />
        <span>{label}</span>
      </label>
      <p class="subtle" style={{ margin: '0.15rem 0 0 1.7rem', fontSize: '0.85rem' }}>
        {hint}
      </p>
    </div>
  );
}

function practiceHref(id: string): string {
  const root = document.documentElement;
  const base = (root.dataset.base ?? '/').replace(/\/$/, '');
  const locale = root.dataset.locale ?? 'en';
  return `${base}/${locale}/practice/${id}/`;
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
