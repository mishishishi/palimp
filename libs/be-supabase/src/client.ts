import type { PalimpClientBackendAdapter } from "@palimp/core";
import type { SupabaseClient } from "@supabase/supabase-js";

export const createClientAdapter = (
  url: string,
  key: string,
): PalimpClientBackendAdapter => {
  let supabase: SupabaseClient = null!;

  const ensureSupabase = async () => {
    if (supabase) return;

    const m = await import("@supabase/ssr");

    supabase = m.createBrowserClient(url, key);
  };

  return {
    login: async (value) => {
      await ensureSupabase();

      if (value.type === "email-password") {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: value.email,
          password: value.password,
        });

        if (signInError) {
          throw signInError;
        }

        return;
      }
      // value satisfies never;
    },
    logout: async () => {
      await ensureSupabase();
      await supabase.auth.signOut();
    },
    hasSession: () => hasAuthCookie(url),

    getUser: async () => {
      await ensureSupabase();

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        // Clear the cookie before throwing. `hasSession()` only sniffs for it,
        // so one that outlives its session reports true on every reload — this
        // is the correction path the Firebase adapter gets from
        // `setSessionFlag(false)`. `signOut()` is what removes it (the cookie
        // is chunked, so deleting it by hand is not reliable) and it ignores a
        // 401/403 from a session the server has already dropped. A fetch
        // failure is *not* evidence the session is gone, so an offline reload
        // leaves the cookie alone rather than signing the admin out.
        if (userError?.name !== "AuthRetryableFetchError") {
          try {
            await supabase.auth.signOut();
          } catch {
            // Ignore — the error thrown below is the one worth reporting.
          }
        }

        throw userError ?? new Error("Not authenticated");
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("name, publish_token")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profileError) {
        throw profileError;
      }

      return {
        id: user.id,
        email: user.email ?? "",
        name: (profile?.name as string | null) ?? undefined,
        publishToken: (profile?.publish_token as string | null) ?? undefined,
      };
    },

    getKey: async (key) => {
      await ensureSupabase();

      const result = await supabase
        .from("inline")
        .select("value")
        .eq("key", key)
        .maybeSingle();

      return result.data?.value ?? null;
    },
    setKeys: async (entries) => {
      await ensureSupabase();

      if (entries.length === 0) return;

      const rows = entries.map(([key, value]) => ({ key, value }));
      const { error } = await supabase
        .from("inline")
        .upsert(rows, { onConflict: "key" });

      if (error) {
        throw error;
      }
    },
  };
};

function hasAuthCookie(url: string): boolean {
  if (typeof document === "undefined") return false;

  if (!url) return false;
  const ref = url.match(/^https?:\/\/([^.]+)\./)?.[1];
  if (!ref) return false;
  const prefix = `sb-${ref}-auth-token`;
  return document.cookie
    .split("; ")
    .some((c) => c.startsWith(`${prefix}=`) || c.startsWith(`${prefix}.`));
}
