/**
 * Translates between the app's local records and the Supabase table rows.
 */
import type { Category, Completion, DayMeta, Difficulty, Quest, Settings, Stat } from '../domain/types';

export type SyncTable = 'quests' | 'completions' | 'day_meta' | 'user_settings';

export const SYNC_TABLES: SyncTable[] = ['quests', 'completions', 'day_meta', 'user_settings'];

export const SETTINGS_ROW_ID = 'settings';

/** Local preferences that stay on one device instead of following the account. */
export const DEVICE_ONLY_SETTINGS = ['sfxOn', 'volume', 'anthemBlobKey', 'lastBackupAt'] as const;

export interface RemoteRow {
  id: string;
  version: number;
  updated_at: string;
  client_updated_at: string;
  deleted_at: string | null;
  [column: string]: unknown;
}

export type RemotePatch = Record<string, unknown>;
export type LocalRecord = Quest | Completion | DayMeta | Settings;

export const outboxKey = (table: SyncTable, rowId: string) => `${table}|${rowId}`;

/** Row content to send to the server (without server-managed columns). */
export function toRemote(table: SyncTable, local: LocalRecord): RemotePatch {
  switch (table) {
    case 'quests': {
      const q = local as Quest;
      return {
        id: q.id,
        name: q.name,
        category: q.category,
        stat: q.stat,
        exp: q.exp,
        difficulty: q.difficulty,
        schedule_days: q.scheduleDays,
        sort_order: q.order,
        created_on: q.createdAt,
        archived_on: q.archivedAt ?? null,
      };
    }
    case 'completions': {
      const c = local as Completion;
      return {
        id: c.id,
        quest_id: c.questId,
        date: c.date,
        exp_awarded: c.expAwarded,
        stat: c.stat,
        category: c.category,
        completed_at: c.completedAt || new Date().toISOString(),
      };
    }
    case 'day_meta': {
      const d = local as DayMeta;
      return { id: d.date, rest_day: d.restDay };
    }
    case 'user_settings': {
      const { id: _id, timezone, ...rest } = local as Settings;
      const data: Record<string, unknown> = { ...rest };
      for (const k of DEVICE_ONLY_SETTINGS) delete data[k];
      return { id: SETTINGS_ROW_ID, timezone: timezone ?? 'Asia/Dhaka', data };
    }
  }
}

/** Local record for a server row. Settings return only the fields that follow the account. */
export function fromRemote(table: SyncTable, row: RemoteRow): LocalRecord | Partial<Settings> {
  switch (table) {
    case 'quests':
      return {
        id: row.id,
        name: row.name as string,
        category: row.category as Category,
        stat: row.stat as Stat,
        exp: row.exp as number,
        difficulty: row.difficulty as Difficulty,
        scheduleDays: row.schedule_days as number[],
        order: row.sort_order as number,
        createdAt: row.created_on as string,
        archivedAt: (row.archived_on as string | null) ?? null,
        updatedAt: row.client_updated_at,
      } satisfies Quest;
    case 'completions':
      return {
        id: row.id,
        questId: row.quest_id as string,
        date: row.date as string,
        expAwarded: row.exp_awarded as number,
        stat: row.stat as Stat,
        category: row.category as Category,
        completedAt: row.completed_at as string,
      } satisfies Completion;
    case 'day_meta':
      return { date: row.id, restDay: row.rest_day as boolean } satisfies DayMeta;
    case 'user_settings':
      return { ...(row.data as Partial<Settings>), timezone: row.timezone as string };
  }
}

/** Stable JSON: object key order does not matter (Postgres jsonb reorders keys). */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}

const CONTENT_COLUMNS: Record<SyncTable, string[]> = {
  quests: ['name', 'category', 'stat', 'exp', 'difficulty', 'schedule_days', 'sort_order', 'created_on', 'archived_on'],
  completions: ['quest_id', 'date', 'exp_awarded', 'stat', 'category'],
  day_meta: ['rest_day'],
  user_settings: ['timezone', 'data'],
};

/** Does the server already hold this content? True means a retry already succeeded. */
export function sameContent(table: SyncTable, local: RemotePatch, server: RemoteRow): boolean {
  return CONTENT_COLUMNS[table].every((c) => canonical(local[c] ?? null) === canonical(server[c] ?? null));
}
