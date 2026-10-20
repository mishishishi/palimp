import { useSyncExternalStore } from "react";

type Listener = () => void;

const edits = new Map<string, string>();
const listeners = new Set<Listener>();
let snapshot: ReadonlyArray<readonly [string, string]> = [];

const refresh = () => {
  snapshot = Array.from(edits.entries());
};

const emit = () => {
  refresh();
  for (const l of listeners) l();
};

export const editsStore = {
  get: (key: string): string | undefined => edits.get(key),
  set: (key: string, value: string): void => {
    edits.set(key, value);
    emit();
  },
  delete: (key: string): void => {
    if (edits.delete(key)) emit();
  },
  clear: (): void => {
    if (edits.size === 0) return;
    edits.clear();
    emit();
  },
  /** Swaps the whole buffer and emits once — for drafts restored from
   *  storage, or replaced by another tab's write. */
  replaceAll: (entries: ReadonlyArray<readonly [string, string]>): void => {
    edits.clear();
    for (const [key, value] of entries) edits.set(key, value);
    emit();
  },
  entries: (): ReadonlyArray<readonly [string, string]> => snapshot,
  subscribe: (l: Listener): (() => void) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};

const emptySnapshot: ReadonlyArray<readonly [string, string]> = [];

export const useEdit = (key: string): string | undefined =>
  useSyncExternalStore(
    editsStore.subscribe,
    () => edits.get(key),
    () => undefined,
  );

export const usePendingEdits = (): ReadonlyArray<readonly [string, string]> =>
  useSyncExternalStore(
    editsStore.subscribe,
    () => snapshot,
    () => emptySnapshot,
  );

export const editQueryKey = (key: string): readonly [string, string] => [
  "palimp:edit",
  key,
];
