import { editQueryKey, editsStore } from "./editsStore";
import { queryClient } from "./queryClient";

/**
 * Unsaved drafts in `localStorage`, so they outlive a document load — on a
 * static export most navigations that skip `next/link` are one. Per browser,
 * not per tab: a closed tab must not lose work either, and `sessionStorage`
 * would need a `beforeunload` prompt that cannot tell a tab close from a
 * locale switch. Every tab holds the same set, kept in step by the `storage`
 * event, so two tabs never overwrite each other's drafts and a Save in one
 * clears the other's badge — it was one batch.
 */
const DRAFTS_KEY = "palimp:drafts";

type Entries = ReadonlyArray<readonly [string, string]>;

const isEntry = (value: unknown): value is readonly [string, string] =>
  Array.isArray(value) &&
  value.length === 2 &&
  typeof value[0] === "string" &&
  typeof value[1] === "string";

/** An unreadable blob is dropped, never thrown — it is a cache of typing,
 *  and nothing on the page should break over it. */
const readDrafts = (): Entries => {
  try {
    const raw = localStorage.getItem(DRAFTS_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "v" in parsed &&
      parsed.v === 1 &&
      "entries" in parsed &&
      Array.isArray(parsed.entries) &&
      parsed.entries.every(isEntry)
    ) {
      return parsed.entries;
    }
  } catch {}
  // Not JSON, or not this shape — a future version's, or damaged.
  writeDrafts([]);
  return [];
};

const writeDrafts = (entries: Entries): void => {
  try {
    if (entries.length === 0) localStorage.removeItem(DRAFTS_KEY);
    else
      localStorage.setItem(DRAFTS_KEY, JSON.stringify({ v: 1, entries }));
  } catch {}
};

/**
 * Hydrates `editsStore` once, then mirrors it both ways until stopped.
 * `restored` counts the drafts the hydration brought back, for the notice.
 */
export const startDraftsPersistence = (): {
  restored: number;
  stop: () => void;
} => {
  const stored = readDrafts();
  // A non-empty buffer is this document's own typing, already written —
  // StrictMode's second run, or a remount after the first.
  const restored = editsStore.entries().length === 0 ? stored.length : 0;
  if (restored > 0) editsStore.replaceAll(stored);

  // Set while applying another tab's write, so it is not written back.
  let applying = false;

  const unsubscribe = editsStore.subscribe(() => {
    if (!applying) writeDrafts(editsStore.entries());
  });

  const onStorage = (e: StorageEvent) => {
    if (e.storageArea !== localStorage) return;
    if (e.key !== DRAFTS_KEY && e.key !== null) return;

    const before = editsStore.entries();
    const next = readDrafts();
    const kept = new Set(next.map(([key]) => key));

    applying = true;
    try {
      editsStore.replaceAll(next);
    } finally {
      applying = false;
    }

    // A key that left the set was saved or discarded over there. Either way
    // the fetched value under it may be stale here, and a refetch is cheap.
    for (const [key] of before) {
      if (!kept.has(key)) {
        queryClient.invalidateQueries({ queryKey: editQueryKey(key) });
      }
    }
  };

  window.addEventListener("storage", onStorage);

  return {
    restored,
    stop: () => {
      unsubscribe();
      window.removeEventListener("storage", onStorage);
    },
  };
};

/** Logout's half: a shared browser must not hand one admin's drafts to the
 *  next. Clears storage directly too, in case nothing is mirroring. */
export const discardDrafts = (): void => {
  editsStore.clear();
  writeDrafts([]);
};
