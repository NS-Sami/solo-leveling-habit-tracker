/**
 * Sync engine: keeps one account's local database and Supabase in step.
 *
 * PUSH  Every local change sits in `outbox` until the server confirms it, so a
 *       closed tab or lost connection loses nothing.
 * PULL  Fetches rows changed since the last pull and applies them locally.
 *
 * Rules that protect progress:
 *  - An update is only accepted if the server row is still at the version this
 *    device last saw. An old device cannot silently overwrite newer data.
 *  - Retrying is always safe: if the server already has the same content, the
 *    change counts as confirmed.
 *  - Daily completions and rest days are on/off values, so the later edit wins.
 *  - Quests and settings can differ in many fields, so a clash is shown to the
 *    user, who chooses which version to keep.
 *  - "Saved" is only reported once the outbox is empty.
 */
import type { ConflictItem, OutboxItem, SystemDB } from '../data/db';
import type { DayMeta, Settings } from '../domain/types';
import { defaultSettings } from '../data/seed';
import { DEVICE_ONLY_SETTINGS, SETTINGS_ROW_ID, SYNC_TABLES, fromRemote, outboxKey, sameContent, toRemote, type LocalRecord, type RemotePatch, type RemoteRow, type SyncTable } from './mapping';
import { AuthExpiredError, NetworkError, type RemoteStore } from './remote';

export type SyncPhase = 'loading' | 'saving' | 'saved' | 'offline' | 'error' | 'conflict';

export interface SyncStatus {
  phase: SyncPhase;
  pending: number;
  conflicts: number;
  lastSavedAt: string | null;
  message: string | null;
}

const PAGE_SIZE = 1000;
const INSERT_CHUNK = 200;
const CONCURRENCY = 6;
/** Pull re-reads this far back, so a slow transaction's rows are never skipped. */
const CURSOR_OVERLAP_MS = 60_000;
const PUSH_DEBOUNCE_MS = 600;
const POLL_MS = 60_000;
const MAX_BACKOFF_MS = 5 * 60_000;

export class SyncEngine {
  private running: Promise<void> | null = null;
  private rerun = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private poll: ReturnType<typeof setInterval> | null = null;
  private failures = 0;
  private lastSavedAt: string | null = null;
  private started = false;
  private lastStatus: SyncStatus = { phase: 'loading', pending: 0, conflicts: 0, lastSavedAt: null, message: null };

  constructor(
    private db: SystemDB,
    private remote: RemoteStore,
    private onStatus: (s: SyncStatus) => void = () => {},
  ) {}

  /* ---- Lifecycle ------------------------------------------------------- */

  start() {
    if (this.started || typeof window === 'undefined') return;
    this.started = true;
    window.addEventListener('online', this.syncSoon);
    window.addEventListener('offline', this.reportOffline);
    document.addEventListener('visibilitychange', this.onVisible);
    this.poll = setInterval(() => void this.sync(), POLL_MS);
    this.syncSoon();
  }

  stop() {
    this.started = false;
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.syncSoon);
      window.removeEventListener('offline', this.reportOffline);
      document.removeEventListener('visibilitychange', this.onVisible);
    }
    if (this.poll) clearInterval(this.poll);
    if (this.timer) clearTimeout(this.timer);
  }

  private onVisible = () => {
    if (document.visibilityState === 'visible') this.syncSoon();
  };

  private reportOffline = () => {
    void this.report('offline', 'You are offline. Changes stay on this device and upload when you reconnect.');
  };

  /** Called after each local edit; bursts of edits share one upload. */
  syncSoon = () => {
    // Synchronous, so "Saved" can never linger on screen after an edit.
    this.emit({ ...this.lastStatus, phase: 'saving', pending: Math.max(1, this.lastStatus.pending) });
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.sync(), PUSH_DEBOUNCE_MS);
  };

  /** Push then pull. Overlapping calls are merged into one follow-up run. */
  sync(): Promise<void> {
    if (this.running) {
      this.rerun = true;
      return this.running;
    }
    this.running = this.run().finally(() => {
      this.running = null;
      if (this.rerun) {
        this.rerun = false;
        void this.sync();
      }
    });
    return this.running;
  }

  private async run() {
    try {
      await this.push();
      await this.pull();
      this.failures = 0;
      if ((await this.db.outbox.count()) === 0) this.lastSavedAt = new Date().toISOString();
      await this.report();
    } catch (err) {
      this.failures++;
      await this.reportError(err);
      if (!(err instanceof AuthExpiredError)) this.retryLater();
    }
  }

  private retryLater() {
    if (!this.started) return;
    if (this.timer) clearTimeout(this.timer);
    const delay = Math.min(5000 * 2 ** (this.failures - 1), MAX_BACKOFF_MS);
    this.timer = setTimeout(() => void this.sync(), delay);
  }

  /* ---- Status ---------------------------------------------------------- */

  private async counts() {
    const [outbox, conflicts] = await Promise.all([this.db.outbox.toCollection().primaryKeys(), this.db.conflicts.count()]);
    return { pending: outbox.length, conflicts };
  }

  private async report(forced?: SyncPhase, message: string | null = null) {
    const { pending, conflicts } = await this.counts();
    const phase: SyncPhase = forced ?? (conflicts > 0 ? 'conflict' : pending > 0 ? 'saving' : 'saved');
    this.emit({ phase, pending, conflicts, lastSavedAt: this.lastSavedAt, message });
  }

  private emit(status: SyncStatus) {
    this.lastStatus = status;
    this.onStatus(status);
  }

  private async reportError(err: unknown) {
    if (err instanceof NetworkError) {
      return this.report('offline', 'Cannot reach the server. Changes stay on this device and upload when the connection returns.');
    }
    if (err instanceof AuthExpiredError) {
      return this.report('error', 'Your session has expired. Sign in again to finish saving. Your changes are kept on this device.');
    }
    return this.report('error', `Saving failed: ${err instanceof Error ? err.message : String(err)}. Your changes are kept on this device.`);
  }

  /* ---- Push ------------------------------------------------------------ */

  async push() {
    const conflictKeys = new Set(await this.db.conflicts.toCollection().primaryKeys());
    const items = (await this.db.outbox.orderBy('rev').toArray()).filter((i) => !conflictKeys.has(i.key));
    if (items.length === 0) return;
    await this.report('saving');

    // Brand-new rows can go in one request; the rest need a version check each.
    const metas = await this.db.rowMeta.bulkGet(items.map((i) => i.key));
    const fresh = new Map<SyncTable, OutboxItem[]>();
    const known: OutboxItem[] = [];
    items.forEach((item, i) => {
      if (metas[i]) known.push(item);
      else fresh.set(item.table, [...(fresh.get(item.table) ?? []), item]);
    });

    let firstError: unknown = null;
    const keep = (err: unknown) => {
      if (err instanceof NetworkError || err instanceof AuthExpiredError) throw err;
      firstError ??= err;
    };

    for (const [table, list] of fresh) {
      for (let i = 0; i < list.length; i += INSERT_CHUNK) {
        await this.pushFresh(table, list.slice(i, i + INSERT_CHUNK)).catch(keep);
      }
    }
    for (let i = 0; i < known.length; i += CONCURRENCY) {
      const results = await Promise.allSettled(known.slice(i, i + CONCURRENCY).map((item) => this.pushOne(item)));
      for (const r of results) if (r.status === 'rejected') keep(r.reason);
    }
    if (firstError) throw firstError;
  }

  private async pushFresh(table: SyncTable, items: OutboxItem[]) {
    const withRows: { item: OutboxItem; row: RemotePatch }[] = [];
    for (const item of items) {
      const local = await this.readLocal(table, item.rowId);
      if (local) withRows.push({ item, row: this.withClientTime(table, local, item) });
      else await this.clearOutbox(item); // created and removed before it ever reached the server
    }
    if (withRows.length === 0) return;
    const inserted = await this.remote.insertIfAbsent(table, withRows.map((w) => w.row));
    const byId = new Map(inserted.map((r) => [r.id, r]));
    for (const { item } of withRows) {
      const row = byId.get(item.rowId);
      if (row) await this.confirm(item, row);
      else await this.pushOne(item); // the row already exists online
    }
  }

  private async pushOne(item: OutboxItem): Promise<void> {
    const { table, rowId, key } = item;
    const local = await this.readLocal(table, rowId);
    const meta = await this.db.rowMeta.get(key);

    if (!meta) {
      if (!local) return this.clearOutbox(item);
      const server = await this.remote.get(table, rowId);
      if (server) return this.resolve(item, local, server);
      const [row] = await this.remote.insertIfAbsent(table, [this.withClientTime(table, local, item)]);
      if (row) return this.confirm(item, row);
      throw new Error('The server did not save the change');
    }

    const patch = local ? this.withClientTime(table, local, item) : { deleted_at: item.dirtiedAt, client_updated_at: item.dirtiedAt };
    const updated = await this.remote.updateIfVersion(table, rowId, patch, meta.version);
    if (updated) return this.confirm(item, updated);

    // Someone else moved the row on, or our last attempt worked but its reply was lost.
    const server = await this.remote.get(table, rowId);
    if (server) return this.resolve(item, local, server);
    if (!local) return this.clearOutbox(item);
    await this.db.rowMeta.delete(key);
    return this.pushOne(item);
  }

  /** The server row is not the version we expected: decide what to do. */
  private async resolve(item: OutboxItem, local: LocalRecord | undefined, server: RemoteRow) {
    const { table, rowId } = item;
    const alreadyThere = local ? !server.deleted_at && sameContent(table, toRemote(table, local), server) : !!server.deleted_at;
    if (alreadyThere) return this.confirm(item, server);

    if (table === 'quests' || table === 'user_settings') {
      const conflict: ConflictItem = { key: item.key, table, rowId, serverRow: server, detectedAt: new Date().toISOString() };
      await this.db.conflicts.put(conflict);
      return;
    }

    if (new Date(item.dirtiedAt) >= new Date(server.client_updated_at)) {
      const patch = local ? this.withClientTime(table, local, item) : { deleted_at: item.dirtiedAt, client_updated_at: item.dirtiedAt };
      const updated = await this.remote.updateIfVersion(table, rowId, patch, server.version);
      if (updated) return this.confirm(item, updated);
      throw new Error('The row changed again while saving');
    }
    await this.apply(table, [server], true);
  }

  private withClientTime(table: SyncTable, local: LocalRecord, item: OutboxItem): RemotePatch {
    return { ...toRemote(table, local), deleted_at: null, client_updated_at: item.dirtiedAt };
  }

  /** The server has this change. Clears only the edit that was sent, not a newer one. */
  private async confirm(item: OutboxItem, row: RemoteRow) {
    await this.db.transaction('rw', this.db.outbox, this.db.rowMeta, async () => {
      await this.db.rowMeta.put({ key: item.key, version: row.version });
      const current = await this.db.outbox.get(item.key);
      if (current?.rev === item.rev) await this.db.outbox.delete(item.key);
    });
  }

  private async clearOutbox(item: OutboxItem) {
    await this.db.transaction('rw', this.db.outbox, async () => {
      const current = await this.db.outbox.get(item.key);
      if (current?.rev === item.rev) await this.db.outbox.delete(item.key);
    });
  }

  /* ---- Pull ------------------------------------------------------------ */

  async pull() {
    for (const table of SYNC_TABLES) await this.pullTable(table);
  }

  private async pullTable(table: SyncTable) {
    const state = await this.db.syncState.get(table);
    let since = state?.cursor ? new Date(new Date(state.cursor).getTime() - CURSOR_OVERLAP_MS).toISOString() : null;
    let offset = 0;
    let newest = state?.cursor ?? null;

    for (;;) {
      const page = await this.remote.listSince(table, since, offset, PAGE_SIZE);
      await this.apply(table, page);
      if (page.length) {
        const last = page[page.length - 1].updated_at;
        if (!newest || new Date(last) >= new Date(newest)) newest = last;
        if (page.length === PAGE_SIZE) {
          if (last === since) offset += page.length;
          else {
            since = last;
            offset = page.filter((r) => r.updated_at === last).length;
          }
        }
      }
      if (page.length < PAGE_SIZE) break;
    }
    await this.db.syncState.put({ key: table, cursor: newest });
  }

  /**
   * Writes server rows locally. Rows with unsent edits or an open conflict are left
   * alone unless `force` is set, so a pull can never erase local work.
   */
  private async apply(table: SyncTable, rows: RemoteRow[], force = false) {
    if (rows.length === 0) return;
    const keys = rows.map((r) => outboxKey(table, r.id));
    const tables = [this.db.quests, this.db.completions, this.db.dayMeta, this.db.settings, this.db.outbox, this.db.rowMeta, this.db.conflicts];
    await this.db.transaction('rw', tables, async () => {
      const [metas, outbox, conflicts] = await Promise.all([this.db.rowMeta.bulkGet(keys), this.db.outbox.bulkGet(keys), this.db.conflicts.bulkGet(keys)]);
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!force) {
          if (outbox[i] || conflicts[i]) continue;
          if ((metas[i]?.version ?? 0) >= row.version) continue;
        }
        await this.writeLocal(table, row);
        await this.db.rowMeta.put({ key: keys[i], version: row.version });
        if (force) {
          await this.db.outbox.delete(keys[i]);
          await this.db.conflicts.delete(keys[i]);
        }
      }
    });
  }

  private async writeLocal(table: SyncTable, row: RemoteRow) {
    const deleted = !!row.deleted_at;
    switch (table) {
      case 'quests':
        return deleted ? this.db.quests.delete(row.id) : void (await this.db.quests.put(fromRemote(table, row) as never));
      case 'completions':
        return deleted ? this.db.completions.delete(row.id) : void (await this.db.completions.put(fromRemote(table, row) as never));
      case 'day_meta':
        return deleted ? this.db.dayMeta.delete(row.id) : void (await this.db.dayMeta.put(fromRemote(table, row) as DayMeta));
      case 'user_settings': {
        const current = await this.db.settings.get('settings');
        const base = current ?? defaultSettings(new Date().toISOString().slice(0, 10));
        const device = Object.fromEntries(DEVICE_ONLY_SETTINGS.map((k) => [k, base[k]]));
        await this.db.settings.put({ ...base, ...(fromRemote(table, row) as Partial<Settings>), ...device, id: 'settings' });
      }
    }
  }

  private async readLocal(table: SyncTable, rowId: string): Promise<LocalRecord | undefined> {
    switch (table) {
      case 'quests':
        return this.db.quests.get(rowId);
      case 'completions':
        return this.db.completions.get(rowId);
      case 'day_meta':
        return this.db.dayMeta.get(rowId);
      case 'user_settings':
        return this.db.settings.get(rowId === SETTINGS_ROW_ID ? 'settings' : rowId);
    }
  }

  /* ---- Conflicts ------------------------------------------------------- */

  async keepOtherDevice(key: string) {
    const conflict = await this.db.conflicts.get(key);
    if (!conflict) return;
    await this.apply(conflict.table, [conflict.serverRow as RemoteRow], true);
    await this.sync();
  }

  async keepThisDevice(key: string) {
    const conflict = await this.db.conflicts.get(key);
    if (!conflict) return;
    await this.db.transaction('rw', this.db.conflicts, this.db.rowMeta, this.db.outbox, async () => {
      await this.db.rowMeta.put({ key, version: (conflict.serverRow as RemoteRow).version });
      await this.db.conflicts.delete(key);
      const item = await this.db.outbox.get(key);
      await this.db.outbox.put({
        key,
        table: conflict.table,
        rowId: conflict.rowId,
        rev: (item?.rev ?? 0) + 1,
        dirtiedAt: new Date().toISOString(),
      });
    });
    await this.sync();
  }
}
