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
