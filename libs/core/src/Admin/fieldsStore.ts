import { useSyncExternalStore } from "react";
import type { PalimpField } from "../types.ts";

type Listener = () => void;

export interface PalimpFieldGroup {
  group: string;
  fields: ReadonlyArray<PalimpField>;
}

interface Registration {
  group: string;
  fields: ReadonlyArray<PalimpField>;
}

// Keyed by registration id, not by group: two <PalimpFields> can declare the
// same group, and each has to be able to withdraw only its own fields when it
// unmounts.
const registrations = new Map<string, Registration>();
const listeners = new Set<Listener>();
let snapshot: ReadonlyArray<PalimpFieldGroup> = [];

// Same reason as editsStore: useSyncExternalStore demands a referentially
// stable getSnapshot result, so the merged list is built on write rather than
// on read. Merging here rather than in the modal is what keeps that true —
// grouping during render would allocate a new array every time.
const refresh = () => {
  const byGroup = new Map<string, PalimpField[]>();
  const seenKeys = new Map<string, Set<string>>();

  for (const registration of registrations.values()) {
    let fields = byGroup.get(registration.group);
    let keys = seenKeys.get(registration.group);

    if (!fields || !keys) {
      fields = [];
      keys = new Set();
      byGroup.set(registration.group, fields);
      seenKeys.set(registration.group, keys);
    }

    for (const field of registration.fields) {
      // A key can legitimately be declared twice — by two <PalimpFields>, or by
      // one that also names a key already on the page. Two EditComponents on one
      // key work (they share an editsStore entry), but two rows in one group
      // read as a bug, so the first declaration wins for the label.
      if (keys.has(field.key)) continue;
      keys.add(field.key);
      fields.push(field);
    }
  }

  snapshot = Array.from(byGroup, ([group, fields]) => ({ group, fields }));
};

const emit = () => {
  refresh();
  for (const l of listeners) l();
};

export const fieldsStore = {
  register: (id: string, registration: Registration): void => {
    registrations.set(id, registration);
    emit();
  },
  unregister: (id: string): void => {
    if (registrations.delete(id)) emit();
  },
  groups: (): ReadonlyArray<PalimpFieldGroup> => snapshot,
  subscribe: (l: Listener): (() => void) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};

const emptySnapshot: ReadonlyArray<PalimpFieldGroup> = [];

export const useFieldGroups = (): ReadonlyArray<PalimpFieldGroup> =>
  useSyncExternalStore(
    fieldsStore.subscribe,
    () => snapshot,
    () => emptySnapshot,
  );
