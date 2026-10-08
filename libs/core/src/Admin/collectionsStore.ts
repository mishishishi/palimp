import { useSyncExternalStore } from "react";
import {
  collectionKey,
  type CollectionRegistration,
} from "../collections.ts";

type Listener = () => void;

export interface RegisteredCollection {
  /** The resolved storage key — `schema.key ?? collection.<name>`. */
  readonly key: string;
  readonly declaration: CollectionRegistration["declaration"];
  readonly staleDocument: string;
}

// Keyed by registration id, not by collection, for the same reason as
// fieldsStore: two <PalimpCollections> can register, and each has to be able
// to withdraw only its own on unmount.
const registrations = new Map<string, ReadonlyArray<CollectionRegistration>>();
const listeners = new Set<Listener>();
let snapshot: ReadonlyArray<RegisteredCollection> = [];

// Same reason as editsStore: useSyncExternalStore demands a referentially
// stable getSnapshot result, so the merged list is built on write rather than
// on read. Deduplication is by *resolved storage key*, not by collection name
// — `key` can be overridden on the schema, and two names mapping to one key is
// the collision that actually matters. First registration wins, as with
// fields.
const refresh = () => {
  const byKey = new Map<string, RegisteredCollection>();

  for (const list of registrations.values()) {
    for (const registration of list) {
      const key = collectionKey(registration.declaration);
      if (byKey.has(key)) continue;
      byKey.set(key, {
        key,
        declaration: registration.declaration,
        staleDocument: registration.staleDocument,
      });
    }
  }

  snapshot = Array.from(byKey.values());
};

const emit = () => {
  refresh();
  for (const l of listeners) l();
};

export const collectionsStore = {
  register: (
    id: string,
    list: ReadonlyArray<CollectionRegistration>,
  ): void => {
    registrations.set(id, list);
    emit();
  },
  unregister: (id: string): void => {
    if (registrations.delete(id)) emit();
  },
  collections: (): ReadonlyArray<RegisteredCollection> => snapshot,
  subscribe: (l: Listener): (() => void) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};

const emptySnapshot: ReadonlyArray<RegisteredCollection> = [];

export const useCollections = (): ReadonlyArray<RegisteredCollection> =>
  useSyncExternalStore(
    collectionsStore.subscribe,
    () => snapshot,
    () => emptySnapshot,
  );
