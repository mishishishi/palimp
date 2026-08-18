# @palimp/publish-github

Publish adapter that triggers a GitHub Actions workflow and follows the run. Implements
`PalimpPublishAdapter` from [`@palimp/core`](../core/README.md).

Publishing is orthogonal to storage — this package works unchanged with either backend, because
it sits on its own capability seam rather than on `PalimpClientBackendAdapter`.

## Why publishing exists

The examples build with `output: "export"`. Message values are read at build time and baked into
static HTML, so a saved edit is invisible to the public until the site is rebuilt. Publish *is*
the rebuild. On a server-rendered host this package would have nothing to do.

## Entry points

- `@palimp/publish-github/client` — `createGithubPublishAdapter(opts)`
- `@palimp/publish-github/react` — `<PalimpGithubPublishProvider owner repo workflow …>`

No runtime dependencies; it is `fetch` and about 150 lines.

## Usage

```tsx
import { PalimpGithubPublishProvider } from "@palimp/publish-github/react";

<PalimpGithubPublishProvider
  owner={process.env.NEXT_PUBLIC_GITHUB_OWNER!}
  repo={process.env.NEXT_PUBLIC_GITHUB_REPO!}
  workflow={process.env.NEXT_PUBLIC_GITHUB_WORKFLOW!}
>
  {children}
</PalimpGithubPublishProvider>
```

Mount it inside the backend provider and outside `PalimpProvider`.

## Configuration

```ts
interface GithubPublishOptions {
  owner: string;                     // repo owner or org
  repo: string;
  workflow: string;                  // filename ("deploy.yml") or numeric workflow id
  ref?: string;                      // branch to dispatch against; defaults to "main"
  inputs?: Record<string, string>;   // workflow_dispatch inputs
}
```

The target workflow must declare `workflow_dispatch:` in its `on:` block, or the dispatch 404s.

Note there is no `token` here. The token is the signed-in user's, read from their profile and
passed per call — see below.

## The token

`publish(token)` and `getLatestRun(token)` take the token as an argument because it belongs to
the *user*, not to the adapter: it is `User.publishToken`, loaded from
`profiles.publish_token` (Supabase) or `profiles/{uid}.publishToken` (Firestore). No token on the
profile and the button reads "Missing publish token" and stays disabled.

**The token reaches the browser.** It is read from the profile row and passed straight to
`fetch`, so anyone who can open devtools as that admin can read it. That was a deliberate call —
the examples are static exports with no server at runtime to proxy through. Mitigate with scope,
not secrecy:

- a **fine-grained PAT**, not a classic one
- resource owner: the one repo
- repository permission: **Actions: Read and write** (write to dispatch, read to poll runs)
- nothing else, and a short expiry

Per-user tokens do at least make revocation per user.

## GitHub API quirks this package absorbs

`core` sees a clean `Promise<PalimpPublishRun | null>`; the mess is contained in
[src/client.ts](src/client.ts).

**1. The dispatch returns 204 with no run id.** `POST /actions/workflows/{workflow}/dispatches`
tells you nothing about the run it just created. So the adapter timestamps the moment *before* the
POST and then polls `GET …/runs?per_page=5` for the first run whose `created_at` is at or after
that instant, with 5 s of clock-skew tolerance — six attempts, one second apart, then
`could not locate dispatched run`.

Matching by time is a heuristic. Two publishes inside the tolerance window, or an unrelated run
landing at the same moment, and the adapter follows the wrong one. It is still a run of the right
workflow, so the consequence is a misleading status, not a broken publish.

**2. There is no "my run" query.** `getLatestRun` reads `…/runs?per_page=1` and returns whatever
is newest. Nothing is stored client-side — GitHub is the record — which is exactly why state
survives a page reload: the query just refetches on mount.

Because no id is tracked, "latest run" means latest *by recency*, and it can be a run this
adapter never dispatched. See the caveat below.

### Status mapping

Six generic conclusions in `core` so a future GitLab or Vercel adapter maps in without touching
consumers.

| GitHub `status` | `PublishRunStatus` |
| --- | --- |
| `queued`, `waiting`, `pending`, `requested` | `queued` |
| `in_progress` | `in_progress` |
| `completed` | `completed` |
| anything else | `in_progress` (defensive) |

| GitHub `conclusion` | `PublishRunConclusion` |
| --- | --- |
| `success` | `success` |
| `failure` | `failure` |
| `cancelled` | `cancelled` |
| `timed_out` | `timed_out` |
| `skipped`, `neutral` | `skipped` |
| `action_required`, anything else | `unknown` |

`conclusion` is only mapped when `status` is `completed`; otherwise it is left off the run object.

## Quirks

**Only `workflow_dispatch` runs are visible.** Both queries filter on
`event=workflow_dispatch`, so the drawer reports only runs Palimp could have started. It ignores
push- and PR-triggered runs of the same workflow.

That filter is load-bearing in this repo, because the deploy workflows double as the publish
target ([deploy-supabase.yml](../../.github/workflows/deploy-supabase.yml) sets
`NEXT_PUBLIC_GITHUB_WORKFLOW: deploy-supabase.yml`) and also trigger on `push` and
`pull_request`. Without it, every push to `main` would appear as the latest publish and disable
the Publish button while it ran.

The flip side: a push-triggered deploy genuinely does republish the site, and the drawer won't
show it. "Latest publish" means "latest publish *dispatched from here*", not "latest deploy".

**Rate limits are not handled.** `getLatestRun` polls every 10 s while a run is unfinished, on
top of react-query's refetch-on-focus. Well inside GitHub's 5 000 requests/hour for an
authenticated PAT, but there is no backoff and a 403 surfaces as a generic
`GitHub get runs failed: 403`.

**No provider means a silent no-op.** `PalimpPublishContext` in `core` holds `null` under a
non-nullable type. If a user has a `publishToken` but this provider isn't mounted, the Publish
button renders enabled and clicking does nothing.

**`inputs` is in the memo deps by identity.** `PalimpGithubPublishProvider` memoizes on
`[owner, repo, workflow, ref, inputs]`; an inline object literal for `inputs` is a new reference
each render, so the adapter is rebuilt every time. Hoist it to a module constant.
