-- Founder launch stats (Analytics page). Counts distinct sessions from site_events.
-- Sessions that ever signed in as the founder are excluded, including events before login.
-- Callable by signed-in users only; the function itself rejects everyone but the founder.

create or replace function public.get_launch_stats(since_at timestamptz default null)
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
    with my_sessions as (
      select distinct session_id
      from public.site_events
      where user_id = founder_id
    ),
    filtered as (
      select *
      from public.site_events e
      where e.session_id not in (select session_id from my_sessions)
        and (since_at is null or e.created_at >= since_at)
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

revoke execute on function public.get_launch_stats(timestamptz) from public, anon;
grant execute on function public.get_launch_stats(timestamptz) to authenticated;
