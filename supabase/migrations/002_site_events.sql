-- Run this in Supabase Dashboard -> SQL Editor
-- Lightweight analytics/events backend for launch stats
-- Public clients can insert events, but cannot read them through the API.

create table if not exists public.site_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  session_id text not null,
  user_id uuid references auth.users(id) on delete set null,
  last_screen text,
  page_path text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint site_events_event_name_check
    check (event_name ~ '^[a-z][a-z0-9_]{1,80}$')
);

alter table public.site_events enable row level security;

drop policy if exists "Anon can insert anonymous events" on public.site_events;
create policy "Anon can insert anonymous events"
  on public.site_events for insert
  to anon
  with check (user_id is null);

drop policy if exists "Authenticated can insert own events" on public.site_events;
create policy "Authenticated can insert own events"
  on public.site_events for insert
  to authenticated
  with check (user_id is null or user_id = (select auth.uid()));

create index if not exists site_events_created_at_idx
  on public.site_events(created_at desc);

create index if not exists site_events_event_name_created_at_idx
  on public.site_events(event_name, created_at desc);

create index if not exists site_events_session_id_idx
  on public.site_events(session_id);

create index if not exists site_events_user_id_idx
  on public.site_events(user_id)
  where user_id is not null;
