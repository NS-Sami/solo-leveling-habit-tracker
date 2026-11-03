# Data Model

## Local (IndexedDB via Dexie), current

| Table | Key | Fields |
|---|---|---|
| `quests` | `id` | name, category, stat, exp, difficulty, scheduleDays[], order, createdAt, archivedAt, updatedAt |
| `completions` | `id` = `questId\|date` | questId, date, **expAwarded** (snapshot), stat, category, completedAt |
| `dayMeta` | `date` | restDay |
| `settings` | `'settings'` | hunterName, avatarDataUrl, sfxOn, volume, emergencyHour, emergencyThreshold, streakThreshold, cycleAnchor, quote, media[], activeMediaId, anthemBlobKey, lastBackupAt, schemaVersion |
| `blobs` | `key` | uploaded video / audio files (kept out of JSON backups) |

**Why the completion id is deterministic:** toggling is idempotent (one completion per quest per day), and an import or sync can safely `put` the same record twice.

**Schema changes:** add `this.version(2).stores({...}).upgrade(tx => ...)` in `src/data/db.ts`. Never edit version 1 in place.

## Backup file (`the-system-backup-YYYY-MM-DD.json`)

```json
{
  "app": "the-system",
  "version": 1,
  "exportedAt": "2026-11-04T10:00:00.000Z",
  "quests": [ ... ],
  "completions": [ ... ],
  "dayMeta": [ ... ],
  "settings": { ... }
}
```

## Cloud sync: ready-to-use Supabase / PostgreSQL schema

Not wired up yet (it's on the roadmap). All writes already go through `src/data/actions.ts`, so a sync adapter only needs to mirror those calls.

```sql
-- Supabase: run in SQL editor. Row Level Security keeps each hunter's data private.
create table quests (
  id            text primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  name          text not null,
  category      text not null check (category in ('Physical','Spiritual','Intellectual','Health','Routine')),
  stat          text not null check (stat in ('STR','AGI','INT','VIT','SEN')),
  exp           int  not null check (exp > 0),
  difficulty    text not null check (difficulty in ('Easy','Normal','Hard')),
  schedule_days int[] not null default '{0,1,2,3,4,5,6}',
  sort_order    int  not null default 0,
  created_at    date not null default current_date,
  archived_at   date,
  updated_at    timestamptz not null default now(),
  deleted       boolean not null default false          -- tombstone for sync
);

create table completions (
  id            text primary key,                        -- questId|date
  user_id       uuid not null references auth.users(id) on delete cascade,
  quest_id      text not null,
  date          date not null,
  exp_awarded   int  not null,
  stat          text not null,
  category      text not null,
  completed_at  timestamptz not null default now(),
  deleted       boolean not null default false,
  updated_at    timestamptz not null default now(),
  unique (user_id, quest_id, date)
);

create table day_meta (
  user_id  uuid not null references auth.users(id) on delete cascade,
  date     date not null,
  rest_day boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);

create table settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data    jsonb not null,
  updated_at timestamptz not null default now()
);

alter table quests      enable row level security;
alter table completions enable row level security;
alter table day_meta    enable row level security;
alter table settings    enable row level security;

create policy "own rows" on quests      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on completions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on day_meta    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on settings    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index on completions (user_id, date);
```

**Sync strategy (planned):** last-write-wins on `updated_at`. Unchecking becomes a tombstone (`deleted = true`) instead of a hard delete, so an offline device can't bring a completion back to life.
