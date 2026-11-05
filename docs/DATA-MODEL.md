# Data Model

The source of truth for a signed-in user is Supabase. Each device keeps a local copy in IndexedDB, plus a queue of changes the server has not confirmed yet.

## Supabase tables

The full SQL, including every security policy, is in [`supabase/migrations/0001_init.sql`](../supabase/migrations/0001_init.sql).

| Table | Holds | Key |
|---|---|---|
| `quests` | Name, category, stat, EXP, difficulty, weekdays, order, archived date | `(user_id, id)` |
| `completions` | One row per quest per day, with the EXP it was worth at the time | `(user_id, id)`, unique `(user_id, quest_id, date)` |
| `day_meta` | Rest days | `(user_id, id)`, where `id` is the date |
| `user_settings` | Timezone, plus name, rules, quote and media links as JSON | `(user_id, id)` |

Every table also has:

| Column | Purpose |
|---|---|
| `user_id` | Owner. Row Level Security compares it with the signed-in user. |
| `version` | Set by the server, and increases on every update. |
| `updated_at` | Set by the server. Devices use it to ask what changed. |
| `client_updated_at` | When the edit was made on the device. |
| `deleted_at` | Marks a deletion, so other devices hear about it. |

**EXP, level, rank, stats and streaks are not stored.** They are calculated from completions, so they cannot drift out of step, and a duplicate reward would need a duplicate row, which the database refuses.

## Security

Row Level Security is on for all four tables, each with SELECT, INSERT, UPDATE and DELETE policies limited to `auth.uid() = user_id`. Visitors who are not signed in have no access.

The browser only ever holds the project URL and the publishable key, both public by design. Security comes from these rules, not from hiding the key.

## Local tables (IndexedDB)

| Database | Used for |
|---|---|
| `the-system` | Progress from before accounts, and "This device only" mode. Never deleted automatically. |
| `the-system-u-<userId>` | One account's copy. Separate per account, so a shared device cannot mix them. |
| `the-system-demo` | `?demo=1` sample data. Never uploaded. |

Each database has `quests`, `completions`, `dayMeta`, `settings` and `blobs` (uploaded video and audio, device only), plus these sync tables:

| Table | Purpose |
|---|---|
| `outbox` | Rows changed locally and not yet confirmed. Written in the same transaction as the change. |
| `rowMeta` | The server version last seen for each row. |
| `syncState` | How far each table has been pulled. |
| `conflicts` | Quests or settings changed on two devices, waiting for the user's choice. |

## How sync works

**Push.** For each row in the outbox, the device sends an update that applies only if the server's `version` still matches the one it last saw.

- Accepted: the change is confirmed and leaves the outbox, unless the user edited the row again meanwhile.
- Rejected, but the server already has the same content: an earlier attempt worked and only its reply was lost, so it counts as confirmed.
- Rejected with different content, for a completion or rest day: the later edit wins, by device time.
- Rejected with different content, for a quest or settings: the row is held as a conflict, nothing is overwritten, and the user chooses.

**Pull.** The device fetches rows changed since its last pull, reading 60 seconds further back in case a slow write finished late. Rows with unsent edits or an open conflict are skipped, so a pull cannot erase local work.

**When.** After an edit (600 ms later, so bursts share one upload), when the connection returns, when the tab regains focus, every 60 seconds, and when you press Sync now. Failures retry with increasing delays, up to 5 minutes.

Device clocks only matter for the "later edit wins" rule. A device with a badly wrong clock could win or lose that comparison, and only for that one tick.

## Schema changes

**Supabase:** add a new numbered file in `supabase/migrations/`. Do not edit one that has already run.

**Local:** add `this.version(n).stores({...}).upgrade(...)` in `src/data/db.ts`.

## Backup file

**Settings → Export JSON** downloads `the-system-backup-YYYY-MM-DD.json`:

```json
{
  "app": "the-system",
  "version": 1,
  "exportedAt": "2026-11-05T10:00:00.000Z",
  "quests": [],
  "completions": [],
  "dayMeta": [],
  "settings": {}
}
```

**Restore JSON** replaces everything in the account, on all devices, after a confirmation.
