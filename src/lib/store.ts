/**
 * Local-first persistence.
 *
 * Everything lives in localStorage — there is no account, no server, and no network call.
 * Nanostores are used rather than a React context because Astro islands are independent
 * Preact roots: a provider in one island cannot reach another, but a module-level store
 * can (docs/LIBRARIES.md §2).
 *
 * Sessions store `(type, seed, difficulty, response, latency)` per item, never the items
 * themselves — a seed regenerates its item exactly, so history stays tiny and replayable.
 */
import { persistentAtom } from '@nanostores/persistent';
import { computed } from 'nanostores';
import type { Difficulty, ItemTypeId, Response, Session, SessionMode } from './types';
import { summarise, type Summary } from './scoring';
import { randomSeed } from './rng';
import { dict, DEFAULT_LOCALE, type Locale } from './i18n';

/** Bump when the persisted shape changes incompatibly; old keys are then ignored. */
export const SCHEMA_VERSION = 1;
const SESSIONS_KEY = `iq:v${SCHEMA_VERSION}:sessions`;
const SETTINGS_KEY = `iq:v${SCHEMA_VERSION}:settings`;

/** Keeps localStorage bounded; the dashboard only ever shows aggregates and recents. */
export const MAX_SESSIONS = 200;

export interface Settings {
  /** Show the explanation immediately after each answer in practice mode. */
  instantFeedback: boolean;
  /** Let difficulty adapt to performance. */
  adaptive: boolean;
  /** Slow the span playback down. There is no countdown timer anywhere in the app. */
  reducedMotion: boolean;
  /** Number of items in a practice drill. */
  practiceLength: number;
}

export const DEFAULT_SETTINGS: Settings = {
  instantFeedback: true,
  adaptive: true,
  reducedMotion: false,
  practiceLength: 10,
};

const json = {
  encode: JSON.stringify,
  decode: (value: string) => {
    try {
      return JSON.parse(value);
    } catch {
      // A corrupted or hand-edited key must not brick the app on load.
      return undefined;
    }
  },
};

export const $sessions = persistentAtom<Session[]>(SESSIONS_KEY, [], json);
export const $settings = persistentAtom<Settings>(SETTINGS_KEY, DEFAULT_SETTINGS, json);

/** Guards against a partially-written or older payload reaching the UI. */
function safeSessions(value: unknown): Session[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (s): s is Session =>
      !!s &&
      typeof s === 'object' &&
      typeof (s as Session).id === 'string' &&
      Array.isArray((s as Session).responses),
  );
}

export const $summary = computed($sessions, (sessions): Summary =>
  summarise(safeSessions(sessions)),
);

export function readSettings(): Settings {
  const value = $settings.get();
  return { ...DEFAULT_SETTINGS, ...(value ?? {}) };
}

export function updateSettings(patch: Partial<Settings>): void {
  $settings.set({ ...readSettings(), ...patch });
}

export function newSession(mode: SessionMode, types: ItemTypeId[], seed = randomSeed()): Session {
  return {
    id: `${Date.now().toString(36)}-${seed}`,
    mode,
    seed,
    types,
    startedAt: Date.now(),
    finishedAt: null,
    responses: [],
  };
}

/** Appends a finished session, trimming the oldest once the cap is reached. */
export function saveSession(session: Session): void {
  if (session.responses.length === 0) return; // nothing worth keeping
  const existing = safeSessions($sessions.get());
  const withoutDuplicate = existing.filter((s) => s.id !== session.id);
  const next = [...withoutDuplicate, { ...session, finishedAt: session.finishedAt ?? Date.now() }];
  $sessions.set(next.slice(-MAX_SESSIONS));
}

export function clearHistory(): void {
  $sessions.set([]);
}

export function makeResponse(
  type: ItemTypeId,
  seed: string,
  difficulty: Difficulty,
  answerIndex: number,
  chosenIndex: number | null,
  correct: boolean,
  latencyMs: number,
  chosenText?: string,
): Response {
  return {
    type,
    seed,
    difficulty,
    chosenIndex,
    ...(chosenText === undefined ? {} : { chosenText }),
    answerIndex,
    correct,
    latencyMs,
  };
}

// ---------------------------------------------------------------------------
// Import / export — the user's data is theirs to take away.
// ---------------------------------------------------------------------------

export interface ExportPayload {
  schema: number;
  exportedAt: string;
  sessions: Session[];
  settings: Settings;
}

export function exportData(): ExportPayload {
  return {
    schema: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    sessions: safeSessions($sessions.get()),
    settings: readSettings(),
  };
}

export interface ImportResult {
  ok: boolean;
  message: string;
  imported: number;
}

/** Merges an exported payload, de-duplicating by session id. */
export function importData(raw: string, locale: Locale = DEFAULT_LOCALE): ImportResult {
  const msg = dict(locale).storeMessages;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, message: msg.notJson, imported: 0 };
  }

  const payload = parsed as Partial<ExportPayload>;
  if (typeof payload?.schema !== 'number') {
    return { ok: false, message: msg.missingSchema, imported: 0 };
  }
  if (payload.schema !== SCHEMA_VERSION) {
    return {
      ok: false,
      message: msg.schemaMismatch(payload.schema, SCHEMA_VERSION),
      imported: 0,
    };
  }

  const incoming = safeSessions(payload.sessions);
  if (incoming.length === 0) {
    return { ok: false, message: msg.noSessions, imported: 0 };
  }

  const existing = safeSessions($sessions.get());
  const known = new Set(existing.map((s) => s.id));
  const added = incoming.filter((s) => !known.has(s.id));
  const merged = [...existing, ...added].sort((a, b) => a.startedAt - b.startedAt);
  $sessions.set(merged.slice(-MAX_SESSIONS));

  if (payload.settings) updateSettings(payload.settings);

  return {
    ok: true,
    message:
      added.length === incoming.length
        ? msg.imported(added.length)
        : msg.importedPartial(added.length, incoming.length - added.length),
    imported: added.length,
  };
}
