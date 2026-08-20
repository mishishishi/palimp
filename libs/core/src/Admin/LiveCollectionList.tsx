"use client";

import { useQuery } from "@tanstack/react-query";
import {
  use,
  useEffect,
  useId,
  useMemo,
  type ComponentType,
  type ReactNode,
} from "react";
import {
  collectionKey,
  readCollectionDocument,
  validateCollectionItems,
  type CollectionRegistration,
} from "../collections.ts";
import { PalimpClientBackendContext } from "../PalimpClientBackendContext.ts";
import { collectionsStore } from "./collectionsStore.ts";
import { editQueryKey, useEdit } from "./editsStore.ts";
import { queryClient } from "./queryClient.ts";

interface Props {
  registration: CollectionRegistration;
  // The item type is erased here — typing is enforced at the host-facing seam
  // in fe-next and plumbed as `unknown` past it, the way AnyCollectionSchema
  // erases the schema's.
  itemComponent: ComponentType<{ item: unknown }>;
  children: ReactNode;
}

/**
 * The live half of `<PalimpCollectionList>`: a renderer of the working
 * document, mounted only for admins and only through `next/dynamic` — the
 * placement that keeps this file's dependencies out of every eager chunk.
 *
 * It resolves the document with the Collections modal's own chain —
 * `pending ?? data ?? staleDocument` on the same query key `useSaveButton`
 * invalidates — so a fact typed in the modal appears on the page per
 * keystroke, and the list refreshes after a save with no save-path change.
 *
 * Parsing follows the build, not the modal: invalid items are dropped,
 * silently — the modal already marks the same items via the same validator on
 * the surface where the owner can act, so the admin's page equals the next
 * Publish. An unreadable document renders `children` (the baked fragment, the
 * last known-good render); an empty *valid* document renders an empty list —
 * the owner deleted the items, and resurrecting the baked cards would be the
 * parse ladder's row-5 mistake one level up.
 *
 * No part of this is preview-aware, save-aware, or modal-aware; everything
 * else composes. Design record: docs/plans/collections/02-live-rendering.md.
 */
export const LiveCollectionList = ({
  registration,
  itemComponent: ItemComponent,
  children,
}: Props) => {
  const id = useId();
  const key = collectionKey(registration.declaration);
  const backend = use(PalimpClientBackendContext);

  // The wrapper is also the registrar (D8): registering costs nothing it does
  // not already hold, and the store's dedup-by-resolved-key makes coexistence
  // with an explicit <PalimpCollections> carrying identical data harmless.
  // Same idiom as the registrar: the registration arrives as a fresh object
  // per render, so a serialised signature is what stops the effect
  // re-registering each time; `registration` is read inside but covered by it.
  const signature = JSON.stringify(registration);

  useEffect(() => {
    collectionsStore.register(id, [registration]);

    return () => collectionsStore.unregister(id);
  }, [id, signature]);

  const { data } = useQuery(
    {
      queryKey: editQueryKey(key),
      queryFn: () => backend.getKey(key),
    },
    queryClient,
  );
  const pending = useEdit(key);

  // EditComponent's `pending ?? data ?? staleValue` chain, the same three
  // links and meanings as the modal's.
  const raw = pending ?? data ?? registration.staleDocument;

  const document = useMemo(() => readCollectionDocument(raw), [raw]);

  const items = useMemo(() => {
    if (!document.ok) return null;

    return validateCollectionItems(
      registration.declaration,
      document.items,
    ).checks.flatMap((check) => (check.valid && check.item ? [check.item] : []));
  }, [document, registration.declaration]);

  if (items === null) {
    return <>{children}</>;
  }

  return (
    <>
      {items.map((item) => (
        // Keyed by the item's id — unique among valid items, the validator
        // rejects duplicates — so a reorder moves DOM nodes instead of
        // recreating them and a focused inline prose editor survives it.
        <ItemComponent
          key={String(item[registration.declaration.idField])}
          item={item}
        />
      ))}
    </>
  );
};
