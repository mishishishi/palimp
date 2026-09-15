// The `./collections` subpath, not the package root: this is a server
// component, and the root entry drags in `createContext`.
import type { CollectionSchema } from "@palimp/core/collections";
import { PalimpCollectionsClient } from "./PalimpCollectionsClient.tsx";
import { resolveRegistration } from "./resolveRegistration.ts";

interface Props {
  collections: ReadonlyArray<CollectionSchema>;
}

/**
 * Registers collections for the Devtools modal. This is an async *server*
 * component, deliberately not the PalimpFields shape: a client component's
 * props serialise into the flight payload regardless of the admin check, and
 * copying that shape here would ship `defaultItems` — the entire in-repo seed
 * — on top of content the page has already rendered. Resolving on the server
 * ships a lean declaration plus exactly one copy of the item data: the stored
 * row if there is one, the serialized seed if there is not.
 *
 * A collection rendered through <PalimpCollectionList> does not also need
 * this: the wrapper registers it itself. This component stays for collections
 * edited in the modal but not live-rendered on the page.
 *
 * Two costs, documented in the README quirks: it cannot be rendered inside a
 * "use client" subtree, and it awaits loadMessages(), so setBackendAdapter()
 * must have run even on a page that never calls palimp().
 */
export const PalimpCollections = async ({ collections }: Props) => {
  const registrations = await Promise.all(
    collections.map((schema) => resolveRegistration(schema)),
  );

  return <PalimpCollectionsClient registrations={registrations} />;
};
