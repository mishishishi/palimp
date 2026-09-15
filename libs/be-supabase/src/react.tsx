"use client";
import { createClientAdapter } from "./client";
import { useMemo, type ReactNode } from "react";
import { PalimpClientBackendContext } from "@palimp/core";
import { SupabaseMediaProvider } from "./MediaProvider";
import type { SupabaseMediaOptions } from "./media";

interface Props {
  url: string;
  publishableKey: string;
  /**
   * Mount a media adapter beside the backend one, on the same project and the
   * same session. Omit it and the collections modal's image widget keeps its
   * URL input but renders Upload and Choose existing disabled, saying so.
   */
  media?: SupabaseMediaOptions;

  children: ReactNode;
}

export const PalimpSupabaseProvider = ({
  url,
  publishableKey,
  media,
  children,
}: Props) => {
  const client = useMemo(() => createClientAdapter(url, publishableKey), []);

  return (
    <PalimpClientBackendContext value={client}>
      {media ? (
        <SupabaseMediaProvider
          url={url}
          publishableKey={publishableKey}
          options={media}
        >
          {children}
        </SupabaseMediaProvider>
      ) : (
        children
      )}
    </PalimpClientBackendContext>
  );
};
