# CLAUDE.md

Guidance for agents working in this repo.

Read [docs/architecture.md](docs/architecture.md) before changing anything in `libs/`. It explains
the four contracts, why `hasSession()` is synchronous, why writes are batched, and what the static
export premise implies. Most non-obvious code here is non-obvious for a reason documented there.

## Commands

```sh
pnpm install
pnpm build         # tsc each lib into dist/, dependency order
pnpm dev           # same, parallel watch
pnpm check-types   # tsc --noEmit across libs — the only automated gate
```

All three filter to `./libs/*`. Examples are separate:

```sh
pnpm --filter @example/supabase-next dev
pnpm --filter @example/firebase-next build
```

**Build the libs before running an example.** Examples resolve `@palimp/*` through each package's
`exports` map, which points at `dist/` — not at `src/`. A source change is invisible to an example
until `pnpm build` (or a running `pnpm dev`) has emitted it. A "module not found" or a stale-type
error from an example is almost always this.

`pnpm test` exits 1; there are no tests. The `lint` scripts in the examples reference `eslint`,
but no config and no eslint dependency exist anywhere in the workspace — they do not run. Don't
add a lint step to a verification loop expecting it to work.

Node 26 (`.nvmrc`), pnpm 11.8.

## Verifying a change

1. `pnpm check-types` — catches an adapter that no longer satisfies its interface, which is the
   failure mode that matters most here.
2. `pnpm build` — confirms each `dist/` still matches its `exports` map.
3. If it touches rendering or the drawer, run an example. That needs real Supabase or Firebase
   credentials; ask rather than guessing at them.

## Conventions

Follow what's already in the file you're editing. Across the codebase:

- **Named exports only.** Default exports appear solely in Next.js route files, where the
  framework requires them.
- **Arrow-function components**, props typed by a local `interface Props` or inline for one or
  two fields.
- **React 19 idioms throughout**: `use(Context)` rather than `useContext`, and
  `<Context value={…}>` rather than `<Context.Provider value={…}>`. Don't reintroduce the older
  spellings.
- **`import type` is mandatory** for type-only imports — `verbatimModuleSyntax` is on, so an
  import without it survives into the emitted JS and becomes a real runtime dependency, even when
  the binding is only ever used in a type position. This bites hardest in the backend adapters,
  where the SDK is a devDependency and the emitted import would resolve only by accident.
- **Relative imports are inconsistent** about `.ts`/`.tsx` extensions; both forms compile
  (`allowImportingTsExtensions` + `rewriteRelativeImportExtensions`). Match the file you're in.
- **`null!`** is the house style for context defaults and lazily-initialised module locals.
- **Query keys are namespaced** `palimp:*` — `["palimp:edit", key]`, `["palimp:save"]`,
  `["palimp:publish:latestRun"]`. Keep new ones in that shape.
- **Formatting** is Prettier defaults (80 columns, double quotes, semicolons, trailing commas),
  though no config file is checked in.

### Strict-mode constraints worth knowing

`libs/tsconfig.base.json` enables `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` on
top of `strict`. Two consequences that shape real code:

- Optional properties can't be assigned `undefined`. That is why
  [publish-github/src/client.ts](libs/publish-github/src/client.ts) builds run objects with
  `...(run.html_url ? { url: run.html_url } : {})` instead of `url: run.html_url`. Keep that
  pattern rather than widening the type.
- Indexed access yields `T | undefined`. Array lookups need a guard.

### Adding a backend adapter

Copy [libs/be-firebase/](libs/be-firebase/) — it is the most recent and the cleanest. Three
entry points (`./client`, `./server`, `./react`), an `exports` map, `files: ["dist"]`, and the
same three scripts verbatim. Dynamic-import the SDK inside an `ensureX()` so it stays out of the
wrong bundle, and keep `@palimp/core` a peer dependency.

The point of the seam is that this touches **zero files in `libs/core`**. If you find yourself
editing `core` to add a backend, something is wrong with the adapter, not with `core`.

Then write the README — package docs follow a fixed shape here: purpose → entry points → usage →
data model → quirks. The "quirks" section is not optional; it is where the known-wrong behaviour
lives, and every package has some.

## Things not to do

- Don't statically import `@palimp/core/admin`. Both call sites in `fe-next` use `next/dynamic`,
  and that is the only thing keeping antd, react-query, and lucide out of the visitor bundle.
- Don't add `setKey` to `PalimpClientBackendAdapter`. It is commented out at
  [PalimpClientBackendAdapter.ts:10](libs/core/src/PalimpClientBackendAdapter.ts) deliberately —
  the Save button is all-or-nothing and a per-key write would allow partial commits.
- Don't rename `XcoreClientComponent` or drop the `palimp as xcore` alias casually. They are
  leftovers from a previous project identity, but both are exported, so removing them is a
  breaking change and wants its own commit.
- Don't rewrite `docs/plans/*.md`. They are historical records of design decisions, kept as
  written. New plans go in as new files.
