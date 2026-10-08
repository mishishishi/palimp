# Publish status staleness — three causes behind one stale modal

Written 2026-10-06, before the fix, against `@palimp/publish-github` 1.8.0 (`13615d72`).
Landed as 1.8.1.

## The report

A host — `nano-pro-web`, the first non-example consumer, vendoring 1.8.0 with no drift from
`pr/08-collections` HEAD — opened the Publish status modal **while a workflow was running** and
saw the *previous* run: a completed one, with its own run id, and no in-progress state anywhere
in the drawer.

The interesting part of this report is that it has three independent causes. Each alone produces
the same symptom, each has a different fix, and two of them cannot fire in that host's
configuration. Fixing only the one that reproduces locally would have left production broken.

## Cause 1 — the browser HTTP cache serves the poll loop

[`fetchRuns`](../../libs/publish-github/src/client.ts) sent a plain `fetch` with default caching.
api.github.com answers `GET /actions/workflows/{wf}/runs` with:

```
cache-control: private, max-age=60
```

So for up to a minute the browser satisfies the 10 s poll from its own copy without touching the
network. Both the status *and* the run id come back stale, and nothing in the app can tell —
there is no request, no error, no `304`, just a resolved promise with the old body.

This is the cause that bites the reporting host, whose publish target is `workflow_dispatch`-only.
Causes 2 and 3 cannot fire there at all.

It is also the one that explains the sharpest detail in the report: a *stale run id*. A
status-only staleness would be cause 2 or 3; an old id means an old response body.

## Cause 2 — polling stops at `completed`

[`usePublishRun`](../../libs/core/src/Admin/Devtools/usePublishRun.ts) returned `false` from
`refetchInterval` once the known run was `completed`. Correct for the run this tab dispatched,
wrong for every other way a run starts: another admin, another tab of the same admin, a
push-triggered deploy. Those were picked up only on remount or window-focus refetch — and at
either of those moments cause 1 could still hand back the cached body.

## Cause 3 — the `event=workflow_dispatch` filter has no escape hatch

`runsUrl` hard-coded `event=workflow_dispatch`. With `per_page=1`, `getLatestRun` therefore
returns the newest **dispatched** run. When the target workflow also triggers on `push` — the
host's `.env.local` points at `preview.yml`, which does — a push build in flight is invisible and
the newest dispatched run is an older, completed one. The modal shows it as "latest", with no
label saying "dispatched".

The README already documented this as a quirk. Documenting it was not enough: a host had no way
to opt out, and the UI's wording does not carry the caveat.

## The fix

1. **`cache: "no-store"` in `fetchRuns`.** The only reliable way to defeat a `max-age` the server
   sets and the app does not control.
2. **`refetchInterval` falls back to `60_000` instead of `false`.**
3. **`followAllEvents?: boolean` on `GithubPublishOptions`**, default off, threaded into `runsUrl`
   and passed by `getLatestRun` only.

`findRunSince` deliberately keeps filtering even when the flag is set. It matches a dispatch by
`created_at` within a 5 s tolerance; widening its candidate list to include push runs makes that
heuristic strictly worse, and the flag is about what "latest" means in the drawer, not about how
a dispatch is located.

With the flag off, the emitted URL is byte-identical to 1.8.0's.

## What this costs

`no-store` gives up the conditional-request exemption: GitHub does not bill a `304` against the
5 000/h PAT quota, and now there are no `304`s. Combined with the idle poll, the worst case is
~360 requests/hour per admin on an unfinished run and ~60/hour idle. Comfortable, but the
"well inside the limit" line in the README was written when polling was nearly free, and it
isn't any more.

## Rejected: plumbing the modal's open state into the hook

The faithful fix for cause 2 is to poll only while someone is looking — pass the modal's open
state down through `usePublishButton` into `usePublishRun` and gate the interval on it. That is
strictly better on request count: zero while the drawer is closed, instead of 60/hour.

It was rejected as three files and a new prop threaded through two components to save requests
that are already inside the budget, for admins only, while a drawer is mounted. The 60 s idle
poll is one line and needs no new plumbing. If the request volume ever matters — many admins,
long-lived sessions — this is the change to make, and this paragraph is the record that it was
considered rather than missed.

## Verification

`pnpm check-types` and `pnpm build` are the gate in this repo. Neither can see any of this: all
three causes are runtime behaviour against a live GitHub API, and the symptom requires a workflow
that is actually running.

Real verification is in the host after revendoring: start a run, open the modal, confirm the
in-progress state appears within ~10 s, and confirm the run id matches the run GitHub shows. The
cause-1 fix is observable in devtools — the poll requests should show as network requests rather
than `(disk cache)`.

## Divergence note

None at time of writing; the three decisions above were fixed before implementation. The one
addition made during the work was updating `docs/architecture.md`, which described the old
polling and filtering behaviour as current.
