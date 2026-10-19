"use client";
import { use, useMemo, type ReactNode } from "react";
import {
  PalimpClientBackendContext,
  PalimpDrawerActionsContext,
  PalimpPublishContext,
} from "@palimp/core";
import type { PalimpDrawerAction } from "@palimp/core";
import {
  createGithubPublishAdapter,
  type GithubPublishOptions,
} from "./client";

/** A second workflow on the same repo, dispatched by its own drawer button.
 *  Plain data on purpose — a Server Component layout can pass it, where it
 *  could not pass a `PalimpDrawerAction`'s `run`. No `followAllEvents`: an
 *  extra target dispatches and never polls, so the flag would mean nothing. */
export interface GithubExtraTarget {
  id: string;
  label: string;
  workflow: string;
  confirm?: { title: string; content: string; okText?: string };
  /** Defaults to the provider's `ref`, then `"main"`. */
  ref?: string;
  /** Not inherited from the provider: a different workflow can reject inputs
   *  it does not declare. */
  inputs?: Record<string, string>;
}

interface Props extends GithubPublishOptions {
  children: ReactNode;
  extraTargets?: ReadonlyArray<GithubExtraTarget>;
}

export const PalimpGithubPublishProvider = ({
  children,
  extraTargets,
  ...opts
}: Props) => {
  const backend = use(PalimpClientBackendContext);
  const parentActions = use(PalimpDrawerActionsContext);

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

  const actions = useMemo(
    () =>
      extraTargets?.length
        ? [
            ...parentActions,
            ...extraTargets.map((target) =>
              toDrawerAction(target, opts.owner, opts.repo, opts.ref),
            ),
          ]
        : parentActions,
    [parentActions, extraTargets, opts.owner, opts.repo, opts.ref],
  );

  return (
    <PalimpPublishContext value={adapter}>
      <PalimpDrawerActionsContext value={actions}>
        {children}
      </PalimpDrawerActionsContext>
    </PalimpPublishContext>
  );
};

const toDrawerAction = (
  target: GithubExtraTarget,
  owner: string,
  repo: string,
  providerRef: string | undefined,
): PalimpDrawerAction => {
  const ref = target.ref ?? providerRef;
  const adapter = createGithubPublishAdapter({
    owner,
    repo,
    workflow: target.workflow,
    ...(ref ? { ref } : {}),
    ...(target.inputs ? { inputs: target.inputs } : {}),
  });

  return {
    id: target.id,
    label: target.label,
    ...(target.confirm ? { confirm: target.confirm } : {}),
    needsPublishToken: true,
    run: async (user) => {
      // The drawer disables the button without a token; this is the guard
      // for a caller that does not.
      if (!user.publishToken) throw new Error("Missing publish token");
      const run = await adapter.publish(user.publishToken);
      return {
        message: `Run ${run.id} started`,
        ...(run.url ? { href: run.url } : {}),
      };
    },
  };
};
