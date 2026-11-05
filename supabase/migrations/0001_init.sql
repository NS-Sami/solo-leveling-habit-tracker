-- The System: cloud schema, version 1.
-- Paste the whole file into Supabase Dashboard > SQL Editor and press Run.
-- It is safe to run again: nothing here deletes data.
--
-- How the tables work
--   * Every row belongs to one account (user_id) and Row Level Security keeps it private.
--   * The primary key is (user_id, id), so two accounts can both own "phy-walk".
--   * A daily completion's id is "<questId>|<date>", so the same quest can only be
--     completed once per day. EXP is added up from these rows, which is what makes
--     duplicate EXP impossible.
--   * version increases on every update. The app sends the version it last saw, so an
--     old device cannot silently overwrite a newer change.
--   * deleted_at marks a row as deleted instead of removing it, so other devices find
--     out about the deletion.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.quests (
  user_id           uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id                text        not null check (char_length(id) between 1 and 100),
  name              text        not null check (char_length(name) between 1 and 500),
  category          text        not null check (category in ('Physical', 'Spiritual', 'Intellectual', 'Health', 'Routine')),
  stat              text        not null check (stat in ('STR', 'AGI', 'INT', 'VIT', 'SEN')),
  exp               integer     not null check (exp between 1 and 100000),
  difficulty        text        not null check (difficulty in ('Easy', 'Normal', 'Hard')),
  schedule_days     smallint[]  not null default '{0,1,2,3,4,5,6}' check (schedule_days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]),
  sort_order        integer     not null default 0,
  created_on        date        not null default current_date,
  archived_on       date,
  version           integer     not null default 1,
  updated_at        timestamptz not null default clock_timestamp(),
  client_updated_at timestamptz not null default clock_timestamp(),
  deleted_at        timestamptz,
  primary key (user_id, id)
);

create table if not exists public.completions (
  user_id           uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id                text        not null check (char_length(id) between 1 and 120),
  quest_id          text        not null,
  date              date        not null,
  exp_awarded       integer     not null check (exp_awarded between 0 and 100000),
  stat              text        not null check (stat in ('STR', 'AGI', 'INT', 'VIT', 'SEN')),
  category          text        not null check (category in ('Physical', 'Spiritual', 'Intellectual', 'Health', 'Routine')),
  completed_at      timestamptz not null default clock_timestamp(),
  version           integer     not null default 1,
  updated_at        timestamptz not null default clock_timestamp(),
  client_updated_at timestamptz not null default clock_timestamp(),
  deleted_at        timestamptz,
  primary key (user_id, id),
  -- One completion per quest per day, whatever the row id says.
  unique (user_id, quest_id, date)
);

create table if not exists public.day_meta (
  user_id           uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id                text        not null check (id ~ '^\d{4}-\d{2}-\d{2}$'), -- the date
  rest_day          boolean     not null default false,
  version           integer     not null default 1,
  updated_at        timestamptz not null default clock_timestamp(),
  client_updated_at timestamptz not null default clock_timestamp(),
  deleted_at        timestamptz,
  primary key (user_id, id)
);

create table if not exists public.user_settings (
  user_id           uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id                text        not null default 'settings' check (id = 'settings'),
  timezone          text        not null default 'Asia/Dhaka' check (timezone ~ '^[A-Za-z0-9_+/-]+$'),
  data              jsonb       not null default '{}'::jsonb check (pg_column_size(data) < 1048576),
  version           integer     not null default 1,
  updated_at        timestamptz not null default clock_timestamp(),
  client_updated_at timestamptz not null default clock_timestamp(),
  deleted_at        timestamptz,
  primary key (user_id, id)
);

-- ---------------------------------------------------------------------------
-- Indexes used when a device asks "what changed since I last looked?"
-- ---------------------------------------------------------------------------

create index if not exists quests_sync_idx        on public.quests (user_id, updated_at);
create index if not exists completions_sync_idx   on public.completions (user_id, updated_at);
create index if not exists day_meta_sync_idx      on public.day_meta (user_id, updated_at);
create index if not exists user_settings_sync_idx on public.user_settings (user_id, updated_at);

-- ---------------------------------------------------------------------------
-- Server-managed columns. Browsers cannot set version or updated_at themselves.
-- clock_timestamp() (not now()) gives each row in a bulk insert its own time.
-- ---------------------------------------------------------------------------

create or replace function public.touch_sync_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  if tg_op = 'UPDATE' then
    new.version := old.version + 1;
    new.user_id := old.user_id;
    new.id      := old.id;
  else
    new.version := 1;
  end if;
  return new;
end;
$$;

drop trigger if exists touch_quests on public.quests;
create trigger touch_quests before insert or update on public.quests
  for each row execute function public.touch_sync_row();

drop trigger if exists touch_completions on public.completions;
create trigger touch_completions before insert or update on public.completions
  for each row execute function public.touch_sync_row();

drop trigger if exists touch_day_meta on public.day_meta;
create trigger touch_day_meta before insert or update on public.day_meta
  for each row execute function public.touch_sync_row();

drop trigger if exists touch_user_settings on public.user_settings;
create trigger touch_user_settings before insert or update on public.user_settings
  for each row execute function public.touch_sync_row();

-- ---------------------------------------------------------------------------
-- Row Level Security: a signed-in user reaches their own rows and nobody else's.
-- Requests without a signed-in user (the anon role) get nothing at all.
-- ---------------------------------------------------------------------------

alter table public.quests        enable row level security;
alter table public.completions   enable row level security;
alter table public.day_meta      enable row level security;
alter table public.user_settings enable row level security;

revoke all on public.quests, public.completions, public.day_meta, public.user_settings from anon, public;
grant select, insert, update, delete on public.quests, public.completions, public.day_meta, public.user_settings to authenticated;

-- quests
drop policy if exists "quests_select_own" on public.quests;
drop policy if exists "quests_insert_own" on public.quests;
drop policy if exists "quests_update_own" on public.quests;
drop policy if exists "quests_delete_own" on public.quests;
create policy "quests_select_own" on public.quests for select to authenticated using ((select auth.uid()) = user_id);
create policy "quests_insert_own" on public.quests for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "quests_update_own" on public.quests for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "quests_delete_own" on public.quests for delete to authenticated using ((select auth.uid()) = user_id);

-- completions
drop policy if exists "completions_select_own" on public.completions;
drop policy if exists "completions_insert_own" on public.completions;
drop policy if exists "completions_update_own" on public.completions;
drop policy if exists "completions_delete_own" on public.completions;
create policy "completions_select_own" on public.completions for select to authenticated using ((select auth.uid()) = user_id);
create policy "completions_insert_own" on public.completions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "completions_update_own" on public.completions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "completions_delete_own" on public.completions for delete to authenticated using ((select auth.uid()) = user_id);

-- day_meta
drop policy if exists "day_meta_select_own" on public.day_meta;
drop policy if exists "day_meta_insert_own" on public.day_meta;
drop policy if exists "day_meta_update_own" on public.day_meta;
drop policy if exists "day_meta_delete_own" on public.day_meta;
create policy "day_meta_select_own" on public.day_meta for select to authenticated using ((select auth.uid()) = user_id);
create policy "day_meta_insert_own" on public.day_meta for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "day_meta_update_own" on public.day_meta for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "day_meta_delete_own" on public.day_meta for delete to authenticated using ((select auth.uid()) = user_id);

-- user_settings
drop policy if exists "user_settings_select_own" on public.user_settings;
drop policy if exists "user_settings_insert_own" on public.user_settings;
drop policy if exists "user_settings_update_own" on public.user_settings;
drop policy if exists "user_settings_delete_own" on public.user_settings;
create policy "user_settings_select_own" on public.user_settings for select to authenticated using ((select auth.uid()) = user_id);
create policy "user_settings_insert_own" on public.user_settings for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "user_settings_update_own" on public.user_settings for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "user_settings_delete_own" on public.user_settings for delete to authenticated using ((select auth.uid()) = user_id);
