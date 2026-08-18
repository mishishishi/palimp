# Phase 15 — Palimp integration

> **This file does not belong to palimp.** It is written in `nano-pro-web`'s phase-file format and
> is destined for `agent-guidelines/phases/phase-15-palimp.md` in that repo — parked here until
> whoever owns that project moves it. Its links are relative to **that** location, not this one, so
> they do not resolve from here. Nothing in palimp reads it; the palimp-side companion is
> [host-adoption.md](host-adoption.md).

**Status:** PLANNED · **Depends on:** phase 14 (cs copy) · palimp's `docs/plans/host-adoption.md`
§B, §B2, §D landed · **Requirements:** FR-13, NFR-2

## Settled by the user, 2026-08-18

| Question | Answer | Consequence |
|---|---|---|
| How does a locale-less `Message` carry `en`/`cs`? | **Prefix the key** — `cs.pages.home.hero.lead` | As [ADR 007](../decisions/007-dictionary-shape.md) anticipated. No palimp change. `loadMessages()` returns both locales on every render; fine at build time |
| Dictionary or database as source of truth? | **Dictionary stays** — palimp rows are *overrides*, passed in as `defaultMessage` | The `Dictionary` type gate that fails the build on a missing `cs` key survives. An empty database changes nothing. Backing out means deleting `p()` calls |

## Goal

The client edits converted strings on the live preview site and publishes a rebuild, unaided.
FR-13 moves from DRAFT to met **for the copy that has been converted** — deliberately not all of it.

**FR-4 and NFR-7 are untouched.** palimp still cannot model a collection
([ADR 006](../decisions/006-content-storage.md)); Projects remain PR-authored per OQ-13. Say this to
the client rather than letting them infer that "editable" covers Projects.

## Context to read

- palimp repo (`~/repositories/palimp`): `docs/plans/host-adoption.md` — **the companion plan; read
  first** · `docs/architecture.md` · `docs/setup.md` · `libs/fe-next/README.md`
- Here: [ADR 006](../decisions/006-content-storage.md) · [ADR 007](../decisions/007-dictionary-shape.md)
  · [ADR 010](../decisions/010-first-client-boundary.md) · [conventions.md](../conventions.md) ·
  [preview-github-pages.md](preview-github-pages.md) · [next16-notes.md](../next16-notes.md)

## Out of scope

- **Projects and every other entity** — ADR 006, OQ-13. Not revisited here.
- **OQ-5 / production hosting** — phase 17. See below; it does not block this phase.
- **Translating** — phase 14 owns `cs`.
- **Converting every string** — step 7's measurement decides scope, per-region.

## OQ-5 does not block this phase

`preview.yml` already declares `workflow_dispatch:`, and `pnpm build:pages` is a verified static
export exercised on every push to `main`. So palimp's premise — *the deployed artifact is a build
output and Publish re-runs the build* — is already true of the preview. The client gets the whole
loop against `nano-pro-web-preview`. OQ-5 later decides which workflow the button targets; that is
one env var.

Two consequences to state plainly: the preview repo is **public**, so every edit is browsable on
github.com; and a published edit takes a full CI build to appear.

---

## Steps

### 15a — the loop, one region

1. **Stand up a backend.** Supabase or Firebase (see Decisions). Follow palimp's `docs/setup.md`
   end to end: tables/collections, RLS or security rules, editor account, **and the profile
   row** — a missing profile is the documented cause of a drawer that spins forever. Credentials
   into `.env.local`; nothing committed.

2. **Vendor palimp.** In the palimp repo: `pnpm pack:all --out ../nano-pro-web/vendor`. Add four
   `file:./vendor/*.tgz` dependencies. **Blocked on host-adoption §D** — a plain `pnpm link` fails,
   because `@palimp/core` is a `workspace:*` *peer* of the other three and that protocol does not
   resolve outside palimp's monorepo. Only `pnpm pack` rewrites it.

3. **`src/lib/palimp.ts` — the seam.** One module, imported by both the layout and any page using
   palimp. It holds:
   - `setBackendAdapter(...)` at module top level. **Not in the layout body**: Next does not
     guarantee a layout module evaluates before a page's `generateMetadata`, and step 10 calls the
     backend from there.
   - a wrapper binding the locale prefix, so `<locale>.` is spelled **once** — same rule as `href()`
     for paths. Take `locale` as an argument; do not write `"en"`/`"cs"` literals here, or
     `verify.mjs`'s locale-literal gate fires.

4. **Mount the providers** in `src/app/[locale]/layout.tsx`: backend provider → publish provider →
   `PalimpProvider`. All three are client components imported by a server file, which needs no
   `'use client'` in `src/` — [ADR 010](../decisions/010-first-client-boundary.md)'s list and the
   `verify.mjs` gate are untouched. **Confirm that with `pnpm gates` rather than assuming it.**

5. **`/login`.** A route outside `[locale]` rendering palimp's `LoginPage`. It statically imports
   `@palimp/core/admin`, so antd lands in that route's bundle — acceptable, it is one page nobody
   but the editor opens, but do not import that module anywhere else. Needs `robots: noindex`, and
   under export it emits `/login/index.html` (`trailingSlash: true` already). See Decisions on
   whether it enters `ROUTES`.

6. **Convert one band** — `/technology`'s hero, the signed-off page's most visible copy. Every call
   passes the dictionary value through:
   `p(key, { defaultMessage: dict.pages.technology.hero.lead })`. Keys stay exactly the dictionary's
   dot-path, prefixed. **Do not convert a claim that `highlight()` splits** — it takes a `string`,
   `p()` returns JSX, and its throw-on-drift is deliberate ([ADR 018](../decisions/018-page-copy-shape.md)).

7. **Measure — this is the point of 15a.** `pnpm measure` before and after. Every converted string
   becomes a client component: the text ships twice (HTML plus the RSC payload's `staleValue` prop)
   and one component hydrates per string. The visitor branch renders a bare fragment, so there is no
   extra DOM and no layout cost — the cost is payload and hydration, against NFR-2. **Record the
   number in this file.** It decides 15b's scope; ADR 006 already said adopt per-region.

8. **Wire Publish.** `NEXT_PUBLIC_GITHUB_WORKFLOW=preview.yml`, plus owner and repo. Fine-grained
   PAT, **Actions: read and write, that one repo, nothing else**, stored on the editor's profile
   row. It reaches the browser by design — that scope is the mitigation, and it is why it is not the
   same token as `PAGES_DEPLOY_TOKEN`.

9. **CI.** `loadMessages()` now runs at build, so `preview.yml` needs the backend credentials as
   repository secrets. Without them the build fails at the first `p()`, not at a config check.

**Split here.** 15a is a session. Stop, show the client, take the measurement.

### 15b — metadata and scope

10. **`<PalimpFields>` for SEO** (blocked on host-adoption §B2). Per page, one array of
    `{ key, label, defaultMessage }` defined in a module and consumed **twice**: mapped through
    `p(key, { asString: true })` inside `generateMetadata`, and passed whole to `<PalimpFields>` in
    the page body. One declaration, two consumers, no drift. The component renders `null` and
    registers into the Devtools modal, so page layout is untouched.
    Expect one surprise worth telling the client: **metadata edits appear only after Publish**, even
    to the admin, because they resolve at build time. Body copy updates immediately.

11. **Convert the rest, to the budget step 7 set.** Per region, highest-value first. Anything
    `highlight()` touches, and anything typed `string`, goes through `asString` + `PalimpFields` or
    stays dictionary-only.

12. **Write it down.** A new ADR for the adoption shape (overrides-not-storage, prefixing, the
    per-region rule and its measured number); a consequences update on ADR 006; FR-13's status in
    `requirements.md`.

## Files touched

Create: `src/lib/palimp.ts` · `src/app/login/page.tsx` · `vendor/*.tgz` ·
`agent-guidelines/decisions/0NN-palimp-adoption.md` (15b)
Edit: `package.json` · `src/app/[locale]/layout.tsx` · `src/app/[locale]/technology/page.tsx` ·
`.github/workflows/preview.yml` · `.env.local` (untracked) · `requirements.md` · `roadmap.md` ·
`sessions/LOG.md`

## Decisions to make

| | |
|---|---|
| **Supabase or Firebase** | Both adapters are complete. Supabase is the older and better-exercised one; Firebase is the cleaner code. Postgres RLS vs Firestore rules is the real difference. **Needs the user** — it is an ongoing service and a bill |
| **Does `/login` enter `ROUTES`?** | It is not site content and has no `cs` variant. Leaving it out means one path spelled outside the registry, which `verify.mjs`'s raw-path gate may catch. Resolve against [conventions.md](../conventions.md) before writing the route |
| **One editor account or several** | Palimp has no authorization beyond "is signed in" — any signed-in user can write any key, and each account needs its own profile row and PAT |
| **How much of `/technology` in 15a** | Hero only is the honest minimum for a measurement. More is scope creep before the number exists |

## Open questions

- **OQ-5** — unchanged and still phase 17's. Recorded here only because this phase makes the static
  export do real work for the first time, which is evidence for it, not an answer to it.
- **Who holds the publish PAT**, and what happens when it expires — the button fails loudly, but
  only the token's owner can rotate it. Mirror into `roadmap.md` if it needs the user.

## Done when

- [ ] `pnpm verify` green (gates + lint + build) — including `pnpm gates` confirming no new
      `'use client'` entered `src/`
- [ ] `pnpm build:pages` green, and the converted band renders its stored values in `out/`
- [ ] Signed out: `/technology` is byte-identical in structure to before, no editor markup, no
      antd or react-query in the page bundle
- [ ] Signed in: the band is editable, the drawer counts pending edits, Save persists, reload
      survives
- [ ] Publish dispatches `preview.yml`, the drawer follows the run to a conclusion, and the live
      preview shows the edit afterwards
- [ ] A stale session does **not** hang the drawer (host-adoption §E) — if it still does, that is a
      palimp bug, not a wiring one; report it there
- [ ] `pnpm measure` delta recorded in this file
- [ ] `roadmap.md` updated, `sessions/LOG.md` appended (≤8 lines)
