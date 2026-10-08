import type { AnyCollectionSchema } from "./collections.ts";

/**
 * The prose key derived from an item: `<name>.<id>.<suffix>`. The namespace is
 * `schema.name`, not the storage key — prose keys are page keys, flat and
 * host-side, where `collection.<name>` is a storage namespace. Corollary: two
 * schemas sharing a `name` under different `key` overrides share prose
 * namespaces; the storage-key dedup in the store does not protect prose.
 *
 * It accepts the bare name because client cards must pass that form: a
 * `"use client"` card that imports the schema module for the sake of
 * `collectionItemKey(schema, …)` ships the schema — `defaultItems` included —
 * in the visitor's JS. The server side, already holding the schema, passes it.
 *
 * No locale parameter: the host's locale prefix goes *in front*, where the
 * host already solved locale. And it takes the id, not the item, so the caller
 * decides what an id is — the server side has typed items, the card has
 * `item.id`, and neither needs the schema's `idField` re-resolved.
 *
 * Its own module, not part of collections.ts, for a measured reason: this is
 * the one collections function client cards call, and bundling is
 * module-granular — were it beside the validator, every visitor bundle with a
 * card in it would carry the whole parse ladder.
 */
export const collectionItemKey = (
  collection: string | Pick<AnyCollectionSchema, "name">,
  id: string,
  suffix: string,
): string =>
  `${typeof collection === "string" ? collection : collection.name}.${id}.${suffix}`;
