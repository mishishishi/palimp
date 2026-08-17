# Plan: publish status indicator + run details modal

> **Historical design record — not current API.** Written before this feature was built and kept
> as written. For how the code behaves today see
> [libs/publish-github/README.md](../../libs/publish-github/README.md) and
> [../architecture.md](../architecture.md#publish). Context: [README.md](README.md).
>
> This is the closest plan to current behaviour, but several details shipped differently — see
> the divergence note at the end.

## Context

`@palimp/publish-github` currently fires a `workflow_dispatch` and forgets about it (`libs/publish-github/src/client.ts:14`). The Publish button (`libs/core/src/Admin/Devtools/DevtoolsContent.tsx`) goes from `"Publish"` → `"Publishing..."` only while the POST is in flight (usually <500ms), then snaps back. The user has no idea whether the Action actually succeeded.

We want:

1. A small **status addon** next to the Publish button reflecting the current run (in-progress / success / failure).
2. Clicking the addon opens a **modal** with more detail (dispatch time, run id, link to GitHub Actions, refresh).
3. State **persists across page reload** — without persisting anything client-side.
4. Only one publish can be in flight at a time. The button is disabled while a run is queued or in progress.

## Design rationale: GitHub is the store

There is exactly one publish workflow per app deployment. Its latest `workflow_dispatch` run *is* the current publish state — there is no other source of truth worth maintaining. We avoid:

- A custom store (no `publishStatusStore.ts`).
- localStorage / sessionStorage of any kind (not even a run id).
- Optimistic stubs.

Instead, a single `useQuery` calls `adapter.getLatestRun(token)` and the cache itself acts as the in-memory mirror of GitHub. Reload behaviour falls out for free: the query refetches on mount.

## The GitHub API quirks this design absorbs

- `POST /workflows/{workflow}/dispatches` returns **204 with no run id**. To resolve the just-dispatched run promptly we poll `GET /workflows/{workflow}/runs?event=workflow_dispatch&per_page=5` looking for a run with `created_at >= dispatchedAt - 5s` (clock-skew tolerance). Up to ~6 attempts at 1s intervals.
- `getLatestRun` uses the same `/runs?event=workflow_dispatch&per_page=1` endpoint. No id tracking — we always read whatever is newest.

Both quirks are contained inside `libs/publish-github/src/client.ts`. The core layer sees a clean `Promise<PalimpPublishRun | null>`.

## Capability shape (in `@palimp/core`)

Replace the current adapter:

```ts
// PalimpPublishAdapter.ts
export interface PalimpPublishAdapter {
  publish: (token: string) => Promise<PalimpPublishRun>;
  getLatestRun: (token: string) => Promise<PalimpPublishRun | null>;
}

export interface PalimpPublishRun {
  id: string;             // provider-specific id, stringified for opacity
  dispatchedAt: number;   // ms epoch — from provider's created_at
  url?: string;           // deep link to the provider UI (GitHub Actions run page)
  status: PublishRunStatus;
  conclusion?: PublishRunConclusion;
}

export type PublishRunStatus = "queued" | "in_progress" | "completed";

export type PublishRunConclusion =
  | "success"
  | "failure"
  | "cancelled"
  | "timed_out"
  | "skipped"
  | "unknown";
```

Keeping enums generic in core leaves room for a future GitLab / Vercel adapter without touching consumers.

Export the new types from `libs/core/src/index.ts`.

## GitHub adapter rewrite (`libs/publish-github/src/client.ts`)

Internal helpers (none exported):

- `dispatchWorkflow(token, opts)` — POSTs `/dispatches`, throws on non-2xx, records `dispatchedAt = Date.now()` before the POST so we can match the resulting run.
- `findRunSince(token, opts, dispatchedAt)` — polls `/workflows/{workflow}/runs?event=workflow_dispatch&per_page=5` up to 6 times at 1s spacing; returns the first run with `created_at >= dispatchedAt - 5000ms`. Throws "could not locate dispatched run" if none found.
- `mapRun(ghRun) → PalimpPublishRun` — extracts `id`, `created_at`, `html_url`, and translates `status`/`conclusion` (table below).

Exposed methods:

- `publish` — `dispatchWorkflow → findRunSince → mapRun`.
- `getLatestRun` — `GET /workflows/{workflow}/runs?event=workflow_dispatch&per_page=1`, returns `mapRun(runs[0])` or `null` if the workflow has never been dispatched.

### Status / conclusion mapping

GitHub `status` → our `PublishRunStatus`:
- `"queued"`, `"waiting"`, `"pending"`, `"requested"` → `"queued"`
- `"in_progress"` → `"in_progress"`
- `"completed"` → `"completed"`
- anything else (defensive) → `"in_progress"`

GitHub `conclusion` (only set when status is completed) → our `PublishRunConclusion`:
- `"success"` → `"success"`
- `"failure"` → `"failure"`
- `"cancelled"` → `"cancelled"`
- `"timed_out"` → `"timed_out"`
- `"skipped"`, `"neutral"` → `"skipped"`
- `"action_required"`, `null`, anything else → `"unknown"`

## React layer

### `usePublishRun()` (`libs/core/src/Admin/Devtools/usePublishRun.ts`)

The single source of truth for the publish addon, button, and modal:

```ts
export const usePublishRun = () => {
  const adapter = use(PalimpPublishContext);
  const { user } = useDevtools();
  const token = user.publishToken;

  return useQuery(
    {
      queryKey: ["palimp:publish:latestRun"],
      queryFn: () => adapter!.getLatestRun(token!),
      enabled: !!adapter && !!token,
      refetchInterval: (q) =>
        q.state.data && q.state.data.status !== "completed" ? 3000 : false,
      // staleTime stays at react-query default (0) so reopening the drawer
      // refetches immediately.
    },
    queryClient,
  );
};
```

Polling is just a query option — no manual `setTimeout`. When the run completes, `refetchInterval` returns `false` and polling stops.

The query is mounted by the components inside `<DevtoolsContent>`. antd `<Drawer>` defaults to `destroyOnClose: false`, so once the drawer is opened the query stays alive and keeps polling across collapses. No `forceRender` needed — we don't gain anything by polling before the user has ever opened the drawer.

### `usePublishButton` (`libs/core/src/Admin/Devtools/usePublishButton.ts`)

Rewritten:

```ts
export const usePublishButton = () => {
  const { user } = useDevtools();
  const adapter = use(PalimpPublishContext);
  const { data: latestRun } = usePublishRun();

  const isRunning =
    !!latestRun && latestRun.status !== "completed";

  const mutation = useMutation(
    {
      mutationKey: ["palimp:publish"],
      mutationFn: async () => {
        if (!adapter || !user.publishToken) return;
        const run = await adapter.publish(user.publishToken);
        queryClient.setQueryData(["palimp:publish:latestRun"], run);
      },
    },
    queryClient,
  );

  if (!adapter) {
    return { props: { disabled: true, onClick: () => {} }, isPending: false, available: false };
  }

  return {
    props: {
      disabled: mutation.isPending || isRunning,
      onClick: () => mutation.mutate(),
    },
    isPending: mutation.isPending,
    isRunning,
    available: true,
    hasToken: !!user.publishToken,
  };
};
```

Two distinct "in progress" signals:
- `mutation.isPending` — the dispatch POST + `findRunSince` round-trip (1–3s).
- `isRunning` — the resolved run is still queued/in-progress per GitHub.

The button is disabled while either is true. The addon icon (below) uses the run's status if present, else the mutation's pending state.

## UI changes

### `DevtoolsContent.tsx`

Replace the lone Publish button with a compact row + modal:

```tsx
const publish = usePublishButton();
const { data: run } = usePublishRun();
const [modalOpen, setModalOpen] = useState(false);

<Space.Compact block>
  <Button {...publish.props} disabled={publish.props.disabled || !publish.hasToken} style={{ flex: 1 }}>
    {label}
  </Button>
  <Button
    icon={<PublishStatusIcon run={run} isPending={publish.isPending} />}
    onClick={() => setModalOpen(true)}
    disabled={!run && !publish.isPending}
  />
</Space.Compact>

<PublishStatusModal open={modalOpen} onClose={() => setModalOpen(false)} run={run} />
```

Label logic:
- `!hasToken` → `"Missing publish token"`
- `mutation.isPending` → `"Dispatching..."`
- `isRunning` → `"Publishing..."`
- else → `"Publish"`

### `PublishStatusIcon`

Maps `(status, conclusion, isPending)` to a lucide icon:
- `isPending` or `queued` / `in_progress` → `Loader2` with CSS spin
- `completed` + `success` → `CircleCheck` (green)
- `completed` + `failure` / `timed_out` → `CircleX` (red)
- `completed` + `cancelled` / `skipped` → `CircleMinus` (orange)
- `completed` + `unknown` → `CircleHelp` (grey)
- `null` (no run ever) → button is disabled; icon doesn't matter (use `CircleDashed`)

lucide is already in use (`PencilRuler` in `Devtools/index.tsx:2`).

### `PublishStatusModal`

antd `Modal` with:
- Title: `"Publish status"` + `<PublishStatusIcon>` next to it
- Body, simple two-column layout:
  - Dispatched: relative ("2 min ago") + full ISO on `title` hover
  - Status / conclusion
  - Run id (monospace) with a copy button
  - "Open in GitHub Actions" link (only if `run.url` present, `target="_blank" rel="noreferrer"`)
- Footer:
  - `Refresh` — `queryClient.invalidateQueries({ queryKey: ["palimp:publish:latestRun"] })`. Disabled while a refetch is in flight.
  - `Close`

No Dismiss button — there's nothing to dismiss. The addon always reflects the latest GitHub run for this workflow, which is what we want as the persistent record.

### Idle-state behaviour worth flagging

Once any publish has ever run, the addon will keep showing its conclusion (e.g. a green check) for the lifetime of that being the most recent run — days later, even. That's intended ("last known publish state"), but means the addon is never truly empty after first publish. If this becomes noisy in practice we can add a "completed N hours ago" fade later; out of scope for v1.

## Files modified vs. created

**Created**
- `libs/core/src/Admin/Devtools/usePublishRun.ts` — the `useQuery` hook
- `libs/core/src/Admin/Devtools/PublishStatusIcon.tsx`
- `libs/core/src/Admin/Devtools/PublishStatusModal.tsx`

**Modified**
- `libs/core/src/PalimpPublishAdapter.ts` — new shape with `getLatestRun` + `PalimpPublishRun` types
- `libs/core/src/index.ts` — export new types
- `libs/core/src/Admin/Devtools/usePublishButton.ts` — consume `usePublishRun`, `setQueryData` on dispatch
- `libs/core/src/Admin/Devtools/DevtoolsContent.tsx` — `Space.Compact` row + modal
- `libs/publish-github/src/client.ts` — implement `getLatestRun`, internal `findRunSince`, status mapping

No public-API breakages outside the workspace (the `PalimpPublishAdapter` shape is consumed only by `@palimp/publish-github`).

## Verification

1. `pnpm -r check-types`.
2. `pnpm -r build`.
3. `pnpm --filter @example/supabase-next dev`. With a valid `NEXT_PUBLIC_GITHUB_TOKEN` + a workflow that takes >5s:
   - Click Publish. Button text → `"Dispatching..."`, addon shows a spinner.
   - Within ~2s the run resolves; button text → `"Publishing..."`, button stays disabled, addon still spins.
   - Click the addon → modal shows dispatch time, run id, link to Actions, status badge.
   - Wait for the workflow to finish. Addon transitions to green check, button becomes enabled again.
4. **Persistence test:** trigger publish, hard-reload the page mid-run, reopen Devtools. Addon refetches on mount and resumes the correct state. Button stays disabled until completion.
5. **Concurrent-dispatch guard:** while a run is in progress, the button is unclickable. Confirm.
6. **Stale-token path:** rotate `NEXT_PUBLIC_GITHUB_TOKEN` to an invalid value, reload. `getLatestRun` rejects; react-query's `error` state is exposed in the modal as a generic "Couldn't load run status" (one-line fallback in the modal body).
7. **Manual failure path:** dispatch a workflow that intentionally `exit 1`s. Addon transitions to red X; modal shows `failure` conclusion and a working Actions link.

## Out of scope (deliberate)

- Multi-run history. The addon shows only the latest run.
- Cross-tab sync. react-query's `refetchOnWindowFocus` (default on) gives most of this for free.
- Streaming logs in the modal — we only link out to GitHub.
- Backoff / retry on transient 5xx during polling. react-query's default retry behaviour is fine.
- Cancelling an in-flight run from the modal.
- A "fade after N hours" idle state on the addon.

## Divergence from what shipped

Added after the fact. The plan is unedited above.

- **No `event=workflow_dispatch` filter.** Both queries were specified with it; the shipped
  `runsUrl` in [libs/publish-github/src/client.ts](../../libs/publish-github/src/client.ts) is
  just `…/runs?per_page=N`. So any run of the workflow counts as the latest publish — including
  push- and PR-triggered ones, which the deploy workflows also fire on. This is the plan's most
  consequential miss; see
  [the quirk write-up](../../libs/publish-github/README.md#quirks).
- **Polling is every 10 s, not 3 s** (`usePublishRun.ts`).
- **`usePublishButton` has no `if (!adapter)` early return.** `available` is hardcoded `true`,
  and the missing-provider case is handled only by an early return inside `mutationFn` — a silent
  no-op rather than a disabled button.
- **`PublishStatusModal` takes no `run` prop.** It calls `usePublishRun()` itself; react-query
  dedupes against the same query key, so the data is shared without threading it through.
- Everything else — the 204/no-run-id polling with 5 s tolerance, the status and conclusion
  mapping tables, GitHub-as-the-store with no client-side persistence, the icon set, the modal
  rows — shipped as described.
