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

- `@palimp/publish-github/client` — `createGithubPublishAdapter(opts)`, `GithubAuthError`
- `@palimp/publish-github/react` — `<PalimpGithubPublishProvider owner repo workflow …>`, with
  an optional `extraTargets` prop, and the `GithubExtraTarget` type

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
  followAllEvents?: boolean;         // report push-triggered runs too; default false
}
```

The target workflow must declare `workflow_dispatch:` in its `on:` block, or the dispatch 404s.

`followAllEvents` drops the `event=workflow_dispatch` filter from `getLatestRun`. Set it when
your publish target also runs on `push` and you would rather the drawer name the newest run of
the workflow — whatever started it — than the newest *dispatched* one, which may be older and
already completed. See the first quirk below for the trade. `publish()` is unaffected: its
dispatch-matching heuristic always queries the filtered list.

Note there is no `token` here. The token is the signed-in user's, read from their profile and
passed per call — see below.

## Extra targets

A second workflow on the same repo, dispatched by its own button in the drawer, below Publish —
the case it was built for is a preview site whose drawer also rebuilds the live one:

```tsx
<PalimpGithubPublishProvider
  owner="acme"
  repo="site"
  workflow="preview.yml"
  extraTargets={[
    {
      id: "production",
      label: "Publish live site",
      workflow: "production.yml",
      confirm: {
        title: "Publish the live site?",
        content: "The public site rebuilds from the saved content.",
        okText: "Publish live site",
      },
    },
  ]}
>
```

```ts
interface GithubExtraTarget {
  id: string;                       // unique across every drawer action in the tree
  label: string;
  workflow: string;
  confirm?: { title: string; content: string; okText?: string };
  ref?: string;                     // defaults to the provider's ref, then "main"
  inputs?: Record<string, string>;  // not inherited from the provider
}
```

**It is plain data, and that is the point.** A Next.js host configures palimp from its layout, a
Server Component, and a function cannot cross into a client one — so a `PalimpDrawerAction`
from `@palimp/core`, whose `run` is a callback, cannot be passed from there. The provider is the
client side of that boundary: it turns each entry into a drawer action with
`needsPublishToken: true` whose `run` calls `createGithubPublishAdapter(…).publish(token)` on the
target's workflow and reports `Run <id> started`, linked to the run. The labels and the confirm
are the host's strings, in the host's language.

An extra target **dispatches and never polls** — no status icon, no modal, no "running" state
after the dispatch resolves. Hence no `followAllEvents`: it would mean nothing. `inputs` is not
inherited because a different workflow can reject inputs it does not declare; `ref` is, because
it is the same repo.

The provider concatenates its actions with any `PalimpDrawerActionsContext` value above it, so
nesting adds buttons and never replaces them.

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

**3. The runs list is HTTP-cacheable, and the browser will cache it.** api.github.com answers
the GET with `cache-control: private, max-age=60`. A default-cache `fetch` therefore lets the
browser serve the 10 s poll loop out of its own copy for up to a minute — stale status *and*
stale run id, with no request made to notice. Both queries send `cache: "no-store"` for that
reason. The cost is in the rate-limit quirk below.

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

**Only `workflow_dispatch` runs are visible, unless you opt out.** Both queries filter on
`event=workflow_dispatch` by default, so the drawer reports only runs Palimp could have started.
It ignores push- and PR-triggered runs of the same workflow.

That filter is load-bearing in this repo, because the deploy workflows double as the publish
target ([deploy-supabase.yml](../../.github/workflows/deploy-supabase.yml) sets
`NEXT_PUBLIC_GITHUB_WORKFLOW: deploy-supabase.yml`) and also trigger on `push` and
`pull_request`. Without it, every push to `main` would appear as the latest publish and disable
the Publish button while it ran.

The flip side: a push-triggered deploy genuinely does republish the site, and the drawer won't
show it. "Latest publish" means "latest publish *dispatched from here*", not "latest deploy".
Worse, if the newest dispatched run is older than the push run in flight, the modal names a
completed run while a deploy is still going — which reads as a stale status rather than a
filtered one.

`followAllEvents: true` is the escape hatch for a host in that position: `getLatestRun` then
reports the newest run whatever triggered it. Take it only if the Publish button being disabled
during an unrelated push build is acceptable — that is the behaviour the filter was protecting
in this repo. `findRunSince` keeps filtering either way; its `created_at` heuristic gets strictly
worse against a list that includes push runs.

**Rate limits are not handled, and every poll now counts.** `getLatestRun` polls every 10 s
while a run is unfinished and every 60 s while it is not — the idle poll exists so a run started
in another tab, by another admin, or by a push is noticed at all. On top of that is
react-query's refetch-on-focus.

`cache: "no-store"` forgoes the conditional-request exemption, under which a `304` would not
have been billed against the quota. So the worst case is now ~360 requests/hour per admin with
the drawer open on an unfinished run, ~60/hour idle, against GitHub's 5 000/hour for an
authenticated PAT. Still comfortable for a handful of admins, but it is no longer free. There is
no backoff. A `403` surfaces as a `GithubAuthError`, which the drawer reads as an expired token
and which a secondary-rate-limit `403` would therefore mislabel — see the quirk below.

**`GithubAuthError` is `401`/`403` only, and `403` is not only auth.** Both `dispatchWorkflow`
and `fetchRuns` throw `GithubAuthError extends PalimpPublishAuthError` (from `@palimp/core`) for
those two statuses and a plain `Error` for everything else, which is what lets the drawer say
`Publish token expired` for a revoked PAT and `Publish failed` for a renamed workflow's `404`.
The `.status` is on the error if a consumer wants it.

The known-wrong edge is that GitHub also answers `403` for a **secondary rate limit** and for a
repository with Actions disabled. Neither is fixed by a new token, and both will read as
`Publish token expired`. Narrowing further means parsing the response body for GitHub's
`message` — which is the string-matching contract this class exists to avoid — so the mislabel
is accepted. A `429`, the primary-rate-limit status, stays a plain `Error`.

Subclassing `PalimpPublishAuthError` rather than defining the class here is deliberate: `core`
holds the base so the drawer can `instanceof` it without importing this package, which would
invert the dependency direction. `GithubAuthError` stays exported anyway, so a host can produce
or catch it by name. The check is class identity, so it needs a single resolved copy of
`@palimp/core` — see [core's quirks](../core/README.md#quirks).

**No provider means a silent no-op.** `PalimpPublishContext` in `core` holds `null` under a
non-nullable type. If a user has a `publishToken` but this provider isn't mounted, the Publish
button renders enabled and clicking does nothing.

**An extra target is not covered by the token pre-check.** Publish disables itself as
`Publish token expired` when the status poll is refused; an extra target never polls, so a dead
token shows only after a press — `<label> failed`, with the auth cause under it. And `Running...`
lasts as long as the dispatch *and* the run lookup, up to about seven seconds, because the run
lookup is the same as Publish's (quirk 1 of the GitHub API quirks above); a lookup that runs out after a successful dispatch reads as failed even though the
run started, exactly as it does for Publish.

**An extra target on Publish's own workflow shows up as Publish's latest run.** That is not a
link between the two: `getLatestRun` reads the newest dispatched run of the workflow, and the
target's dispatch is one. Point extra targets at a different workflow, which is what they are for.

**`extraTargets` is in a memo's deps by identity**, like `inputs` below. From a Server Component
that is free — the prop arrives once per server render. From a client component, an inline array
rebuilds every action on each render; hoist it.

**`inputs` is in the memo deps by identity.** `PalimpGithubPublishProvider` memoizes on
`[owner, repo, workflow, ref, inputs, followAllEvents]`; an inline object literal for `inputs` is
a new reference each render, so the adapter is rebuilt every time. Hoist it to a module constant.
Any new field on `GithubPublishOptions` has to join that list — it is a hand-written dep array
with no lint rule watching it.
