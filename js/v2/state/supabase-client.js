import { SUPABASE_ANON_KEY, SUPABASE_JS_URL, SUPABASE_URL } from "./cloud-config.js";

/** @type {Promise<any> | null} */
let clientPromise = null;

/**
 * Supabase client, loaded on first use so the map and chat never wait on the CDN.
 * Resolves to null when the library cannot load (offline, blocked CDN).
 * @returns {Promise<any>}
 */
export function getSupabase() {
  if (!clientPromise) {
    clientPromise = import(SUPABASE_JS_URL)
      .then(({ createClient }) =>
        createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            storageKey: "whatimado_v2_auth"
          }
        })
      )
      .catch(() => null);
  }
  return clientPromise;
}
