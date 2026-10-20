-- v2 (app.html) account roadmaps: one row per roadmap.
-- Separate from user_journeys, which v1 overwrites as a single row per user.
-- The client strips chat messages before upload (see js/v2/state/cloud-roadmaps.js).

create table if not exists public.user_roadmaps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  roadmap_key text not null,
  kind text not null default 'roadmap',
  title text not null default 'Roadmap',
  is_active boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_roadmaps_user_key unique (user_id, roadmap_key),
  constraint user_roadmaps_kind_check check (kind in ('roadmap', 'imported')),
  constraint user_roadmaps_key_len check (char_length(roadmap_key) between 1 and 120),
  constraint user_roadmaps_title_len check (char_length(title) <= 200)
);

comment on table public.user_roadmaps is
  'v2 roadmaps, one row per roadmap. Structured nodes, missions and notes only. Client strips chat messages before upload.';
comment on column public.user_roadmaps.payload is
  'journey (messages empty), graph, profile enums, location. No raw chat transcripts.';

alter table public.user_roadmaps enable row level security;

drop policy if exists "Users read own roadmaps" on public.user_roadmaps;
create policy "Users read own roadmaps"
  on public.user_roadmaps for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users insert own roadmaps" on public.user_roadmaps;
create policy "Users insert own roadmaps"
  on public.user_roadmaps for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "Users update own roadmaps" on public.user_roadmaps;
create policy "Users update own roadmaps"
  on public.user_roadmaps for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Users delete own roadmaps" on public.user_roadmaps;
create policy "Users delete own roadmaps"
  on public.user_roadmaps for delete
  to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.user_roadmaps from anon;
grant select, insert, update, delete on public.user_roadmaps to authenticated;
