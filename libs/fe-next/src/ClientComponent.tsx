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
  // Optional for the one caller that cannot resolve first: a live-mapped
  // fresh item. p() always resolves and passes a string, so nothing
  // observable changes for existing pages.
  staleValue?: string;
}) => {
  const context = use(PalimpGeneralContext);

  if (context.admin) {
    // EditComponent's existing `pending ?? data ?? staleValue ?? ""` chain
    // plus its `placeholder={messageKey}` already give a fresh key an empty
    // editor labelled with its own key.
    return (
      <Edit messageKey={messageKey} staleValue={staleValue ?? ""} textarea />
    );
  }

  // The missing-content-obvious fallback p() applies server-side, applied at
  // the component when no resolved value was passed.
  return <>{staleValue ?? messageKey}</>;
};
