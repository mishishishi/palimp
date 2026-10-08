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
