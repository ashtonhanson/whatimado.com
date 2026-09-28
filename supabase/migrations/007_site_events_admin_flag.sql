-- Explicit admin flag on analytics events.
-- Every event in a session that ever signed in as the founder is is_admin = true,
-- including the events before login. Admin rows stay in the table for debugging;
-- get_launch_stats hides them unless include_admin is true (Analytics "Clean View" off).
-- The flag is set by a trigger, so a browser cannot mark or unmark events itself.

alter table public.site_events
  add column if not exists is_admin boolean not null default false;

update public.site_events e
set is_admin = true
where not e.is_admin
  and e.session_id in (
    select distinct session_id
    from public.site_events
    where user_id = '3a861ded-c448-4662-9e27-9f4fc90966cf'
  );

create index if not exists site_events_admin_session_idx
  on public.site_events(session_id)
  where is_admin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.site_events_set_admin_flag()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  -- ADMIN_USER_ID_PLACEHOLDER: founder/admin Supabase auth user id. Keep in sync with
  -- ADMIN_USER_ID in js/v2/state/cloud-config.js and founder_id in public.get_launch_stats.
  admin_id constant uuid := '3a861ded-c448-4662-9e27-9f4fc90966cf';
  is_admin_user boolean := coalesce(new.user_id = admin_id, false);
begin
  new.is_admin := is_admin_user or exists (
    select 1 from public.site_events e
    where e.session_id = new.session_id and e.is_admin
  );
  if is_admin_user then
    update public.site_events
    set is_admin = true
    where session_id = new.session_id and not is_admin;
  end if;
  return new;
end;
$function$;

revoke all on function private.site_events_set_admin_flag() from public, anon, authenticated;

drop trigger if exists site_events_set_admin_flag on public.site_events;
create trigger site_events_set_admin_flag
  before insert on public.site_events
  for each row execute function private.site_events_set_admin_flag();

drop function if exists public.get_launch_stats(timestamptz);

create or replace function public.get_launch_stats(
  since_at timestamptz default null,
  include_admin boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  founder_id constant uuid := '3a861ded-c448-4662-9e27-9f4fc90966cf';
begin
  if auth.uid() is distinct from founder_id then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return (
    with in_period as (
      select *
      from public.site_events e
      where since_at is null or e.created_at >= since_at
    ),
    filtered as (
      select *
      from in_period
      where include_admin or not is_admin
    ),
    daily as (
      select
        date(timezone('America/Chicago', created_at)) as day,
        count(distinct session_id) filter (where event_name = 'app_loaded') as visits,
        count(distinct session_id) filter (where event_name = 'prompt_submitted') as started,
        count(distinct session_id) filter (where event_name = 'map_generated') as maps
      from filtered
      group by 1
      order by 1 desc
      limit 14
    )
    select jsonb_build_object(
      'visits', (select count(distinct session_id) from filtered where event_name = 'app_loaded'),
      'started', (select count(distinct session_id) from filtered where event_name = 'prompt_submitted'),
      'got_map', (select count(distinct session_id) from filtered where event_name = 'map_generated'),
      'roadmaps', (select count(distinct session_id) from filtered where event_name = 'roadmap_opened'),
      'include_admin', include_admin,
      'admin_sessions', (select count(distinct session_id) from in_period where is_admin),
      'daily', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'day', to_char(d.day, 'Mon DD'),
            'day_iso', d.day::text,
            'visits', d.visits,
            'started', d.started,
            'maps', d.maps
          )
          order by d.day desc
        )
        from daily d
      ), '[]'::jsonb),
      'generated_at', now()
    )
  );
end;
$function$;

revoke execute on function public.get_launch_stats(timestamptz, boolean) from public, anon;
grant execute on function public.get_launch_stats(timestamptz, boolean) to authenticated;

notify pgrst, 'reload schema';
