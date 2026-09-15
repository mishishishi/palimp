import type { PalimpMediaAdapter, PalimpMediaAsset } from "@palimp/core";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface SupabaseMediaOptions {
  /** The Storage bucket objects live in. Default `"palimp"`. */
  bucket?: string;
}

/**
 * A `PalimpMediaAdapter` over Supabase Storage.
 *
 * It takes the same `url` and `publishableKey` as `createClientAdapter`
 * because it is the same project, the same key and the same session:
 * `createBrowserClient` returns a singleton in a browser, so this reaches the
 * client the backend adapter already built, and uploads run under the signed
 * in owner's JWT. That is why media rides the backend provider's `media` prop
 * rather than getting a provider of its own.
 *
 * Bucket setup — one public bucket, insert-and-select for `authenticated`,
 * deliberately no update and no delete — is in the package README.
 */
export const createMediaAdapter = (
  url: string,
  publishableKey: string,
  options: SupabaseMediaOptions = {},
): PalimpMediaAdapter => {
  const bucket = options.bucket ?? "palimp";
  let supabase: SupabaseClient = null!;

  const ensureSupabase = async () => {
    if (supabase) return;

    const m = await import("@supabase/ssr");

    supabase = m.createBrowserClient(url, publishableKey);
  };

  // Written out rather than obtained from `getPublicUrl()`, so `url()` stays
  // pure and synchronous and no SDK is initialised to produce a string. This
  // is the format that method builds.
  const publicUrl = (path: string): string =>
    `${url.replace(/\/+$/, "")}/storage/v1/object/public/${bucket}/${path}`;

  return {
    upload: async (path, file) => {
      await ensureSupabase();

      const { error } = await supabase.storage.from(bucket).upload(path, file, {
        // Seconds; Supabase composes the header and serves
        // `cache-control: public, max-age=31536000`. There is no way to add
        // `immutable` through this API, and it is not needed: the bytes at a
        // path never change, because paths are unique and the policies permit
        // no update.
        cacheControl: "31536000",
        // Never overwrite. The policies refuse it too — this is the client
        // half of the same rule, and what turns a path collision into an
        // error instead of a silent replacement.
        upsert: false,
        ...(file.type ? { contentType: file.type } : {}),
      });

      if (error) {
        throw error;
      }

      return {
        path,
        url: publicUrl(path),
        size: file.size,
        ...(file.type ? { contentType: file.type } : {}),
      };
    },

    list: async (prefix) => {
      await ensureSupabase();

      const { data, error } = await supabase.storage.from(bucket).list(prefix, {
        limit: 1000,
        // Names carry a UTC timestamp first, so name-descending is
        // newest-first with no metadata call and no second request.
        sortBy: { column: "name", order: "desc" },
      });

      if (error) {
        throw error;
      }

      const assets: PalimpMediaAsset[] = [];

      for (const entry of data ?? []) {
        // A folder has a null id, and Supabase writes a hidden
        // `.emptyFolderPlaceholder` object into an empty one. Neither is an
        // asset the owner uploaded.
        if (entry.id === null || entry.name.startsWith(".")) continue;

        const path = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
        const size = entry.metadata?.["size"];
        const mimetype = entry.metadata?.["mimetype"];

        assets.push({
          path,
          url: publicUrl(path),
          ...(typeof size === "number" ? { size } : {}),
          ...(typeof mimetype === "string" ? { contentType: mimetype } : {}),
        });
      }

      return assets;
    },

    url: publicUrl,
  };
};
