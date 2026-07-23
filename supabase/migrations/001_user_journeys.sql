-- Run in Supabase Dashboard -> SQL Editor
-- Cloud sync for structured roadmap progress (NOT raw chat transcripts).
-- Client strips history/allTaskChats before upsert (see stripTranscriptsFromCloudPayload in index.html).

create table if not exists public.user_journeys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint user_journeys_user_id_key unique (user_id)
);

comment on table public.user_journeys is
  'Structured career roadmap sync only. Client must not upload raw chat transcripts or health-adjacent free text.';
comment on column public.user_journeys.payload is
  'Roadmap stages, ideas, profile enums. history and allTaskChats must be empty arrays/objects in cloud payloads.';

alter table public.user_journeys enable row level security;

drop policy if exists "Users can read own journey" on public.user_journeys;
create policy "Users can read own journey"
  on public.user_journeys for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users can upsert own journey" on public.user_journeys;
create policy "Users can upsert own journey"
  on public.user_journeys for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can update own journey" on public.user_journeys;
create policy "Users can update own journey"
  on public.user_journeys for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can delete own journey" on public.user_journeys;
create policy "Users can delete own journey"
  on public.user_journeys for delete
  to authenticated
  using (user_id = (select auth.uid()));

create index if not exists user_journeys_updated_at_idx
  on public.user_journeys(updated_at desc);
