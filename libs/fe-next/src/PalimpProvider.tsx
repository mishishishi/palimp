"use client";

import { PalimpClientBackendContext, PalimpGeneralContext } from "@palimp/core";
import dynamic from "next/dynamic";
import { use, useEffect, useState, type ReactNode } from "react";

const Devtools = dynamic(() =>
  import("@palimp/core/admin").then((m) => m.Devtools),
);

interface Props {
  children: ReactNode;
}

/**
 * Per tab, not per browser: the mode belongs to this editing session, and a
 * static export turns most navigations into document loads, which drop React
 * state. `localStorage` would also open every new tab in preview, weeks later.
 */
const PREVIEW_KEY = "palimp:preview";

// Storage can throw — disabled cookies, a sandboxed frame — and losing the
// mode across a reload is not worth breaking the editor over.
const readPreview = (): boolean => {
  try {
    return sessionStorage.getItem(PREVIEW_KEY) === "1";
  } catch {
    return false;
  }
};

const writePreview = (preview: boolean | null): void => {
  try {
    if (preview === null) sessionStorage.removeItem(PREVIEW_KEY);
    else sessionStorage.setItem(PREVIEW_KEY, preview ? "1" : "0");
  } catch {}
};

export const PalimpProvider = ({ children }: Props) => {
  const [admin, setAdmin] = useState<boolean | undefined>(undefined);
  const [preview, setPreview] = useState(false);

  const backend = use(PalimpClientBackendContext);

  useEffect(() => {
    if (admin === undefined) {
      const session = backend.hasSession();
      // Same effect, same commit: the first admin paint already has the
      // stored mode, so editors never flash before preview applies.
      setPreview(session && readPreview());
      setAdmin(session);
    }
  }, [admin]);

  return (
    <PalimpGeneralContext
      value={{
        admin: admin,
        preview,
        togglePreview: () => {
          writePreview(!preview);
          setPreview(!preview);
        },

        reset: () => {
          writePreview(null);
          setAdmin(undefined);
          setPreview(false);
        },
      }}
    >
      {children}
      {admin ? <Devtools /> : null}
    </PalimpGeneralContext>
  );
};
