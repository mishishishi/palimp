import type { PalimpServerBackendAdapter } from "@palimp/core";
// The runtime imports come from the `./collections` subpath, not the package
// root: this module is imported by server components, and the root entry
// re-exports the React contexts, whose `createContext` is not available there.
import {
  collectionKey,
  formatCollectionProblem,
  parseCollectionDocument,
  type CollectionField,
  type CollectionItem,
  type CollectionSchema,
} from "@palimp/core/collections";
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
// Exported for collection() and <PalimpCollections>, which ride the same read;
// not part of the package surface (index.ts does not re-export it).
export const loadMessages = cache(() => {
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

/**
 * Reads a collection off the same cached read as palimp(). Returns the array
 * directly — the caller's next move is `.map`; palimp() returns an object only
 * because `p` needs a closure. Usable in generateStaticParams, which is what
 * lets an owner-added item mint its per-slug routes at the next Publish.
 *
 * Problems go to console.warn with the greppable `palimp: collection` prefix
 * and are not returned; invalid items are dropped, never thrown on (D4).
 */
export const collection = async <
  const F extends ReadonlyArray<CollectionField>,
>(
  schema: CollectionSchema<F>,
): Promise<ReadonlyArray<CollectionItem<F>>> => {
  const messages = await loadMessages();
  const key = collectionKey(schema);
  const row = messages.find((m) => m.key === key);

  const { items, problems } = parseCollectionDocument(
    schema,
    row?.value ?? null,
  );

  for (const problem of problems) {
    console.warn(formatCollectionProblem(schema.name, problem));
  }

  return items;
};
