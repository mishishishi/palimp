"use client";
import { use, useMemo, type ReactNode } from "react";
import { PalimpClientBackendContext, PalimpPublishContext } from "@palimp/core";
import {
  createGithubPublishAdapter,
  type GithubPublishOptions,
} from "./client";

interface Props extends GithubPublishOptions {
  children: ReactNode;
}

export const PalimpGithubPublishProvider = ({ children, ...opts }: Props) => {
  const backend = use(PalimpClientBackendContext);

  const adapter = useMemo(
    () => createGithubPublishAdapter(opts),
    [
      opts.owner,
      opts.repo,
      opts.workflow,
      opts.ref,
      opts.inputs,
      opts.followAllEvents,
    ],
  );

  return (
    <PalimpPublishContext value={adapter}>{children}</PalimpPublishContext>
  );
};
