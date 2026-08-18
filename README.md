# Palimp

Inline content editing for Next.js. Wrap a string in `p()` and it stays plain text for visitors —
but a signed-in admin sees an input in exactly the same place, edits it where it sits, saves the
batch from a drawer, and hits Publish to rebuild the site.

```tsx
export default async function Page() {
  const { p } = await palimp();

  return <h1>{p("hero.title", { defaultMessage: "Bananas grown slowly." })}</h1>;
}
```

No CMS, no admin route, no second rendering path. The editable version of the page *is* the page.

## How it works

Message values live in your own database. On the server they are loaded in bulk and rendered as
ordinary text. In the browser, admins get an editor per string, a shared edit buffer, and a
Devtools drawer that commits the whole batch at once.

Where a string has to actually be a string — `metadata.title`, an `alt`, an `aria-label` —
`p(key, { asString: true })` returns one instead of an element. Same key namespace, same fallback
chain; the trade is that a key with no element on the page has no inline editor and only changes
on publish.

The examples build as static exports (`output: "export"`), so values are baked in at build time
and a save changes nothing for the public until the site is rebuilt. That is what Publish does:
dispatch the deploy workflow and follow the run. Admins see their edits immediately regardless,
because the editor re-reads each key live.

Everything backend-specific sits behind four interfaces. Swapping Supabase for Firebase is a
provider swap in your layout — [`@palimp/be-firebase`](libs/be-firebase/README.md) was added
without changing a line of `core`.

Full walkthrough with diagrams: **[docs/architecture.md](docs/architecture.md)**.

## Packages

| package | what it does |
| --- | --- |
| [`@palimp/core`](libs/core/README.md) | The four contracts, the three contexts, and the admin UI (`EditComponent`, Devtools drawer, login form, edit buffer). Backend- and framework-agnostic. |
| [`@palimp/fe-next`](libs/fe-next/README.md) | Next.js App Router binding: `palimp()` for server components, `setBackendAdapter()`, `PalimpProvider`, `LoginPage`. |
| [`@palimp/be-supabase`](libs/be-supabase/README.md) | Supabase Auth + Postgres. Includes the `inline` / `profiles` schema and RLS policies. |
| [`@palimp/be-firebase`](libs/be-firebase/README.md) | Firebase Auth + Firestore. Same shapes, different SDK. |
| [`@palimp/publish-github`](libs/publish-github/README.md) | Dispatches a GitHub Actions workflow and polls the run. Works with either backend. |

Pick one backend, optionally add the publish adapter, always take `core` + `fe-next`.

## Quickstart

> Not verified end to end — running either example needs real Supabase or Firebase credentials.
> The steps are derived from the adapter source and the working example wiring. Expect to debug
> the first login; [docs/setup.md](docs/setup.md) has a troubleshooting table for when you do.

**1. Install and build.** The examples resolve the libs through their `exports` maps, which point
at `dist/`, so the libs must be built before an example will run:

```sh
pnpm install
pnpm build
```

**2. Stand up a backend.** Two tables or collections either way, plus one user with a profile
row. **[docs/setup.md](docs/setup.md)** walks it click by click — creating the project, the SQL
or the security rules, the editor account, and the `.env.local` template for each track. Budget
half an hour.

**3. Run it.**

```sh
pnpm --filter @example/supabase-next dev     # or @example/firebase-next
```

Open `/` — plain text. Open `/login`, sign in, and you land back on `/` with every string now an
input and a drawer handle on the left edge. Type, hit Save, reload: the value persists.

**4. Wire up Publish** when you want it — a fine-grained GitHub PAT with **Actions: Read and
write**, stored on the editor's profile row
([steps](docs/setup.md#publish-token-optional)). Until then the button reads "Missing publish
token" and everything else works. The token reaches the browser, which is a deliberate trade-off
worth understanding: [libs/publish-github/README.md](libs/publish-github/README.md#the-token).

### Adding Palimp to your own app

Nothing is published to npm, so `pnpm add @palimp/core` resolves to nothing. Build tarballs and
install those — see [consuming palimp outside the monorepo](#consuming-palimp-outside-the-monorepo)
below.

Once installed, copy [examples/supabase-next/app/palimp.ts](examples/supabase-next/app/palimp.ts)
and [app/layout.tsx](examples/supabase-next/app/layout.tsx) — together they are the whole
integration: one `setBackendAdapter()` call at module scope and three nested providers.
[libs/fe-next/README.md](libs/fe-next/README.md#usage) explains each step and the ordering
constraint.

## Consuming palimp outside the monorepo

`pnpm pack:all` builds every package and writes an installable tarball per package:

```sh
pnpm pack:all                               # → ./dist-packages/
pnpm pack:all --out ../your-app/vendor      # straight into the host
```

Commit the tarballs to the host and depend on them by path:

```json
{
  "dependencies": {
    "@palimp/core": "file:./vendor/palimp-core-1.3.0.tgz",
    "@palimp/fe-next": "file:./vendor/palimp-fe-next-1.3.0.tgz",
    "@palimp/be-supabase": "file:./vendor/palimp-be-supabase-1.3.0.tgz",
    "@palimp/publish-github": "file:./vendor/palimp-publish-github-1.3.0.tgz"
  }
}
```

Take `core` + `fe-next` + one backend; `publish-github` is optional. The script prints exactly
these lines so the copy-paste is mechanical. The host's lockfile pins each tarball by content
hash, and its CI needs no access to this repo.

**Why a script rather than `pnpm pack` five times.** `@palimp/core` is declared
`"workspace:*"` — as a **peer** dependency — by the other four packages, and `workspace:*` does not
resolve outside this monorepo. `pnpm pack` rewrites it to a real version on the way out. If it ever
stops doing so, the symptom shows up in the host's install log rather than here, so the script reads
every tarball back out and asserts it. It also builds first (`libs/*/dist` is gitignored, and a
tarball packed from an absent `dist` installs cleanly and then fails at import), checks that every
`exports` target actually shipped, and exits non-zero on any of it.

To check a `vendor/` directory the script did not just produce — a host's, or one from an older
build:

```sh
pnpm pack:all --verify-only --out ../your-app/vendor
```

**Versions are lockstep.** All five packages carry one version and ship together; `pack:all`
refuses to pack a set whose versions have drifted. Independent semver would be accurate bookkeeping
for a repo that never ships its packages independently. Bump every `libs/*/package.json` in one
commit when the public surface changes. Because the same version gets packed from different commits
while pre-1.0, each run also writes `palimp-manifest.json` next to the tarballs, recording the
commit and whether the tree was dirty — commit it alongside them and "which build is in the host?"
stays answerable.

**Iterating on palimp against a host:** re-run `pnpm pack:all --out ../your-app/vendor` and
`pnpm install` in the host. The filename does not change, but the content hash does, so pnpm picks
it up.

`link:` is not a working shortcut. It installs without complaint and then fails at import: a
symlinked package resolves its own peers — `next`, `react`, `@palimp/core` — from *this* repo's
`node_modules`, where `next` is only ever installed under `examples/`. The failure reads
`ERR_MODULE_NOT_FOUND` for `next/dynamic` inside `libs/fe-next/`, which points nowhere near the
cause.

## Repo layout

```
libs/
  core/            contracts + admin UI
  fe-next/         Next.js binding
  be-supabase/     Supabase adapter
  be-firebase/     Firebase adapter
  publish-github/  GitHub Actions publish adapter
examples/
  supabase-next/   static-exported demo, deploys to GitHub Pages
  firebase-next/   the same demo, deploys to Firebase Hosting
docs/
  architecture.md  how it fits together
  setup.md         credentials, schema, and first run
  plans/           historical design records — superseded, not current API
scripts/
  pack.mjs         pnpm pack:all — tarballs for hosts outside this monorepo
```

## Scripts

Run from the repo root; all three fan out across `libs/*` only.

| | |
| --- | --- |
| `pnpm build` | `tsc` each lib into `dist/`, in dependency order |
| `pnpm dev` | the same in parallel watch mode |
| `pnpm check-types` | `tsc --noEmit` across every lib |
| `pnpm pack:all` | build, then one installable tarball per package — [details](#consuming-palimp-outside-the-monorepo) |
| `pnpm test` | **exits 1** — there are no tests |

Examples build separately: `pnpm --filter @example/supabase-next build`. Build the libs first.

Node 26 (`.nvmrc`), pnpm 11.8.

## Status

Pre-1.0 and honest about it: no tests, no changelog, no published npm artifacts. `check-types` is
the only automated gate. Known rough edges — a stale session hanging the drawer, a leftover
`Xcore` name in the render path — are catalogued in
[docs/architecture.md](docs/architecture.md#sharp-edges) rather than hidden.

## Licence

[ISC](LICENSE) © Denis Homolík
