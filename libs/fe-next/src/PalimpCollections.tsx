// The `./collections` subpath, not the package root: this is a server
// component, and the root entry drags in `createContext`.
import {
  collectionKey,
  serializeCollectionDocument,
  type CollectionRegistration,
  type CollectionSchema,
} from "@palimp/core/collections";
import { loadMessages } from "./palimp.tsx";
import { PalimpCollectionsClient } from "./PalimpCollectionsClient.tsx";

interface Props {
  collections: ReadonlyArray<CollectionSchema>;
}

/**
 * Registers collections for the Devtools modal. This is fe-next's only async
 * *server* component, deliberately not the PalimpFields shape: a client
 * component's props serialise into the flight payload regardless of the admin
 * check, and copying that shape here would ship `defaultItems` — the entire
 * in-repo seed — on top of content the page has already rendered. Resolving on
 * the server ships a lean declaration plus exactly one copy of the item data:
 * the stored row if there is one, the serialized seed if there is not.
 *
 * Two costs, documented in the README quirks: it cannot be rendered inside a
 * "use client" subtree, and it awaits loadMessages(), so setBackendAdapter()
 * must have run even on a page that never calls palimp().
 */
export const PalimpCollections = async ({ collections }: Props) => {
  const messages = await loadMessages();

  const registrations: ReadonlyArray<CollectionRegistration> = collections.map(
    (schema) => {
      const { defaultItems, ...declaration } = schema;
      const key = collectionKey(schema);
      const row = messages.find((m) => m.key === key);

      return {
        declaration,
        staleDocument:
          row?.value ?? serializeCollectionDocument(defaultItems ?? []),
      };
    },
  );

  return <PalimpCollectionsClient registrations={registrations} />;
};
