"use client";

import { PalimpGeneralContext, type PalimpField } from "@palimp/core";
import dynamic from "next/dynamic";
import { use } from "react";

// Dynamic for the same reason EditComponent and Devtools are: this is the only
// thing keeping antd, react-query and lucide out of the visitor bundle.
const Fields = dynamic(() =>
  import("@palimp/core/admin").then((m) => m.PalimpFields),
);

interface Props {
  group: string;
  fields: ReadonlyArray<PalimpField>;
}

export const PalimpFields = ({ group, fields }: Props) => {
  const context = use(PalimpGeneralContext);

  // Visitors get nothing at all — not even the registration.
  if (!context.admin) {
    return null;
  }

  return <Fields group={group} fields={fields} />;
};
