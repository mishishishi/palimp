import type { PalimpServerBackendAdapter } from "@palimp/core";
import { cache, type ReactNode } from "react";
import { XcoreClientComponent } from "./ClientComponent.tsx";

let backend: PalimpServerBackendAdapter = null!;

export const setBackendAdapter = (be: PalimpServerBackendAdapter) => {
  backend = be;
};

export class PalimpBackendAdapterUnsetError extends Error {
  constructor() {
    super(
      "palimp() was called before setBackendAdapter(). Register the server adapter in a module imported by both the layout and every page that reads it — Next does not guarantee a layout is evaluated before a page's generateMetadata.",
    );
    this.name = "PalimpBackendAdapterUnsetError";
  }
}

// cache() makes generateMetadata and the page body share one read per render.
const loadMessages = cache(() => {
  if (!backend) {
    throw new PalimpBackendAdapterUnsetError();
  }

  return backend.loadMessages();
});

export interface PalimpP {
  (key: string, options: { defaultMessage?: string; asString: true }): string;
  (
    key: string,
    options?: { defaultMessage?: string; asString?: false },
  ): ReactNode;
}

export const palimp = async (): Promise<{ p: PalimpP }> => {
  const messages = await loadMessages();

  const resolve = (key: string, defaultMessage?: string) =>
    messages.find((m) => m.key === key)?.value ?? defaultMessage ?? key;

  // The assertion is the overload-implementation gap: the return type depends
  // on an argument, which TypeScript can express in the signatures but cannot
  // verify in the body.
  const p = ((
    key: string,
    options?: { defaultMessage?: string; asString?: boolean },
  ) => {
    const value = resolve(key, options?.defaultMessage);

    if (options?.asString) {
      return value;
    }

    return <XcoreClientComponent messageKey={key} staleValue={value} />;
  }) as PalimpP;

  return { p };
};
