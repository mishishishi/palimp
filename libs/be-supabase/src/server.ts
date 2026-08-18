import type { Message, PalimpServerBackendAdapter } from "@palimp/core";

export const createServerAdapter = (
  url: string,
  secretKey: string,
): PalimpServerBackendAdapter => {
  const loadMessages = async (): Promise<Message[]> => {
    const res = await fetch(`${url}/rest/v1/inline?select=key,value`, {
      headers: {
        apikey: secretKey,
        Authorization: `Bearer ${secretKey}`,
      },
    });

    if (!res.ok) {
      // PostgREST puts the fix in the body: a missing table grant comes back as
      // 42501 with the exact GRANT statement in `hint`. Reporting the status
      // alone discarded that and made a one-line fix look like a dead end.
      const body = await res.text().catch(() => "");

      throw new Error(
        `palimp: Supabase rejected loadMessages() with ${res.status} ${res.statusText}` +
          (body ? ` — ${body}` : ""),
      );
    }
    return res.json();
  };

  return {
    loadMessages,
  };
};
