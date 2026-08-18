"use client";

import { PalimpGeneralContext } from "@palimp/core";
import dynamic from "next/dynamic";
import { use } from "react";

const Edit = dynamic(
  () => import("@palimp/core/admin").then((m) => m.EditComponent),
  {
    // `data-palimp-editor` is what core's interaction guard selects on. The
    // placeholder carries it so a click landing in the dynamic-import window
    // does not reach an interactive ancestor either.
    loading: () => <span data-palimp-editor="">...</span>,
  },
);

export const XcoreClientComponent = ({
  messageKey,
  staleValue,
}: {
  messageKey: string;
  staleValue: string;
}) => {
  const context = use(PalimpGeneralContext);

  if (context.admin) {
    return <Edit messageKey={messageKey} staleValue={staleValue} textarea />;
  }

  return <>{staleValue}</>;
};
