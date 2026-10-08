"use client";

import { useEffect, useId } from "react";
import type { CollectionRegistration } from "../collections.ts";
import { collectionsStore } from "./collectionsStore.ts";

interface Props {
  registrations: ReadonlyArray<CollectionRegistration>;
}

export const PalimpCollections = ({ registrations }: Props) => {
  const id = useId();

  // Same shape as PalimpFields: the registrations arrive as a fresh array per
  // render, so a serialised signature is what stops the effect re-registering
  // each time; `registrations` is read inside the effect but covered by it.
  const signature = JSON.stringify(registrations);

  useEffect(() => {
    collectionsStore.register(id, registrations);

    return () => collectionsStore.unregister(id);
  }, [id, signature]);

  // Renders nothing, deliberately: declaring a collection must cost the page
  // no layout. The editor lives in the Devtools modal.
  return null;
};
