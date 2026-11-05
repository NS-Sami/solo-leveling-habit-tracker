/**
 * The four operations the sync engine needs from the server.
 * Hidden behind an interface so tests can run the engine against real Postgres.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RemotePatch, RemoteRow, SyncTable } from './mapping';

export interface RemoteStore {
  /** Inserts rows that do not exist yet. Returns only the rows actually inserted. */
  insertIfAbsent(table: SyncTable, rows: RemotePatch[]): Promise<RemoteRow[]>;
  /** Updates a row only if it is still at `version`. Returns null if it has moved on. */
  updateIfVersion(table: SyncTable, id: string, patch: RemotePatch, version: number): Promise<RemoteRow | null>;
  get(table: SyncTable, id: string): Promise<RemoteRow | null>;
  /** Rows changed at or after `since`, oldest first. */
  listSince(table: SyncTable, since: string | null, offset: number, limit: number): Promise<RemoteRow[]>;
}

/** The server could not be reached. Changes are safe and will be retried. */
export class NetworkError extends Error {}
/** The session is no longer valid, so the user must sign in again. */
export class AuthExpiredError extends Error {}

interface ApiError {
  message: string;
  code?: string;
  status?: number;
}

function raise(error: ApiError, status?: number): never {
  const code = error.code ?? '';
  const httpStatus = status ?? error.status ?? 0;
  if (httpStatus === 401 || code === 'PGRST301' || code === 'PGRST303') throw new AuthExpiredError(error.message);
  // Fetch failures have no HTTP status. 5xx covers a paused or restarting project.
  if (httpStatus === 0 || httpStatus >= 500 || /fetch|network|load failed/i.test(error.message)) throw new NetworkError(error.message);
  throw new Error(error.message);
}

export class SupabaseRemote implements RemoteStore {
  constructor(
    private client: SupabaseClient,
    private userId: string,
  ) {}

  async insertIfAbsent(table: SyncTable, rows: RemotePatch[]) {
    const owned = rows.map((r) => ({ ...r, user_id: this.userId }));
    const { data, error, status } = await this.client.from(table).upsert(owned, { onConflict: 'user_id,id', ignoreDuplicates: true }).select();
    if (error) raise(error, status);
    return (data ?? []) as RemoteRow[];
  }

  async updateIfVersion(table: SyncTable, id: string, patch: RemotePatch, version: number) {
    const { data, error, status } = await this.client.from(table).update(patch).eq('user_id', this.userId).eq('id', id).eq('version', version).select();
    if (error) raise(error, status);
    return ((data ?? [])[0] as RemoteRow | undefined) ?? null;
  }

  async get(table: SyncTable, id: string) {
    const { data, error, status } = await this.client.from(table).select('*').eq('user_id', this.userId).eq('id', id).maybeSingle();
    if (error) raise(error, status);
    return (data as RemoteRow | null) ?? null;
  }

  async listSince(table: SyncTable, since: string | null, offset: number, limit: number) {
    let query = this.client.from(table).select('*').eq('user_id', this.userId);
    if (since) query = query.gte('updated_at', since);
    const { data, error, status } = await query.order('updated_at').order('id').range(offset, offset + limit - 1);
    if (error) raise(error, status);
    return (data ?? []) as RemoteRow[];
  }
}
