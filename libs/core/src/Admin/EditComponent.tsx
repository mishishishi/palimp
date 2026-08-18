"use client";

import { useQuery } from "@tanstack/react-query";
import { use, useEffect } from "react";
import { editQueryKey, editsStore, useEdit } from "./editsStore.ts";
import { PalimpClientBackendContext } from "../PalimpClientBackendContext.ts";
import { queryClient } from "./queryClient.ts";
import { PalimpGeneralContext } from "../PalimpGeneralContext.ts";
import { retainInteractionGuard } from "./interactionGuard.ts";

export const EditComponent = ({
  messageKey,
  staleValue,
  textarea,
}: {
  messageKey: string;
  staleValue: string;
  textarea?: boolean;
}) => {
  const ctx = use(PalimpGeneralContext);
  const backend = use(PalimpClientBackendContext);

  // The guard lives on `window`, so it is installed from an effect and held by
  // a refcount: the listeners exist only while an editor is mounted, and SSR
  // never reaches them.
  useEffect(() => retainInteractionGuard(), []);

  const { data, isLoading, error } = useQuery(
    {
      queryKey: editQueryKey(messageKey),
      queryFn: () => backend.getKey(messageKey),
    },
    queryClient,
  );
  const pending = useEdit(messageKey);
  const value = pending ?? data ?? staleValue ?? "";

  const touched = pending && pending !== (data ?? staleValue ?? "");

  if (ctx.preview) {
    return <>{value}</>;
  }

  if (error) {
    console.log(error);
  }

  if (textarea) {
    return (
      <textarea
        data-palimp-editor=""
        form={DETACHED_FORM}
        value={isLoading ? "" : value}
        placeholder={isLoading ? staleValue : messageKey}
        style={{
          ...style,
          boxShadow: touched ? "0px 0px 2px 1px cyan" : undefined,
          background: error ? `rgba(255, 0, 0, 0.3)` : "transparent",
        }}
        onChange={(e) => editsStore.set(messageKey, e.target.value)}
        disabled={isLoading}
      />
    );
  }

  return (
    <input
      data-palimp-editor=""
      form={DETACHED_FORM}
      value={isLoading ? "" : value}
      placeholder={isLoading ? "Loading..." : messageKey}
      style={style}
      onChange={(e) => editsStore.set(messageKey, e.target.value)}
      disabled={isLoading || !!error}
    />
  );
};

/**
 * A `form` attribute naming no form element in the document leaves the control
 * with **no** form owner — not the nearest ancestor form, none. That keeps the
 * editor out of a host `form.elements`, out of its `reset()` (which would
 * otherwise wipe a pending edit while leaving it in `editsStore`), and out of
 * its constraint validation and implicit submission.
 */
const DETACHED_FORM = "palimp-detached";

const style: React.CSSProperties = {
  boxSizing: "border-box",

  border: "none",
  outline: "1px dashed currentcolor",
  fieldSizing: "content",
  background: "transparent",
  margin: "0",
  padding: "0",
  overflow: "hidden",

  fontSize: "inherit",
  fontFamily: "inherit",
  fontWeight: "inherit",
  color: "inherit",
  textAlign: "inherit",
  resize: "none",
  lineHeight: "inherit",
  letterSpacing: "inherit",
  textTransform: "inherit",
};
