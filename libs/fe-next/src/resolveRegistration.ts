// The `./collections` subpath, not the package root: this module is imported
// by server components, and the root entry drags in `createContext`.
import {
  collectionKey,
  serializeCollectionDocument,
  type AnyCollectionSchema,
  type CollectionRegistration,
} from "@palimp/core/collections";
import { loadMessages } from "./palimp.tsx";

/**
 * The one resolution both server components share, so they cannot drift:
 * strip `defaultItems` into a lean declaration, and resolve `staleDocument`
 * as the stored row or the serialized seed — one copy of the item data,
 * never both. Rides the same cached read as palimp(), so it costs nothing
 * however many times it is awaited per render.
 */
export const resolveRegistration = async (
  schema: AnyCollectionSchema,
): Promise<CollectionRegistration> => {
  const messages = await loadMessages();
  const { defaultItems, ...declaration } = schema;
  const key = collectionKey(schema);
  const row = messages.find((m) => m.key === key);

  return {
    declaration,
    staleDocument: row?.value ?? serializeCollectionDocument(defaultItems ?? []),
  };
};
