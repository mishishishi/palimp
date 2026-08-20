"use client";

import {
  PalimpGeneralContext,
  type CollectionRegistration,
} from "@palimp/core";
import dynamic from "next/dynamic";
import { use, type ComponentType, type ReactNode } from "react";

// Dynamic for the same reason EditComponent and Devtools are: this is the only
// thing keeping antd, react-query and lucide out of the visitor bundle.
const LiveList = dynamic(() =>
  import("@palimp/core/admin").then((m) => m.LiveCollectionList),
);

interface Props {
  registration: CollectionRegistration;
  itemComponent: ComponentType<{ item: unknown }>;
  children: ReactNode;
}

export const PalimpCollectionListClient = ({
  registration,
  itemComponent,
  children,
}: Props) => {
  const context = use(PalimpGeneralContext);

  // Visitors get the baked fragment — and so do prerender and the first
  // client paint, where `admin` is still `undefined`: the visitor HTML is the
  // baked cards by construction, and the admin sees the same swap-on-mount
  // that EditComponent already exhibits.
  if (!context.admin) {
    return <>{children}</>;
  }

  return (
    <LiveList registration={registration} itemComponent={itemComponent}>
      {children}
    </LiveList>
  );
};
