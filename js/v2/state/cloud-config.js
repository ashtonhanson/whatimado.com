/** Public Supabase project settings. The anon key is a browser key; row-level security guards the data. */
export const SUPABASE_URL = "https://acgjcnhcjgtpoztntcyb.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFjZ2pjbmhjamd0cG96dG50Y3liIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzMDU1MTgsImV4cCI6MjA5Njg4MTUxOH0.gEJfMFWjmsLTw2aKbjQhYDlPl_zvpjfxP8QskAN6ghQ";
export const SUPABASE_JS_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

/*
 * ADMIN_USER_ID_PLACEHOLDER: founder/admin Supabase auth user id. Replace with the real
 * production id if the founder account ever changes, and update admin_id in
 * private.site_events_set_admin_flag and founder_id in public.get_launch_stats to match.
 */
export const ADMIN_USER_ID = "3a861ded-c448-4662-9e27-9f4fc90966cf";
export const FOUNDER_USER_ID = ADMIN_USER_ID;
export const FOUNDER_EMAILS = new Set(["ashtonsemailis@gmail.com", "ashtonemail@yahoo.com"]);
export const LAUNCH_POST_SINCE = "2026-06-21T23:50:00.000Z";

/**
 * Analytics admin flag. Matches the database trigger, which checks the id only.
 * @param {{ id?: string } | null | undefined} user
 */
export function isAdminUser(user) {
  return Boolean(user?.id) && user.id === ADMIN_USER_ID;
}

/** @param {{ id?: string, email?: string } | null | undefined} user */
export function isFounderUser(user) {
  if (!user) return false;
  if (user.id === FOUNDER_USER_ID) return true;
  return FOUNDER_EMAILS.has(String(user.email || "").trim().toLowerCase());
}
