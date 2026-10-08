import { useMutation } from "@tanstack/react-query";
import { Modal } from "antd";
import { use, useMemo } from "react";
import {
  readCollectionDocument,
  validateCollectionItems,
} from "../../collections";
import { PalimpClientBackendContext } from "../../PalimpClientBackendContext";
import { useCollections, type RegisteredCollection } from "../collectionsStore";
import { editQueryKey, editsStore, usePendingEdits } from "../editsStore";
import { queryClient } from "../queryClient";

/** The most item lines the confirm lists before "and N more items". */
const MAX_LINES = 8;

export const useSaveButton = () => {
  const backend = use(PalimpClientBackendContext);
  const [modal, contextHolder] = Modal.useModal();

  const mutation = useMutation(
    {
      mutationKey: ["palimp:save"],
      mutationFn: async () => {
        const entries = editsStore.entries();
        if (entries.length === 0) return;

        await backend.setKeys(entries);
        editsStore.clear();
        for (const [key] of entries) {
          queryClient.invalidateQueries({ queryKey: editQueryKey(key) });
        }
      },
    },
    queryClient,
  );

  const pending = usePendingEdits();
  const collections = useCollections();

  const unpublishable = useMemo(
    () => findUnpublishable(pending, collections),
    [pending, collections],
  );

  const onClick = () => {
    if (unpublishable.length === 0) {
      mutation.mutate();
      return;
    }

    // Confirms, never blocks (D15): Save is one all-or-nothing batch, so a
    // disabled button would hold every other pending edit hostage to one bad
    // item — and a saved invalid item loses nothing.
    modal.confirm({
      title: "Some items won't appear on the site",
      content: (
        <>
          <p>
            Saving keeps them, but the site leaves them out until they are
            fixed in Collections:
          </p>
          <ul style={{ paddingInlineStart: 20, margin: 0 }}>
            {unpublishable.slice(0, MAX_LINES).map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
          {unpublishable.length > MAX_LINES && (
            <p style={{ marginBottom: 0 }}>
              and {unpublishable.length - MAX_LINES} more items
            </p>
          )}
        </>
      ),
      okText: "Save anyway",
      cancelText: "Keep editing",
      // Returns nothing, so the dialog closes at once and the drawer's button
      // shows "Saving..." as it always has.
      onOk: () => {
        mutation.mutate();
      },
    });
  };

  return {
    props: {
      disabled: pending.length === 0 || mutation.isPending,
      onClick,
    },
    isPending: mutation.isPending,
    length: pending.length,
    // Rendered once by the drawer, so the confirm inherits the host's antd
    // theme — the reason for the hook form over static Modal.confirm.
    contextHolder,
  };
};

/**
 * One owner-facing line per pending collection item the next build drops —
 * by construction, since it is the build's own two calls on the same string.
 * Only pending entries of registered collections count: a stored invalid item
 * with no draft is not written by this Save, and schema problems are the
 * developer's, not the owner's.
 */
const findUnpublishable = (
  pending: ReadonlyArray<readonly [string, string]>,
  collections: ReadonlyArray<RegisteredCollection>,
): ReadonlyArray<string> => {
  const byKey = new Map(collections.map((c) => [c.key, c]));
  const lines: string[] = [];

  for (const [key, value] of pending) {
    const collection = byKey.get(key);
    if (!collection) continue;

    const { declaration } = collection;
    const label = declaration.label ?? declaration.name;

    const document = readCollectionDocument(value);
    if (!document.ok) {
      lines.push(
        `${label} — unreadable — the site will fall back to its defaults`,
      );
      continue;
    }

    const { checks } = validateCollectionItems(declaration, document.items);
    checks.forEach((check, index) => {
      const [first, ...rest] = check.problems;
      if (check.valid || !first) return;

      const rawItem = document.items[index];
      const rawId = isPlainObject(rawItem)
        ? rawItem[declaration.idField]
        : undefined;
      const id = typeof rawId === "string" && rawId !== "" ? ` ${rawId}` : "";
      const problem = first.path
        ? `${first.path}: ${first.message}`
        : first.message;
      const more = rest.length > 0 ? ` (+${rest.length} more)` : "";

      lines.push(`${label} — #${index}${id}: ${problem}${more}`);
    });
  }

  return lines;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
