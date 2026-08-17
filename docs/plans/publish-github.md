# Plan: `@palimp/publish-github` integration

> **Historical design record — not current API.** Written before this feature was built and kept
> as written. For how the code behaves today see
> [libs/publish-github/README.md](../../libs/publish-github/README.md). Context:
> [README.md](README.md).
>
> The adapter sketched here was replaced almost immediately by
> [publish-status.md](publish-status.md) — see the divergence note at the end of this file before
> using any code block below.

## Context

The Devtools panel in `libs/core/src/Admin/Devtools/index.tsx:91` renders a hard-disabled `Publish` button — a deliberate placeholder for the eventual deploy/publish action. We want admins to be able to trigger a GitHub Actions workflow (typically a site rebuild/deploy) from that button.

This plan adds a new workspace package `@palimp/publish-github` that follows the same conventions as the existing `@palimp/be-supabase` integration: split into a framework-agnostic adapter factory plus a thin React provider, exposed via `exports` subpaths.

To keep `publish` orthogonal to the data backend (Supabase today, anything tomorrow), we introduce a separate capability seam in core — a new `PalimpPublishContext` / `PalimpPublishAdapter` — rather than bolting `publish()` onto `PalimpClientBackendAdapter`. The Devtools button reads the new context; if no provider is mounted it stays disabled (current behaviour preserved).

Per the user's choice, the GitHub token is supplied directly to the client — no server route. Acknowledged trade-off: the PAT is visible to anyone who opens the browser. Suitable for short-lived, fine-grained tokens scoped to a single workflow_dispatch on a single repo.

## What changes

### 1. New capability seam in `@palimp/core`

Two new files, plus an export update:

- `libs/core/src/PalimpPublishAdapter.ts`
  ```ts
  export interface PalimpPublishAdapter {
    publish: () => Promise<void>;
  }
  ```
- `libs/core/src/PalimpPublishContext.ts` — `createContext<PalimpPublishAdapter | null>(null)`. Nullable so a missing provider is a first-class state (button stays disabled).
- `libs/core/src/index.ts` — re-export the type and context, mirroring the existing `PalimpClientBackendContext` / `PalimpClientBackendAdapter` exports.

### 2. New Devtools hook + button wiring

- `libs/core/src/Admin/Devtools/usePublishButton.ts` — mirrors `useSaveButton.tsx` (file path `libs/core/src/Admin/Devtools/useSaveButton.tsx`). Reads `PalimpPublishContext`; if `null`, returns `{ props: { disabled: true }, isPending: false, available: false }`. If present, wraps `adapter.publish()` in a `useMutation` against the shared `queryClient` (`libs/core/src/Admin/queryClient.ts`) under mutation key `["palimp:publish"]`.
- `libs/core/src/Admin/Devtools/index.tsx:91` — replace `<Button disabled>Publish</Button>` with the hook-driven version, matching the shape of the existing Save button (`block`, label changes to `Publishing...` while pending).

### 3. New package `libs/publish-github/`

Mirror `libs/be-supabase/` layout exactly. Files:

- `package.json`
  - `"name": "@palimp/publish-github"`, `"type": "module"`, `"version": "1.0.0"`
  - `exports`: `./client` and `./react` (same shape as `be-supabase/package.json`)
  - `scripts`: `build`, `dev`, `check-types` — copy verbatim from `be-supabase`
  - `peerDependencies`: `@palimp/core: workspace:*`, `react: *`
  - `devDependencies`: `@types/react`
  - No runtime deps — uses `fetch`
- `tsconfig.json` — copy verbatim from `libs/be-supabase/tsconfig.json` (extends `../tsconfig.base.json`)
- `src/client.ts`:
  ```ts
  import type { PalimpPublishAdapter } from "@palimp/core";

  export interface GithubPublishOptions {
    token: string;
    owner: string;
    repo: string;
    workflow: string;       // filename (e.g. "deploy.yml") or numeric id
    ref?: string;           // default "main"
    inputs?: Record<string, string>;
  }

  export const createGithubPublishAdapter = (
    opts: GithubPublishOptions,
  ): PalimpPublishAdapter => ({
    publish: async () => {
      const res = await fetch(
        `https://api.github.com/repos/${opts.owner}/${opts.repo}/actions/workflows/${opts.workflow}/dispatches`,
        {
          method: "POST",
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${opts.token}`,
            "X-GitHub-Api-Version": "2022-11-28",
          },
          body: JSON.stringify({
            ref: opts.ref ?? "main",
            ...(opts.inputs ? { inputs: opts.inputs } : {}),
          }),
        },
      );
      if (!res.ok) {
        throw new Error(`GitHub dispatch failed: ${res.status} ${res.statusText}`);
      }
    },
  });
  ```
- `src/react.tsx` — `PalimpGithubPublishProvider` that takes the same options as props, builds the adapter via `useMemo`, and renders `<PalimpPublishContext value={adapter}>{children}</PalimpPublishContext>`. Pattern copied from `libs/be-supabase/src/react.tsx`.

### 4. Example wiring (`examples/supabase-next`)

- `examples/supabase-next/app/layout.tsx` — wrap the existing tree with `PalimpGithubPublishProvider`, reading config from public env vars (token must be `NEXT_PUBLIC_*` since we chose client-side):
  ```tsx
  <PalimpSupabaseProvider ...>
    <PalimpGithubPublishProvider
      token={process.env.NEXT_PUBLIC_GITHUB_TOKEN!}
      owner={process.env.NEXT_PUBLIC_GITHUB_OWNER!}
      repo={process.env.NEXT_PUBLIC_GITHUB_REPO!}
      workflow={process.env.NEXT_PUBLIC_GITHUB_WORKFLOW!}
    >
      <PalimpProvider>...</PalimpProvider>
    </PalimpGithubPublishProvider>
  </PalimpSupabaseProvider>
  ```
- `examples/supabase-next/.env.local` — add the four `NEXT_PUBLIC_GITHUB_*` placeholders (token left blank for the user to fill in).
- `examples/supabase-next/package.json` — add `"@palimp/publish-github": "workspace:*"` to `dependencies`.

### 5. Workspace plumbing

- `pnpm-workspace.yaml` already globs `libs/*`, so the new package is picked up automatically — no edit needed.
- After files land: `pnpm install` to register the workspace package, then `pnpm -r build` (or `pnpm --filter @palimp/publish-github build`) to produce `dist/` so the example can resolve the `exports` map.

## Files modified vs. created

**Created**
- `libs/publish-github/package.json`
- `libs/publish-github/tsconfig.json`
- `libs/publish-github/src/client.ts`
- `libs/publish-github/src/react.tsx`
- `libs/core/src/PalimpPublishAdapter.ts`
- `libs/core/src/PalimpPublishContext.ts`
- `libs/core/src/Admin/Devtools/usePublishButton.ts`

**Modified**
- `libs/core/src/index.ts` — add two exports
- `libs/core/src/Admin/Devtools/index.tsx` — swap disabled `<Button>` for hook-driven version
- `examples/supabase-next/app/layout.tsx` — mount provider
- `examples/supabase-next/.env.local` — add `NEXT_PUBLIC_GITHUB_*` keys
- `examples/supabase-next/package.json` — add workspace dep

## Verification

1. `pnpm install` — confirm the new workspace package is linked.
2. `pnpm -r check-types` — must pass (catches a missing core export or a wrong adapter shape).
3. `pnpm -r build` — confirms `libs/publish-github/dist/` is produced with both `client.js` and `react.js` matching the `exports` map.
4. `pnpm --filter @example/supabase-next dev` — open the app, log in as admin, open the Devtools drawer. Without `NEXT_PUBLIC_GITHUB_TOKEN` set, the button stays disabled (provider receives an empty token and the dispatch will 401 — acceptable smoke). With a valid token + a real workflow in the target repo, clicking should produce a successful workflow_dispatch (verify by checking the Actions tab on GitHub or by watching the network response 204).
5. Manually verify a failing dispatch (bad token) surfaces an error — `useMutation`'s default error state is fine for v1; no toast required.

## Out of scope (deliberate)

- Server-side route handler / token proxy — user opted for client-side direct.
- Polling the run after dispatch to show progress in the UI.
- Status / history of recent runs.
- Per-environment workflow selection.
- Listing available workflows.

## Divergence from what shipped

Added after the fact. The plan is unedited above.

- **`PalimpPublishAdapter` no longer has this shape.** The single `publish: () => Promise<void>`
  was replaced by `publish(token) => Promise<PalimpPublishRun>` plus `getLatestRun(token)` in
  [publish-status.md](publish-status.md), which also introduced the `PalimpPublishRun` type and
  the status/conclusion enums.
- **`GithubPublishOptions` carries no `token`.** The two "out of scope" items at the bottom —
  polling the run and showing status — were both built, and the token moved with them: it is now
  the signed-in user's `publishToken`, read from their profile row and passed per call, rather
  than adapter config from a `NEXT_PUBLIC_GITHUB_TOKEN` env var. The example layouts pass only
  `owner` / `repo` / `workflow`.
- **`PalimpPublishContext` is not nullable.** It is `createContext<PalimpPublishAdapter>(null!)`,
  so the "if no provider is mounted the button stays disabled" behaviour described in Context was
  not what got built — the button renders enabled and clicking is a silent no-op.
- The `usePublishButton` return value described in §2 was rewritten by the follow-up plan.
