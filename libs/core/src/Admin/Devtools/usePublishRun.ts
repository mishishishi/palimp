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
      // Never stops. A run started anywhere but this tab's Publish button —
      // another admin, another tab, a push-triggered deploy — only ever shows
      // up on a refetch, so idling at `false` left the modal reporting the
      // last run this tab knew about. 60 s while idle, admins only, drawer
      // mounted.
      refetchInterval: (q) =>
        q.state.data && q.state.data.status !== "completed" ? 10_000 : 60_000,
    },
    queryClient,
  );
};
