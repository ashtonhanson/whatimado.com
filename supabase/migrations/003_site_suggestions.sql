-- Product feedback only — not for personal or health-related content.
-- Client sanitizes text before insert (sanitizeFreeTextForStorage).

create table if not exists public.site_suggestions (
  id uuid primary key default gen_random_uuid(),
  suggestion text not null,
  submitter_name text,
  session_id text,
  user_id uuid references auth.users(id) on delete set null,
  page_path text,
  build_tag text,
  created_at timestamptz not null default now(),
  constraint site_suggestions_suggestion_len check (char_length(suggestion) <= 2000)
);

comment on table public.site_suggestions is
  'Product feedback and feature suggestions. Must not contain PHI; client redacts health-adjacent language.';

alter table public.site_suggestions enable row level security;

drop policy if exists "Anon can insert suggestions" on public.site_suggestions;
create policy "Anon can insert suggestions"
  on public.site_suggestions for insert
  to anon
  with check (user_id is null);

drop policy if exists "Authenticated can insert suggestions" on public.site_suggestions;
create policy "Authenticated can insert suggestions"
  on public.site_suggestions for insert
  to authenticated
  with check (user_id is null or user_id = (select auth.uid()));

-- No public read policies — admin access via service role only.

create index if not exists site_suggestions_created_at_idx
  on public.site_suggestions(created_at desc);
