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

      if (userError) {
        throw userError;
      }
      if (!user) {
        throw new Error("Not authenticated");
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
