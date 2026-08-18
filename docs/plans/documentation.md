# Plan: analyse and document Palimp

> **Historical design record — executed.** Kept as written. The docs it describes now exist:
> [README.md](../../README.md), [CLAUDE.md](../../CLAUDE.md),
> [../architecture.md](../architecture.md), and a README per package under
> [libs/](../../libs/). Context: [README.md](README.md).
>
> All three open questions were resolved by the stated assumptions: integrator-facing audience,
> Supabase schema reconstructed from adapter source, quickstart left unverified.

## Context

The repo is a pnpm workspace of five libraries and two example apps (~2 300 lines of TS/TSX). What exists today:

- `libs/be-firebase/README.md` — the only package README. Good model: entry points, data model, security rules, one known-quirk section.
- `docs/plans/{be-firebase,publish-github,publish-status}.md` — **forward-looking design plans**, written before the features landed. They describe intent and trade-offs, not current state, and they will drift.
- No root `README.md`, no `LICENSE`, no `CLAUDE.md`, no architecture doc.

So a newcomer (or an agent) has no entry point: nothing states what Palimp *is*, how the four adapter interfaces fit together, or what the Supabase schema looks like — the Firebase data model is documented, its Supabase counterpart is not.

Assumption I'm working under: the audience is **developers integrating Palimp into a Next.js app**, plus contributors to the libs themselves. Not a polished public-OSS launch (no badges, no contribution guide, no changelog). Say the word if you want it pitched at a public release instead.

## Phase 0 — Analysis pass

Read every source file end-to-end (it's small enough to do exhaustively rather than sample) and trace the four flows that actually define the system:

1. **Render** — `palimp()` server fn loads messages → `XcoreClientComponent` → `EditComponent` (react-query per key, `staleValue` fallback chain, `preview` mode short-circuit).
2. **Edit + save** — `editsStore` (`useSyncExternalStore`, `Map` + snapshot) → `useSaveButton` → `backend.setKeys` → query invalidation.
3. **Auth** — `LoginPageCore`, `hasSession()` synchronous contract and why each backend cheats differently (Supabase cookie sniff, Firebase `localStorage` mirror flag).
4. **Publish** — `publishToken` from the user profile → `workflow_dispatch` → run resolution polling → `getLatestRun` → status icon/modal.

Output: a scratch findings file, not a deliverable. It feeds phases 1–3 and captures the gap list below.

## Phase 1 — `docs/architecture.md`

The keystone document. Contents:

- **Layer diagram** (mermaid): `core` at the centre defining contracts; `fe-next` binding them to Next.js; `be-supabase`/`be-firebase` implementing the backend pair; `publish-github` implementing the publish adapter; examples wiring a concrete combination.
- **The four contracts**, quoted from source with commentary on why each is shaped as it is:
  - `PalimpServerBackendAdapter` — one method, bulk load for SSR
  - `PalimpClientBackendAdapter` — auth + per-key read + batched write; note the commented-out `setKey` and the synchronous `hasSession` constraint
  - `PalimpPublishAdapter` — dispatch + poll
  - The React context trio (`PalimpGeneralContext`, `PalimpClientBackendContext`, `PalimpPublishContext`)
- **Sequence diagrams** for render/edit/save and for publish.
- **Why the design is adapter-shaped**: adding a backend touches zero files in `core` — the `be-firebase` plan is the proof, and that claim is worth stating explicitly since it's the repo's main architectural bet.

## Phase 2 — Package READMEs

One per lib, matching the shape `be-firebase/README.md` already sets (purpose → entry points → usage → quirks):

| Package | Emphasis |
| --- | --- |
| `@palimp/core` | The contracts, the contexts, the Devtools drawer, `editsStore`. Note `antd` + `@tanstack/react-query` are hard runtime deps of the admin UI. |
| `@palimp/fe-next` | `setBackendAdapter` module-level singleton, `palimp()` usage in server components, `PalimpProvider` and its dynamic Devtools import. |
| `@palimp/be-supabase` | **The `inline` / `profiles` SQL schema** — currently undocumented anywhere; will be reconstructed from `src/client.ts` and `src/server.ts`. Plus the cookie-sniff session check. |
| `@palimp/publish-github` | Required token scopes, the `owner`/`repo`/`workflow` config, and the two GitHub API quirks (204-with-no-run-id, dispatch-time matching). |
| `@palimp/be-firebase` | Already written — review for drift against current source, align headings with the others. |

## Phase 3 — Root `README.md`

What Palimp is (inline content editing for Next.js, edit-in-place with a Devtools drawer, publish via CI), the package matrix, a quickstart pointing at whichever example matches your backend, and the workspace scripts (`build` / `dev` / `check-types`).

I will **not** claim the quickstart is verified — running either example needs Supabase or Firebase credentials I don't have. If you want it verified end-to-end, that's a separate step needing env values from you.

## Phase 4 — `CLAUDE.md` and plan-folder hygiene

- `CLAUDE.md`: build/typecheck commands, the `libs/*` build-before-example ordering, code conventions observed in the source, and a pointer to `docs/architecture.md`.
- A short header note on `docs/plans/` marking those files as historical design records superseded by the new docs — so nobody reads `publish-status.md` as current API.

## Gaps I expect to surface (documented, not fixed)

Analysis will name these; fixing them is out of scope unless you ask:

- No tests anywhere; root `test` script is `exit 1`.
- `XcoreClientComponent` — leftover name from a previous project identity, exported through the render path.
- `hasSession()` can return a false positive in both backends (acknowledged for Firebase, undocumented for Supabase).
- `setKey` commented out in the client adapter interface.
- Deploy workflows double as the publish target — a real coupling worth stating, since `NEXT_PUBLIC_GITHUB_WORKFLOW` in CI points back at the very workflow that deploys the example.

## Deliverables

```
README.md                      new
CLAUDE.md                      new
docs/architecture.md           new
libs/core/README.md            new
libs/fe-next/README.md         new
libs/be-supabase/README.md     new
libs/publish-github/README.md  new
libs/be-firebase/README.md     reviewed for drift
docs/plans/                    header note added
```

## Open questions

1. **Audience** — integrator-facing (my assumption) or public-OSS-launch polish?
2. **Supabase schema** — reconstruct from adapter source (my assumption), or do you have the actual migration SQL to paste in?
3. **Quickstart verification** — leave unverified, or supply credentials so I can run both examples?
