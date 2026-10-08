import { useMutation } from "@tanstack/react-query";
import { use } from "react";
import { PalimpPublishContext } from "../../PalimpPublishContext";
import { PalimpPublishAuthError } from "../../PalimpPublishAdapter";
import { queryClient } from "../queryClient";
import { useDevtools } from "./DevtoolsContext";
import { publishRunQueryKey, usePublishRun } from "./usePublishRun";

export const usePublishButton = () => {
  const { user } = useDevtools();
  const adapter = use(PalimpPublishContext);
  const { data: latestRun, isLoading, error: runError } = usePublishRun();

  const isRunning = latestRun && latestRun.status !== "completed";

  // The status poll runs `getLatestRun` with the same token the dispatch will
  // use, every 60 s while the drawer is mounted, so an auth failure from it is
  // proof the token is dead *before* anything is pressed. Narrowed to
  // `PalimpPublishAuthError` on purpose: a 404 from a renamed workflow fails
  // the poll too, and it is not a token problem.
  const tokenExpired = runError instanceof PalimpPublishAuthError;

  const mutation = useMutation(
    {
      mutationKey: ["palimp:publish"],
      mutationFn: async () => {
        if (!adapter || !user.publishToken) return;
        const run = await adapter.publish(user.publishToken);
        queryClient.setQueryData(publishRunQueryKey, run);
      },
    },
    queryClient,
  );

  return {
    props: {
      disabled: mutation.isPending || isRunning || isLoading,
      // `reset()` first, so a retry clears the previous failure rather than
      // leaving a stale message beside a running dispatch.
      onClick: () => {
        mutation.reset();
        mutation.mutate();
      },
    },
    isPending: mutation.isPending,
    isRunning,
    // No provider mounted is a host wiring mistake, not a user error — but it
    // is indistinguishable from a working button unless it says so. A refused
    // token is the third case in that list, and `error` is the fourth: the
    // dispatch rejection react-query has always caught and nobody read.
    available: !!adapter,
    hasToken: !!user.publishToken,
    tokenExpired,
    error: mutation.error,
    reset: () => mutation.reset(),
  };
};
