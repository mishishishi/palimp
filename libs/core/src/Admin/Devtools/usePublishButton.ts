import { useMutation } from "@tanstack/react-query";
import { use } from "react";
import { PalimpPublishContext } from "../../PalimpPublishContext";
import { queryClient } from "../queryClient";
import { useDevtools } from "./DevtoolsContext";
import { publishRunQueryKey, usePublishRun } from "./usePublishRun";

export const usePublishButton = () => {
  const { user } = useDevtools();
  const adapter = use(PalimpPublishContext);
  const { data: latestRun, isLoading } = usePublishRun();

  const isRunning = latestRun && latestRun.status !== "completed";

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
      onClick: () => mutation.mutate(),
    },
    isPending: mutation.isPending,
    isRunning,
    // No provider mounted is a host wiring mistake, not a user error — but it
    // is indistinguishable from a working button unless it says so.
    available: !!adapter,
    hasToken: !!user.publishToken,
  };
};
