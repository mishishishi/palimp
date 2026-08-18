"use client";

import { useEffect, useId } from "react";
import type { PalimpField } from "../types.ts";
import { fieldsStore } from "./fieldsStore.ts";

interface Props {
  group: string;
  fields: ReadonlyArray<PalimpField>;
}

export const PalimpFields = ({ group, fields }: Props) => {
  const id = useId();

  // The host passes an inline array, so its identity changes on every render.
  // A serialised signature is what stops the effect re-registering each time;
  // `group` and `fields` are read inside the effect but covered by it.
  const signature = JSON.stringify([group, fields]);

  useEffect(() => {
    fieldsStore.register(id, { group, fields });

    return () => fieldsStore.unregister(id);
  }, [id, signature]);

  // Renders nothing, deliberately: declaring a field must cost the page no
  // layout. The editors live in the Devtools modal.
  return null;
};
