"use client";
import { PalimpMediaContext } from "@palimp/core";
import { useMemo, type ReactNode } from "react";
import { createMediaAdapter, type SupabaseMediaOptions } from "./media";

interface Props {
  url: string;
  publishableKey: string;
  options: SupabaseMediaOptions;

  children: ReactNode;
}

/**
 * Its own component rather than a branch inside `PalimpSupabaseProvider`,
 * because building the adapter is a `useMemo` and a hook cannot be called
 * conditionally: a host that mounted no `media` prop should construct nothing.
 * `PalimpMediaContext` already defaults to `null`, so not rendering this is
 * exactly the "no media provider" state the image widget shows.
 */
export const SupabaseMediaProvider = ({
  url,
  publishableKey,
  options,
  children,
}: Props) => {
  const media = useMemo(
    () => createMediaAdapter(url, publishableKey, options),
    [],
  );

  return <PalimpMediaContext value={media}>{children}</PalimpMediaContext>;
};
