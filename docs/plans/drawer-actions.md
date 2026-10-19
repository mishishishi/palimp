# Drawer actions — optional host buttons under Publish (1.10.0)

Written 2026-10-19, before the feature, against `@palimp/core` 1.9.0 (`e2a41a1`). Not built.
**Written in `nano-pro-web`** and moved here with only its links and host-internal references
adapted. See [where this came from](#where-this-came-from).

## The report

`nano-pro-web` runs two sites from one repository: a **preview** where the client edits through
palimp, and the **live** site, rebuilt by a separate `production.yml` workflow. Publish in the
preview's drawer rebuilds the preview. To put the edits live, the client currently has to go to
GitHub's Actions tab and dispatch `production.yml` by hand. The host wants that dispatch to be one
button in the drawer, behind a confirm.

## Why the host could not do it alone

The host built it first, as its own fixed `'use client'` button next to the drawer handle, with
antd's colours copied into its CSS as tokens. It passed the host's build and its eager-chunk
gate, and was then rejected on sight. Two things went wrong that a build can't catch:

1. **It fights the drawer for the same pixels.** The drawer sits in a `position: fixed` wrapper
   ([Devtools/index.tsx](../../libs/core/src/Admin/Devtools/index.tsx)) with no z-index. That
   wrapper is a stacking context, so the drawer's own `z-index: 1000` is trapped inside it. A host
   control with *any* z-index paints over the open drawer and blocks its buttons. Without one, it
   only works because palimp happens to mount after the page. Nobody wrote that contract down, and
   it can't be relied on.
2. **It copies palimp's look.** antd's default theme had to be re-spelled as host tokens, because
   importing antd would have put it in the visitor's eager chunks. The copy drifts as soon as the
   drawer's theme changes.

Both go away when the button lives **inside** the drawer. palimp then owns the layout and the antd
theme, and the drawer is lazy, so antd costs visitors nothing.

## Settled by the host's owner, 2026-10-19

| Question | Answer | Consequence |
|---|---|---|
| What shape in palimp? | **"Some configurable optional button"** the host uses to dispatch production | A generic drawer *action* in core, not a GitHub-only feature |
| Live status for the extra run? | **No.** The run id and a link to it | An action reports a one-line result and an optional link, and does no polling |
| Two halves, or the generic action alone? | **Both halves** | §Design as written |
| Label while running? | **Fixed `Running...`** | No `pendingLabel` field |
| Branch? | **Stack on PR #13** | `pr/11-drawer-actions` from `pr/10-publish-failure-is-silent` |

The label and confirm strings are host-supplied, so their language is the host's choice. This
host passes English.

## Goal

The drawer can show **optional, host-configured buttons** under Publish. Each has a label, an
optional confirm, an async action and a persistent result. With none configured, the drawer is
unchanged. The existing Publish button doesn't change either way.

## Design

### The constraint that picks the shape

**A Next.js host configures palimp from its layout, which is a Server Component, and a function
can't be passed from a Server Component to a client one.** A button that takes an `onClick` or
`run` callback can't be configured from there. The host would need its own `'use client'` wrapper:
more eager bytes, another client boundary, and the antd import risk back again. So the config the
host writes has to be **serializable**, and the callback has to live inside palimp.

That splits the feature in two. Each half is useful without the other:

1. **`@palimp/core`: the generic button.** A new root-exported context,
   **`PalimpDrawerActionsContext`**, default `[]`, holds `ReadonlyArray<PalimpDrawerAction>`:

   ```ts
   interface PalimpDrawerAction {
     id: string;                       // React key, and the mutation key suffix
     label: string;                    // "Publish live site"
     confirm?: { title: string; content: string; okText?: string };
     needsPublishToken?: boolean;      // disabled + "Missing publish token" without one
     run: (user: User) => Promise<{ message: string; href?: string } | void>;
   }
   ```

   [DevtoolsContent.tsx](../../libs/core/src/Admin/Devtools/DevtoolsContent.tsx) renders one
   `Button block` per action, below the Publish group and above the divider. Each button uses a
   `useDrawerAction(action)` hook built like
   [usePublishButton.ts](../../libs/core/src/Admin/Devtools/usePublishButton.ts): a `useMutation`,
   with `reset()` before `mutate()`.

   **States** reuse 1.9.0's vocabulary rather than inventing one:
   - `Missing publish token`, disabled.
   - `Running...` while pending.
   - After a press, either the result line or `<label> failed`. The button stays enabled, so it
     doubles as the retry.

   The result and the error stay until the next press (persistent, not a toast), in a small
   `Typography.Text` under the button. The error text reuses `dispatchCause` from
   [PublishStatusModal.tsx](../../libs/core/src/Admin/Devtools/PublishStatusModal.tsx) and narrows
   on `PalimpPublishAuthError`, so a refused token reads differently from a `404` at no extra cost.

   **The confirm** is `modal.confirm` through a `Modal.useModal` holder, copied from
   [useSaveButton.tsx](../../libs/core/src/Admin/Devtools/useSaveButton.tsx) so that it inherits
   the host's antd theme. It sets `autoFocusButton: "cancel"` so the harmless choice is the
   default.

2. **`@palimp/publish-github`: the serializable form.** `PalimpGithubPublishProvider`
   ([react.tsx](../../libs/publish-github/src/react.tsx)) gains an **`extraTargets?`** prop:
   `ReadonlyArray<{ id; label; workflow; confirm?; ref?; inputs? }>`, all plain data. The prop
   belongs to the provider, not to `GithubPublishOptions`.

   The provider turns each entry into a `PalimpDrawerAction` with `needsPublishToken: true`. Its
   `run` calls `createGithubPublishAdapter({ owner, repo, workflow, ref, inputs }).publish(user.publishToken)`
   and returns `{ message: "Run <id> started", href: run.url }`. The provider wraps its children in
   `PalimpDrawerActionsContext` and **concatenates** with any parent value, so nesting adds actions
   and never replaces them.

   ⚠ An extra target **never** takes `followAllEvents`. It only dispatches and never polls, so the
   flag means nothing to it.

The host's whole change is then one prop, set from a Server Component, with no new client file.

### Rejected

- **The generic button only, with no GitHub form.** It is what was literally asked for, and it
  stays as half 1. On its own, though, it pushes the host back into a client wrapper, the cost
  that sank the host route. The GitHub form is about 20 lines on top.
- **Named publish targets, each with its own status polling.** `PalimpPublishContext` would become
  an array, with `usePublishRun` per target. That is heavier: a query key per target, a
  target-aware status modal, and a `PublishStatusIcon` per row. Status was explicitly not wanted.
  An action can grow into a target later without breaking its API, because `run` returning an
  `href` is the seam.
- **A `ReactNode` slot in the drawer.** It can't be passed from a Server Component, and it gives
  the host the antd import problem back.

### Weight

The new context and the provider mapping are eager in a host that statically imports
`@palimp/publish-github/react` from its layout. That is a few hundred bytes. The drawer half is
behind the existing lazy boundary, so it costs nothing until an editor signs in. **No core import
may pull the drawer into the eager path.**

## Out of scope

- **Status polling** for an action (see Rejected for the upgrade path).
- **An approval gate.** The confirm is the guard.
- **Any change to Publish, `usePublishRun` or the status modal.** An action is a sibling of
  Publish, not a mode of it.
- **`be-firebase`**, apart from the lockstep version bump.

## Steps

1. **Branch** `pr/11-drawer-actions` from `pr/10-publish-failure-is-silent` (PR #13).
2. **Core.** The `PalimpDrawerAction` type and `PalimpDrawerActionsContext`, exported from the
   root. Then `useDrawerAction` and the render loop in `DevtoolsContent.tsx`. Copy the confirm from
   `useSaveButton`.
3. **publish-github.** `extraTargets` on the provider's props, mapped into actions and concatenated
   with the parent context.
4. **Docs.**
   - This plan's row in [README.md](README.md).
   - [libs/core/README.md](../../libs/core/README.md) and
     [libs/publish-github/README.md](../../libs/publish-github/README.md) for the new surface.
   - [../architecture.md](../architecture.md), if the seam list changes.
   - A `docs/releases/1.10.0-revendor-nano-pro-web.md` handover, in
     [the 1.9.0 one's](../releases/1.9.0-revendor-nano-pro-web.md) shape.
5. **Verify.** Run `pnpm check-types` and `pnpm build`. Then, in `examples/supabase-next` with two
   workflows, check five things:
   - An action dispatches.
   - Cancel dispatches nothing.
   - A garbage token reads the auth cause.
   - A renamed workflow reads the generic cause.
   - Publish is unaffected.

   All five need credentials, so ask first. Report each as pass / fail / not run.
6. **Bump everything in lockstep to 1.10.0, then `pnpm pack:all`** from a clean tree. Stage the
   tarballs, the manifest and `SHA256SUMS.txt`, as with 1.9.0.

## What the host does with it

For the handover's benefit, here is what the host will do after revendoring:

- **Preview build:** sets `NEXT_PUBLIC_GITHUB_PRODUCTION_WORKFLOW=production.yml` and
  `NEXT_PUBLIC_PRODUCTION_SITE_URL`. **Live build:** sets neither, so the live site never grows a
  button that republishes itself.
- **When both are set, it passes one entry:**

  ```tsx
  extraTargets={[{
    id: "production",
    label: "Publish live site",
    workflow: "production.yml",
    confirm: {
      title: "Publish the live site?",
      okText: "Publish live site",
      content: "The public site at {url} rebuilds from the saved content. Visitors see the change in a few minutes. The preview is not affected.",
    },
  }]}
  ```

- **Its browser checks** include one this plan exists for: **the drawer is fully usable with the
  action present.**

## Where this came from

Written in `nano-pro-web`'s private build record as the replacement for a host-side button that
was built and rejected on 2026-10-19 (§Why the host could not do it alone). It was moved here
because the work is library work. The host keeps its own copy for the revendor and the
client-facing documents that follow it.

---

## Divergence notes

Added 2026-10-19, after the build (`5518e9e`, 1.10.0). The plan above is kept as written; these
record where the code went somewhere it did not say, or where it said nothing.

**1. A `run` that returns nothing reads `Done`.** The plan's type allows `void` but never says
what the result line shows for it. Asked and answered by the owner the same day: a fixed `Done`,
so a void action still reads differently from one never pressed. `extraTargets` always returns a
message, so only a hand-written action reaches it.

**2. `dispatchCause` takes the retry button's name.** Reused as the plan says, but verbatim it
ends *"pressing Publish again is the retry"* under a button that is not Publish. Owner's call:
`dispatchCause(error, button = "Publish")`, so the status modal's text is byte-identical and an
action reads *"pressing Publish live site again is the retry"*. The first sentence, *"The site
was not rebuilt."*, is still shared, which is right for the GitHub form and only approximately
right for an arbitrary action.

**3. `ref` is inherited, `inputs` are not.** The plan's mapping passes `{ owner, repo, workflow,
ref, inputs }` without saying whose `ref`. Owner's call: `target.ref ?? provider ref ?? "main"`,
same repo, same likely branch. `inputs` stay the target's own, because a different workflow can
`422` on inputs it does not declare.

**4. `focusable.autoFocusButton`, not `autoFocusButton`.** The plan's spelling is deprecated in
antd 6.4.4 and logs a console warning on every confirm — found by the verification run below,
through the Next.js dev overlay, and fixed before the commit. Same behaviour, Cancel focused.

**5. Shape of the code.** The type is `PalimpDrawerAction.ts` and the context
`PalimpDrawerActionsContext.ts`, mirroring `PalimpPublishAdapter.ts` / `PalimpPublishContext.ts`;
`PalimpDrawerActionResult` is exported beside the action. Because a hook cannot be called in a
`.map`, each action is a `DrawerActionButton` component that calls `useDrawerAction(action)`; the
hook owns the `useMutation` (key `["palimp:action", id]`) and the `Modal.useModal` holder, so
each button renders its own holder. `publish-github` exports `GithubExtraTarget` from `./react`.

**6. The version bump went inside the feature commit**, as every previous version did, rather
than as a step-6 commit of its own. Step 6's packing still ran from a clean tree after it.

**7. The architecture's seam list did not change.** The new context is not a seam — it carries
no adapter — so `architecture.md` gained a row in the context table and a §Drawer actions under
§Publish, and the "five seams" sentence names it as riding beside the quartet.

**8. Two behaviours nobody planned, both recorded as quirks in `core`'s README, neither fixed:**

- **Answering the confirm closes the drawer.** `Devtools/index.tsx` closes on any `document`
  click outside the drawer element, and the confirm is portalled to `body`. The editor does not
  see `Running...`; the result is waiting when they reopen it, because a closed antd `Drawer`
  keeps its content mounted. Save's confirm has always done the same, so this is not new, but
  this feature is the first to put a confirm in front of every press.
- **The drawer does not grow.** It is a fixed `40vh`, and on a 776 px viewport the stock buttons
  fill its body exactly (254 of 254 px). One idle action overflows by 5 px, its result line by
  about 25 px, its error by about 120 px. It scrolls, so everything stays reachable, but the
  user row and logout are what scroll out first. This bears directly on the host's check that
  *"the drawer is fully usable with the action present"* — usable, by scrolling.

**9. An action does not share Publish's `Publish token expired` pre-check.** Not a divergence —
the plan's state list has no such state — but it is visible: with a dead token, Publish reads
`Publish token expired` (disabled) while the action beside it is still pressable, and fails
after the press with the auth cause. The poll proves Publish's workflow readable, not the
action's.

## Verification run — 2026-10-19, live host

`pnpm check-types` and `pnpm build` pass. Then `examples/supabase-next` with real Supabase
credentials, a real fine-grained PAT on `mishishishi/palimp`, and the drawer driven over CDP.
The example's `layout.tsx` was given a **local, uncommitted** `extraTargets` entry — the host's
own, labels and confirm included — reading its workflow from an env var, so a rename was an
`.env.local` edit. That layout has no `"use client"`, so the prop crossed the Server → Client boundary
for real — the constraint the whole second half exists for.

⚠ **Both workflows were `deploy-supabase.yml`** — the owner's choice over `deploy-firebase.yml`,
to avoid a Firebase deploy as a side effect. So this is not the plan's "two workflows", and the
action's run became Publish's latest run (Publish's icon followed it, which is quirk-level
behaviour documented in `publish-github`'s README). Check 5 was run after that run completed so
the two did not overlap.

| check | result |
| --- | --- |
| 1 — an action dispatches | **pass.** Confirm → OK: `Running...` (disabled) for 3.6 s, then `Publish live site` with the link `Run 39193624363 started` → `github.com/mishishishi/palimp/actions/runs/39193624363`, `target=_blank`. The run appeared on GitHub as a `workflow_dispatch` and completed `success` |
| 2 — Cancel dispatches nothing | **pass.** The confirm opened with *Publish the live site?*, the host's body text, `Cancel` / `Publish live site`, and **Cancel focused**. Cancel: no label change, no result line, and the dispatched-run count on GitHub stayed at 6. A later Cancel with a result already shown left that result in place |
| 3 — a garbage token reads the auth cause | **pass.** With `publish_token` set to garbage by the owner: Publish read `Publish token expired` (disabled) after the poll's retries; the action stayed enabled; pressing it gave `Publish live site failed` (enabled), `GitHub dispatch failed: 401` and *"The publish token on your account was refused…"*. No run created. The token was restored and Publish re-enabled on reload |
| 4 — a renamed workflow reads the generic cause | **pass.** Action's workflow set to `does-not-exist.yml`: `Publish live site failed` (enabled), `GitHub dispatch failed: 404`, and *"The site was not rebuilt. … pressing Publish live site again is the retry."* Publish beside it unchanged and enabled |
| 5 — Publish is unaffected | **pass.** `Publish` → `Dispatching...` → `Publishing...` (3.9 s) → `Publish` (56.6 s), the status modal tracking run `39193698824` to `success`, matching GitHub. The action's result line from check 1 was untouched throughout |

### What the run cost, and one false start

- The example's Supabase project had been **paused** since the 1.9.0 run (NXDOMAIN on public
  DNS, then `521` and `502` while it woke). The owner restored it; the session cookie in the rig
  profile had not survived, so they signed in again.
- The first check-1 attempt **404'd for a rig reason, not a library one**: the env var was
  appended to an `.env.local` with no trailing newline, which glued it onto
  `NEXT_PUBLIC_GITHUB_WORKFLOW`. That press is not counted. It did render the failure state
  correctly, a free preview of check 4.
- Two real `deploy-supabase.yml` runs were dispatched (`39193624363`, `39193698824`), each a
  Pages redeploy of `main`. Both `success`.

### Not covered by this run

- **The host's own checks**, including its eager-chunk gate and *"the drawer is fully usable
  with the action present"* on its viewport — see divergence 8.
- **Firebase.** Not in scope for this run, per the standing rule.
