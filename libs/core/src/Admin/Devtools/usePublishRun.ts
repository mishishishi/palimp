import { skipToken, useQuery } from "@tanstack/react-query";
import { use } from "react";
import { PalimpPublishContext } from "../../PalimpPublishContext";
import { queryClient } from "../queryClient";
import { useDevtools } from "./DevtoolsContext";

export const publishRunQueryKey = ["palimp:publish:latestRun"] as const;

export const usePublishRun = () => {
  const adapter = use(PalimpPublishContext);
  const { user } = useDevtools();
  const token = user.publishToken;

  return useQuery(
    {
      queryKey: publishRunQueryKey,
      // `skipToken` rather than `enabled`: both stop the query, but narrowing
      // the ternary on `adapter` and `token` is what lets the call drop its
      // non-null assertions, so the nullable context is checked rather than
      // asserted away.
      queryFn:
        adapter && token ? () => adapter.getLatestRun(token) : skipToken,
      refetchInterval: (q) =>
        q.state.data && q.state.data.status !== "completed" ? 10_000 : false,
    },
    queryClient,
  );
};
