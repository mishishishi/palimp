# Publish failure is silent — the dispatch error nothing reads

Written 2026-10-06, before the fix, against `@palimp/core` 1.8.1 (`b2934c71`).
Not built. **Written in `nano-pro-web`** and moved here unchanged — see
[its transfer note](#where-this-came-from).

## The report

`nano-pro-web`, 2026-09-28. The client saved an edit, pressed **Publish**, and the button reported
success. **No workflow run was started at all.** The site kept serving the previous build
indefinitely, and nothing anywhere in the drawer said so. The cause was found by hand afterwards:
the publish token on their profile row had been revoked, so GitHub answered the dispatch `401`.

It is the shape of the failure that matters, not the token. **Any** non-2xx from the dispatch
endpoint — a revoked token, a renamed workflow (`404`), a repository the token cannot reach, rate
limiting — produces exactly this: a button that looks like it worked.

## Where the error is lost

Not in the adapter. [`dispatchWorkflow`](../../../libs/publish-github/src/client.ts) already throws
with the status in the message, which is the right behaviour and needs no change:

```ts
if (!res.ok) {
  throw new Error(`GitHub dispatch failed: ${res.status} ${res.statusText}`);
}
```

It is lost one layer up, in
[`usePublishButton`](../../../libs/core/src/Admin/Devtools/usePublishButton.ts). The hook runs
`adapter.publish()` through `useMutation` and returns:

```ts
return {
  props: { disabled: …, onClick: () => mutation.mutate() },
  isPending: mutation.isPending,
  isRunning,
  available: !!adapter,
  hasToken: !!user.publishToken,
};
```

`mutation.isError` and `mutation.error` are not in that object. react-query catches the rejection,
stores it on the mutation, and **nothing ever reads it** — no `onError`, no toast, no return value.
The one state the drawer *can* see is `isPending`, which goes back to `false` on failure exactly as
it does on success, so `publishLabel` falls back to `"Publish"` and the press is indistinguishable
from a working one.

This is the same class of bug as the `available`/`hasToken` flags that are already returned:
`DevtoolsContent` renders `"No publish provider"` and `"Missing publish token"` precisely because a
button that cannot work must say so. A **refused** token is the third case in that list and the
only one with no wording.

## The fix

Three changes, all in `libs/core`.

**1. `usePublishButton` returns its error.**

```ts
return {
  props: { … },
  isPending: mutation.isPending,
  isRunning,
  available: !!adapter,
  hasToken: !!user.publishToken,
  error: mutation.error,          // new
  reset: () => mutation.reset(),  // new
};
```

`reset()` is called from `onClick` before `mutate()`, so a retry clears the previous failure rather
than leaving a stale message beside a running dispatch.

**2. `DevtoolsContent`'s `publishLabel` gains a failed state.** It is already a five-branch ternary;
the new branch sits above `isPending`, because a failure is what the editor needs to read next:

```ts
const publishLabel = !publish.available
  ? "No publish provider"
  : !publish.hasToken
    ? "Missing publish token"
    : publish.error
      ? "Publish failed"
      : publish.isPending
        ? "Dispatching..."
        : publish.isRunning
          ? "Publishing..."
          : "Publish";
```

The button stays enabled in the failed state — the remedy for the common cause is a new token on
the profile, after which the same button is the retry.

**3. `PublishStatusModal` carries the detail.** The status button beside Publish is already there
and already opens on `publish.isPending`; widen its `disabled` to stay open-able while
`publish.error` is set, and render the message above the run rows:

```
Dispatch failed
GitHub dispatch failed: 401 Unauthorized
```

with one line of plain-language cause: *"The publish token on your account was refused. A new token
is needed; your saved changes are not affected."* The modal already has an error branch for the
status *query* (`"Couldn't load run status."`) — this is a second, separate one for the dispatch,
and the two must not share wording, because one means "cannot see the run" and the other means
"there is no run".

## The second half: say it before the button is pressed

The fix above makes the failure loud. It does not make it early, and for a revoked token it can be
early for free.

[`usePublishRun`](../../../libs/core/src/Admin/Devtools/usePublishRun.ts) already polls
`getLatestRun(token)` **with the same token**, every 60 s while the drawer is mounted, idle or not.
A `401`/`403` from that poll is proof the token is dead before anyone presses anything. The query's
`error` is already available to the drawer (`PublishStatusModal` reads it).

So: when `usePublishRun`'s error is an auth failure, `publishLabel` reads **`Publish token
expired`** and the button is disabled, in the same shape as `Missing publish token`. This turns the
reported incident from "fails loudly when pressed" into "could not have been pressed".

It needs the adapter to distinguish an auth failure from any other fetch failure.
`fetchRuns` throws `GitHub get runs failed: 401 Unauthorized` — matching on the string is the wrong
contract, so add a typed error to `@palimp/publish-github`:

```ts
export class GithubAuthError extends Error {}
```

thrown by `fetchRuns` and `dispatchWorkflow` for `401` and `403` only, with everything else staying
a plain `Error`. The drawer narrows with `instanceof`. The class is exported, so a host or another
publish adapter can produce it too — `PalimpPublishAdapter` gains no new method.

## What this costs

Nothing a visitor downloads. Everything here is inside `@palimp/core/admin` and
`@palimp/publish-github`'s client, which reaches the page only through `next/dynamic` and the
drawer — the `check-eager-chunks` invariant in the host is untouched. One new exported class, one
widened return type, no adapter interface change, no schema change.

**It is a `1.9.0`, not a patch.** `GithubAuthError` is a new export and `usePublishButton`'s return
type widens; both are additive, neither is a fix to existing behaviour.

## Rejected: an `onError` toast from the mutation

antd's `message` is already a dependency and a toast is two lines. Rejected because a toast is
*transient* and this failure is *persistent*: the site is still serving the old build an hour
later, and the editor who dismissed or missed the toast has no way to ask the drawer what happened.
The button label and the status modal are both still true a day later, which is the property that
matters for a failure the client discovers by noticing nothing changed.

Worth revisiting only as an *addition* once the persistent states exist.

## Rejected: validating the token at login

`getUser()` already reads `publish_token` off the profile row, so checking it against
`GET /user` at sign-in is tempting. Rejected: it spends a request on every login to catch a
condition the 60 s poll catches anyway while the drawer is open, and it puts a GitHub call in the
auth path of a backend adapter that should not know what GitHub is. The poll is in the right layer.

## Verification

`pnpm check-types` and `pnpm build` are the gate here and **neither can see any of this** — it is
runtime behaviour against a live API, exactly as `publish-status-staleness.md` found.

Real verification is in a host with a working publish setup, in this order:

1. **Revoke the PAT on the GitHub account** (or set `publish_token` to a garbage string on the
   profile row), reload the page, open the drawer, press Publish. Expect `Publish failed`, and the
   status modal to carry `401 Unauthorized`.
2. **Leave the drawer open for 60 s** with the same dead token. Expect the label to become
   `Publish token expired` and the button to disable **without a press**.
3. **Put a valid token back**, reload. Expect `Publish` and a dispatch that starts a real run.
4. **Rename the target workflow in `.env.local`** to one that does not exist. Expect
   `Publish failed` with `404`, not `Publish token expired` — this is what proves the `401`/`403`
   narrowing is narrowing rather than catching everything.
5. **Confirm the saved edits survived every one of the above.** The dispatch half failing must
   never touch the write half; `useSaveButton` is a separate mutation and this plan does not go
   near it.

## Where this came from

Written in `nano-pro-web`'s own guidelines as part of weighing whether to replace palimp with a
file-based CMS, and moved here because it is library work. The host-side record of the incident is
that repo's `agent-guidelines/editing-copy.md` §3, which currently has to teach the client to check
the status panel by hand **because** of this bug. When this lands, that paragraph shortens.

---

## Landing note

Built 2026-10-08 as `@palimp/core` / `@palimp/publish-github` **1.9.0**, on
`pr/10-publish-failure-is-silent` — stacked on `pr/09-publish-status-staleness`, carrying this
folder's docs commit beneath the feature commit. Not pushed, no PR.

Both halves landed as written: the dispatch error is returned and read, and the status poll's
auth failure disables the button before a press. Four files changed in `libs/core`
(`PalimpPublishAdapter.ts`, `index.ts`, `Admin/Devtools/usePublishButton.ts`,
`Admin/Devtools/DevtoolsContent.tsx`, `Admin/Devtools/PublishStatusModal.tsx`) and one in
`libs/publish-github` (`src/client.ts`), plus both package READMEs, `docs/architecture.md`, and
the lockstep version across all five packages.

### What was verified

- **`pnpm check-types` and `pnpm build` pass.** As the plan says, neither sees any of the
  behaviour. What they do prove is the part that was most likely to be wrong structurally: that
  the error class resolves across the package boundary at all, and that the widened hook return
  still satisfies every consumer.
- **The 401/403 narrowing, directly.** A throwaway Node script against the built `dist/`, with
  `fetch` stubbed per status, asserting which class comes out of `publish()` and
  `getLatestRun()`:

  | status | `instanceof PalimpPublishAuthError` | `instanceof GithubAuthError` | `error.name` |
  | --- | --- | --- | --- |
  | 401 | ✅ | ✅ | `GithubAuthError` |
  | 403 | ✅ | ✅ | `GithubAuthError` |
  | 404 | — | — | `Error` |
  | 429 | — | — | `Error` |
  | 500 | — | — | `Error` |

  Both endpoints, all five statuses, plus the label branch the drawer computes: a poll `401`
  yields `Publish token expired` and a poll `404` yields nothing. This is **the mechanism**
  behind §Verification step 4, and it confirms the narrowing narrows — including that `instanceof`
  survives the package boundary, which was the real risk given the class lives in `core` and is
  thrown from the adapter. It is **not** step 4: nothing here renders a button or opens a modal,
  and a stubbed `fetch` is not a renamed workflow. The script was deleted; it is reproduced in
  the divergence notes below if it is wanted again.

### What could not be run, and why

**All five of §Verification.** Every step needs a live host with real Supabase credentials and a
real GitHub PAT that can be deliberately revoked, and neither is available here — the same wall
`publish-status-staleness.md` and the collections phases hit. Specifically unverified:

1. Revoked PAT → press Publish → `Publish failed` and `401 Unauthorized` in the modal. **See
   divergence 2 — this step is not reachable as written.**
2. Dead token for 60 s → `Publish token expired`, button disabled without a press. **See
   divergence 2 — this happens in under a second, not 60.**
3. Valid token restored → `Publish` and a real run.
4. Renamed workflow → `Publish failed` with `404`, not `Publish token expired`. The error-class
   half is verified above; the label and the live `404` are not.
5. Saved edits survive all of the above. Unverified by observation, though the plan's reasoning
   holds by inspection: `useSaveButton` is a separate mutation on a separate adapter and nothing
   in this change goes near it or `editsStore`.

Also unverified: that the host's `check-eager-chunks` invariant still passes. By inspection it
must — every `@palimp/core/admin` import in `fe-next` is still `next/dynamic`, and the only new
eagerly-reachable code is a bare `Error` subclass in `core`'s root entry, which
`publish-github/client` already pulled in. But the gate itself lives in the host and was not run.

Nothing was published, no tarball was packed, and no test data exists anywhere to clean up.

## Divergence notes

**1. The error class is split in two: a generic base in `core`, the GitHub subclass in the
adapter.** The plan puts `GithubAuthError` in `@palimp/publish-github` and says "the drawer
narrows with `instanceof`". Those two sentences cannot both be true. `instanceof` needs the class
*value*, not its type, so the drawer narrowing on `GithubAuthError` would mean `libs/core`
importing `@palimp/publish-github` at runtime — inverting the dependency direction that
[docs/architecture.md](../../architecture.md) calls the repo's main architectural bet, and adding
a runtime import of a package that is not even in `core`'s `package.json`.

So `core` gained `PalimpPublishAuthError extends Error`, exported as a value from
`@palimp/core`, and `GithubAuthError extends PalimpPublishAuthError` stayed in the adapter and
stayed exported. The drawer narrows on the base. This keeps every property the plan asked for —
`instanceof` rather than string matching, an export a host or another publish adapter can
produce, no new method on `PalimpPublishAdapter` — and follows the pattern already set by the six
generic conclusions, which exist so a GitLab adapter maps in without touching a consumer. The
cost against the plan's accounting is one more export in `core` rather than one: "three changes
in `libs/core` plus one new exported class in `libs/publish-github`" became four and one.

`GithubAuthError` also carries a `readonly status: number`, which the plan did not ask for. It is
what lets a host tell a revoked token from a secondary rate limit without parsing a message, and
it costs nothing.

The consequence worth knowing, recorded in both READMEs: the check is class identity, so two
resolved copies of `@palimp/core` make it silently fail and the label falls back to `Publish
failed`. It degrades rather than throws, so it will not announce itself. The lockstep version is
what keeps this honest.

**2. §Verification steps 1 and 2 cannot both be observed, and step 2's "60 s" is wrong.** The
plan reads as though the poll's auth failure arrives a minute after the drawer opens, leaving a
window in which Publish can still be pressed. It does not: `usePublishRun` fetches on mount, so
with a token that is dead for *both* endpoints the first `getLatestRun` rejects within a second,
`tokenExpired` goes true, and the button is disabled before anyone can press it. Step 1's
"press Publish, expect `Publish failed`" is therefore unreachable in exactly the setup step 1
prescribes.

This is the plan's own stated goal — "could not have been pressed" — arriving earlier than the
plan expected, so the implementation was left as §The fix specifies rather than weakened to make
step 1 observable. The `Publish failed` path is still reachable, and the plan's §The report is
still its motivating case: a token with repo read but no Actions write (the poll succeeds, the
dispatch `403`s), a workflow renamed after the drawer loaded (`404` on dispatch), a `500`, a
network failure, or `could not locate dispatched run`. **A revised step 1 should rename the
workflow rather than revoke the token** — which makes step 1 and step 4 the same press, with
step 4's assertion about which label appears.

**3. The modal captions the surviving run rows.** The plan says to render the dispatch message
"above the run rows". Done — but `getLatestRun`'s rows describe the *previous* run, so
"Dispatched 2 minutes ago" sitting under "Dispatch failed" reads as the dispatch that just
failed, which is the same ambiguity the plan exists to remove. One secondary line now says so:
*"Last known run — not the publish you just tried to start. The site is still serving this
build."* When there is no previous run the modal's `No publish has been dispatched yet.` is
suppressed instead, because it contradicts the block above it.

**4. `tokenExpired` is computed in `usePublishButton`, not in the component.** The plan's return
block marks only `error` and `reset` as new. A third derived flag was added beside `available`
and `hasToken` because that is where the plan itself puts it — "in the same shape as
`Missing publish token`" — and it keeps the `instanceof` in the hook that owns whether the button
can work, rather than in `DevtoolsContent`. `DevtoolsContent` reads one boolean.

**5. `docs/architecture.md` was updated**, as `publish-status-staleness.md` also had to: its
`PalimpPublishAdapter` section listed the seam's types without the new class, and its Publish
section described the dispatch as fire-and-forget. That is current-behaviour documentation, not a
plan, so it was corrected rather than annotated. It landed in the docs commit after the feature
commit, not inside it.

**6. The label order places `tokenExpired` above `error`.** The plan shows `error` directly under
`hasToken`; `tokenExpired` was slotted between them, because it is a "cannot work" state like the
two above it while `Publish failed` is a "did not work" state. §Verification step 4 is unaffected
— a renamed workflow produces a plain `Error` from both endpoints, so `tokenExpired` is false and
`Publish failed` is what shows.

**7. Reproduction script for the narrowing check**, for whoever runs the live verification and
wants the cheap half again. Place it under `libs/publish-github/` (it needs that package's
`node_modules/@palimp/core` symlink) after `pnpm build`:

```js
import { createGithubPublishAdapter, GithubAuthError } from "./dist/client.js";
import { PalimpPublishAuthError } from "@palimp/core";

const adapter = createGithubPublishAdapter({ owner: "o", repo: "r", workflow: "deploy.yml" });
for (const [status, shouldBeAuth] of [[401, true], [403, true], [404, false], [429, false]]) {
  globalThis.fetch = async () => ({ ok: false, status, statusText: "x", json: async () => ({}) });
  for (const call of [() => adapter.publish("tok"), () => adapter.getLatestRun("tok")]) {
    let err;
    try { await call(); } catch (e) { err = e; }
    console.assert(err instanceof PalimpPublishAuthError === shouldBeAuth, status);
    console.assert(err instanceof GithubAuthError === shouldBeAuth, status);
  }
}
```

**8. One pre-existing inaccuracy was left alone.** `publish-github`'s README still says "No
provider means a silent no-op … the Publish button renders enabled and clicking does nothing",
which has been untrue since `available` was added — the drawer disables it and says "No publish
provider". It predates this plan and is not in its scope. The neighbouring sentence about `403`
*was* corrected, because this change is what made it wrong.

---

## Verification run — 2026-10-08, live host

**This section supersedes §What could not be run, and why.** That list was written when there was
no host and no revocable credential; both appeared later the same day. All five steps have now been
run against `examples/supabase-next` with real Supabase credentials, a real fine-grained PAT on
`mishishishi/palimp`, and the drawer driven over CDP. The example is a sufficient host: its
`app/layout.tsx` wires `PalimpGithubPublishProvider`, so nothing about the publish seam is stubbed.

| step | result |
| --- | --- |
| 1 — revoke the PAT, press Publish, expect `Publish failed` | **unreachable as written, and now proven so** — see below. Covered by the revised step 1 in [divergence 2](#divergence-notes), which is step 4 |
| 2 — dead token disables the button with no press | **pass.** `Publish token expired`, disabled, after a reload and no interaction. The status icon is disabled with it, which is `disabled={!run && !isPending && !error}` behaving correctly when the poll itself is what failed |
| 3 — valid token dispatches a real run | **pass.** `Publish` → `Dispatching...` → `Publishing...` → `Publish`, and the modal tracked run `37804085660` from `in_progress` to `success` without a reload. Confirmed independently against the GitHub API |
| 4 — renamed workflow reads `Publish failed`, not `Publish token expired` | **pass, and this is the one that mattered.** With `NEXT_PUBLIC_GITHUB_WORKFLOW` pointed at a file that does not exist: the mount poll 404s and the label stays `Publish`; pressing it gives `Publish failed` with the button still enabled; the modal reads `Dispatch failed` / `GitHub dispatch failed: 404` and the **generic** cause string, not the auth one |
| 5 — saved edits survive | **pass.** An edit to `hero.eyebrow` saved, then carried through a 404 dispatch failure, a dev-server restart, a reload and the expired-token state. Saved again while the drawer read `Publish token expired`, which is the same assertion from the other side |

### Three things the run corrected

**1. Divergence 2's timing was wrong, and its conclusion is stronger than it claimed.** The note
said a dead token disables the button "in under a second". It takes about **seven**: react-query
retries the `401` with backoff before `error` is set, and throughout that window the label reads
`Publish` **disabled** — `isLoading` is still true. So there is no moment at which a dead token
leaves a pressable Publish button. The plan's step 1 is not racy, it is unreachable, and the
recommendation to rename the workflow instead stands unchanged.

**2. A 404 from the poll also disables the button for its retry window** — same `isLoading`, same
~2 s on a non-retried path. Harmless, and worth knowing before someone reports it: an editor who
opens the drawer and presses immediately meets a dead button with no explanation. If that is ever
worth fixing, `isLoading` is the wrong gate and `isPending && !isError` is the right one.

**3. `statusText` is empty over HTTP/2**, so the message renders as `GitHub dispatch failed: 404 `
with a trailing space rather than `404 Not Found`. Cosmetic, and only visible because this plan is
what put that string in front of an editor.

### Not covered by this run

The host's own `check-eager-chunks` gate, which is `nano-pro-web`'s and runs at revendoring time.
By inspection it passes: the only new eagerly-reachable code is a bare `Error` subclass in
`publish-github/src/client.ts`, a module that package already imports.
