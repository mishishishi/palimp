"use client";

import {
  PalimpGeneralContext,
  type CollectionRegistration,
} from "@palimp/core";
import dynamic from "next/dynamic";
import { use } from "react";

// Dynamic for the same reason EditComponent and Devtools are: this is the only
// thing keeping antd, react-query and lucide out of the visitor bundle.
const Collections = dynamic(() =>
  import("@palimp/core/admin").then((m) => m.PalimpCollections),
);

interface Props {
  registrations: ReadonlyArray<CollectionRegistration>;
}

export const PalimpCollectionsClient = ({ registrations }: Props) => {
  const context = use(PalimpGeneralContext);

  // Visitors get nothing at all — not even the registration.
  if (!context.admin) {
    return null;
  }

  return <Collections registrations={registrations} />;
};
