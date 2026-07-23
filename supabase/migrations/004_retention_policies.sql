-- Optional retention: run manually or schedule via pg_cron in Supabase.
-- Deletes analytics and feedback older than 90 days.

-- site_events (from 002_site_events.sql)
delete from public.site_events
where created_at < now() - interval '90 days';

-- site_suggestions (from 003_site_suggestions.sql)
delete from public.site_suggestions
where created_at < now() - interval '90 days';

-- Example pg_cron schedule (enable pg_cron extension first):
-- select cron.schedule(
--   'whatimado-retention-90d',
--   '0 3 * * 0',
--   $$
--     delete from public.site_events where created_at < now() - interval '90 days';
--     delete from public.site_suggestions where created_at < now() - interval '90 days';
--   $$
-- );
