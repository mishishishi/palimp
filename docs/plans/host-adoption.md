# Adopting palimp in a real host — nano-pro-web

**Status:** proposed, nothing built · **Date:** 2026-08-18

The first host that is not an example. `nano-pro-web` (local repo, Next 16.2, React 19.2, App
Router, `en`/`cs`) has palimp on its roadmap as phase 15 and has already read this codebase once:
its [ADR 006](../../../nano-pro-web/agent-guidelines/decisions/006-content-storage.md) concluded
palimp is a flat key→string store that cannot model its Projects collection, and parked the rest.
This plan covers what has to change **here** so that phase 15 is a wiring job rather than a
redesign, plus the host-side steps it depends on.

Scope: copy editing only. **Collections stay out** — ADR 006 rejected modelling a Project as a
bundle of flat keys, that reasoning still holds, and OQ-13 already chose developer-assisted
publishing for launch. Nothing below moves palimp toward entities.

## What is already true

Worth stating so it isn't re-derived. Checked against the tree, not from memory.

- The adapter seam works. `be-firebase` landed touching zero files in `core`.
- Visitor bundles stay clean: `EditComponent` and `Devtools` are behind `next/dynamic`
  ([ClientComponent.tsx:7](../../libs/fe-next/src/ClientComponent.tsx#L7),
  [PalimpProvider.tsx:7](../../libs/fe-next/src/PalimpProvider.tsx#L7)) and both backend SDKs are
  dynamically imported inside `ensureX()`.
- The visitor branch of `p()` renders a bare fragment — no wrapper element, no layout cost.
- The host already has a verified static-export build (`pnpm build:pages`) exercised on every push
  to `main`. The premise this library is built on is available there; it is gated behind an env var
  pending its OQ-5.

Five things stand between that and a usable phase 15.

---

## A. Locale-prefixed keys — host-side convention, no library change

`Message` is `{ key, value }` with no locale field. The host prefixes:
`cs.pages.home.hero.lead`. This is what ADR 006/007 already anticipated ("phase 15 prefixes rather
than restructures"), and the host's dictionary keys are flat, dot-separated and locale-free by
convention precisely so the prefix is mechanical.

**Decision: prefix, do not add a locale field to `Message`.** A locale field would push locale
awareness into `PalimpServerBackendAdapter`, both backends, `getKey`/`setKeys`, and the editor's
query keys — for one host whose need is satisfied by string concatenation. Revisit only if a second
host wants side-by-side locale editing, which prefixing genuinely cannot do.

The consequence to accept: `loadMessages()` returns **every locale's rows on every page render**.
At the host's scale (~1700 lines of dictionary across two locales, a handful of pages, build-time
only) that is fine. It is the same trade already documented in
[architecture.md](../architecture.md#palimpserverbackendadapter--bulk-load-for-the-build); this just
doubles it.

**Ship instead:** a `defaultMessage`-first integration shape, documented rather than coded. The host
keeps `src/content/i18n/{en,cs}.ts` as typed source of truth and passes the dictionary value through:

```tsx
{p(`${locale}.pages.home.hero.lead`, { defaultMessage: dict.pages.home.hero.lead })}
```

Palimp rows become *overrides*, not storage. The `Dictionary` type gate that fails the build when
`cs.ts` misses a key survives untouched, an empty database changes nothing, and the host can back
out by deleting `p()` calls. This is the single most important thing to get right and it costs no
library code — but it must be written down, because the obvious alternative (migrate the dictionary
into the database) throws away the type gate and is irreversible.

---

## B. `asString` — one function, two return types

**Why.** `p()` returns JSX, so it can never supply `metadata.title`, `metadata.description`, `alt`,
`aria-label`, or any prop typed `string`. ADR 006 recorded this as permanent: *"the dictionary is
permanently the source of truth for non-body strings."* It does not have to be.

**Decision: an option on `p()`, not a second `s()` function.**

```tsx
p("some.key", { defaultMessage: "Some text", asString: true }); // string
p("some.key", { defaultMessage: "Some text" });                  // ReactNode
```

One function, one import, one key namespace, and the call site keeps reading the same. The cost is
a return type that depends on an argument, which TypeScript handles with call-signature overloads —
`p` is typed as an interface rather than inferred:

```tsx
interface P {
  (key: string, options: { defaultMessage?: string; asString: true }): string;
  (key: string, options?: { defaultMessage?: string; asString?: false }): ReactNode;
}
```

The implementation stays the six lines it always was — extract the existing fallback chain into a
named `resolve`, return the string when the flag is set and `<XcoreClientComponent>` otherwise. Zero
files in `core`. No new contract.

**The one gotcha to expect:** `asString` must be a literal `true`. Passing a computed boolean
(`asString: someCondition`) matches neither overload cleanly and produces either an error or the
wrong branch. Acceptable — there is no real use for a runtime-varying flag here — but it belongs in
the README, because the failure reads as a type error about an unrelated overload.

**Two behaviours it creates, which are the real work:**

1. **An `asString` key renders no editor**, because there is no element to put one in. §B2 is the
   answer, and it is why that section exists rather than a "documented limitation" note.
2. **`asString` values change only on publish**, including for the admin, because they are resolved
   at build time and never re-read client-side. `p()` updates immediately. Document the asymmetry;
   it is inherent to the static-export premise, not fixable here.

**One ordering hazard to fix while in there.** `setBackendAdapter()` is a module singleton assigned
at the top of `layout.tsx`. Next does not guarantee a layout module is evaluated before a page's
`generateMetadata`. Nothing calls the backend from metadata today, so it never bites; `asString` in
`generateMetadata` makes it reachable, and the failure is a null-adapter throw on a cold module
graph. Two mitigations, both wanted:

- Document that `setBackendAdapter()` belongs in a **shared module imported by both** the layout and
  any page reading metadata, not in the layout body. Update
  [examples/supabase-next/app/layout.tsx](../../examples/supabase-next/app/layout.tsx) to match.
- Throw a named error from `palimp()` when `backend` is unset — today it is `null!` and fails with
  `Cannot read properties of undefined (reading 'loadMessages')`.

**And dedupe the read.** `generateMetadata` plus the page body is two `loadMessages()` calls per
page. Wrap the load in React `cache()` so they share one. Small, and it caps the cost of §A's
whole-table read at once per render.

---

## B2. `PalimpFields` — editing keys that are not on the page

**Why.** An `asString` key is invisible: no element, no editor, editable only by someone who knows
it exists. SEO metadata is the motivating case and it is the one the client most needs to edit.

**The shape — `fieldsStore` mirroring `editsStore`.** The insight that keeps this small: the save
path needs no changes at all. `editsStore` is a module singleton
([editsStore.ts](../../libs/core/src/Admin/editsStore.ts)), so an `EditComponent` rendered inside a
modal feeds the same pending map, the same badge count, and the same `setKeys` batch as one rendered
inline. This is a **placement** feature, not a second editor.

Three pieces:

1. **`fieldsStore`** (`libs/core/src/Admin/fieldsStore.ts`) — a `Map` + listener `Set` + cached
   snapshot, read through `useSyncExternalStore`. A near-copy of `editsStore`; follow its structure,
   including the cached-snapshot reason.
2. **`PalimpFields`** — a client component the host renders anywhere in the page. It registers its
   declared fields on mount, unregisters on unmount, and **renders `null`**. Nothing is added to
   page layout, and visitors get nothing. Exported from `@palimp/core/admin` and re-exported through
   `fe-next` behind `next/dynamic`, the same way `XcoreClientComponent` and `Devtools` already are —
   so no host ever statically imports `@palimp/core/admin`.
3. **A Devtools modal** — a button in the drawer opens it, and it renders one `EditComponent` per
   registered field with its label. A modal rather than a drawer section because the drawer is
   192px wide ([Devtools/index.tsx:29](../../libs/core/src/Admin/Devtools/index.tsx#L29)). Follow
   `PublishStatusModal` for the pattern.

Registration is **explicit**, declared by the host:

```tsx
<PalimpFields
  group="SEO"
  fields={[
    { key: `${locale}.pages.home.title`, label: "Page title", defaultMessage: dict.pages.home.title },
    { key: `${locale}.pages.home.description`, label: "Meta description", defaultMessage: dict.pages.home.description },
  ]}
/>
```

The intended host pattern is one array per page, defined in a module, consumed twice: mapped through
`p(..., { asString: true })` inside `generateMetadata`, and passed whole to `<PalimpFields>` in the
page body. One declaration, both consumers, no way for them to drift.

**Rejected: auto-registration from `asString` calls.** A per-render registry inside `palimp()`'s
closure looks obvious and does not work. `generateMetadata` and the page body each call `palimp()`
and get **separate closures**, so the metadata keys — the entire motivating case — would never
appear in the page's registry. Ordering makes it worse: RSC gives no guarantee that a `<PalimpFields>`
placed last renders after the `asString` calls above it. Explicit declaration is predictable, typed,
and costs the host one array it already needs.

**Open in implementation:** whether `PalimpFields` should also accept keys that *are* on the page,
as a way to edit a long body without hunting for it. Cheap to allow — the same key in both places
just means two `EditComponent`s bound to one `editsStore` entry, which already works — but confirm
that the two stay in sync visually before promising it.

---

## C. Hydration cost — measure before adopting, do not optimise blind

Every `p()` is a client component. The string ships twice — once as HTML, once as `staleValue` in
the RSC flight payload — and one component hydrates per string. On a page with 200 strings that is
200 hydrated components and the page's entire copy duplicated in the payload. Against the host's
NFR-2 this is a real number and nobody has measured it.

**No library change proposed.** Two optimisations exist and both are premature:

- Have `p()` return a plain string for visitors and only wrap for admins. Impossible as stated —
  admin-ness is known on the client, after the server has already rendered.
- A build-time flag that compiles `p()` down to text when editing is off. Real, and a much larger
  feature than anything else here.

**Instead, the host adopts one band and measures.** Convert `/technology`'s hero only, run
`pnpm measure`, compare. That number decides scope for the rest of phase 15 — per-region, as ADR 006
already said. Record it in this file as a divergence note when known.

---

## D. Distribution — tarballs

Nothing is published, `libs/*/dist` is gitignored, and `@palimp/fe-next`, both backends and
`publish-github` all declare `"@palimp/core": "workspace:*"` as a **peer** dependency. That last
detail decides the approach: `workspace:*` does not resolve outside this monorepo, and only
`pnpm pack`/`publish` rewrites it to a real version.

**Decision: `pnpm pack` tarballs, committed to the host.**

```
nano-pro-web/vendor/palimp-core-1.0.0.tgz
                    palimp-fe-next-1.0.0.tgz
                    palimp-be-supabase-1.0.0.tgz      (or be-firebase)
                    palimp-publish-github-1.0.0.tgz
```

`"@palimp/core": "file:./vendor/palimp-core-1.0.0.tgz"`. Reproducible, CI needs no access to this
repo, the lockfile pins content hashes, and the peer protocol is rewritten by `pack` itself.

### The script — `scripts/pack.mjs`, run as `pnpm pack:all`

Not a one-liner, because three things fail silently if skipped. Bare `node`, no dependencies, Node
26 strips types so it can import from `libs/` if it ever needs to.

```sh
pnpm pack:all                          # → ./dist-packages/
pnpm pack:all --out ../nano-pro-web/vendor
```

What it does, in order:

1. **`pnpm build` first, always.** `libs/*/dist` is gitignored, and packing a stale or absent `dist`
   produces a tarball that installs and then fails at import with a module-not-found the host will
   blame on itself. Do not make this a flag.
2. **Pack the four consumable packages** — `core`, `fe-next`, one or both backends,
   `publish-github` — via `pnpm pack --pack-destination <out>` per package. `files: ["dist"]` is
   already set everywhere, so nothing else ships.
3. **Assert the `workspace:*` rewrite happened.** Read each tarball's `package.json` back out and
   fail if any dependency or peerDependency still carries `workspace:`. This is the single failure
   this whole approach exists to avoid — `@palimp/core` is a `workspace:*` **peer** of four
   packages, and it does not resolve outside this monorepo. `pnpm pack` rewrites it; assert it
   rather than trusting it, because the symptom otherwise appears in the host's install log, not
   here.
4. **Assert every `@palimp/*` version referenced across the four tarballs matches what was packed.**
   A host that installs a `fe-next` peer-depending on a `core` version it does not have gets a
   confusing peer warning and a runtime type mismatch.
5. **Print the four filenames and their versions**, so the copy-paste into the host's
   `package.json` is mechanical.
6. **Exit non-zero on any assertion**, and on packing zero packages. Same standing rule the host's
   own `pages-shim.mjs` follows: a script whose job is invisible must count what it did.

Plus a README section on consuming palimp outside the monorepo, covering the tarball flow and the
`link:` dev override.

**Rejected:** `link:` — machine-specific path, breaks CI, and hits the `workspace:*` peer failure.
Keep it as a documented dev-only override for iterating on palimp against the host, nothing more.
**Deferred:** a private registry. Right answer once a second host exists.

---

## E. Sharp edges that block a client, not a developer

Phase 15 hands this to a non-technical client. Three of the documented sharp edges stop being
acceptable at that point, in priority order:

1. **The stale-session hang.** A cookie or `localStorage` flag outliving its session makes the
   drawer spin forever, with the error only in `console.error`
   ([architecture.md](../architecture.md#sessions-and-false-positives)). The client has no console
   and no way out. **Fix: surface the failure.** When `getUser()` rejects, render an error state with
   a "sign in again" action that clears the session hint and calls `reset()`. The Firebase adapter
   already clears its flag when `getUser()` finds no user; the Supabase cookie sniff needs the
   equivalent.
2. **Silent no-op without a publish provider.** `PalimpPublishContext` holds `null` under a
   non-nullable type, so with a `publishToken` and no provider mounted the button renders enabled
   and does nothing. **Fix: make the context nullable and disable the button** with a reason, the
   same way a missing token already does.
3. **The GitHub PAT in the browser.** Unchanged and, on a static host, unavoidable without a server.
   **Not fixed — documented.** Fine-grained, `actions: write`, one repo, rotated. Say it plainly to
   whoever holds the token.

Not blocking, leave alone: `XcoreClientComponent`'s name, the `xcore` alias, the shared query client
(the host uses no react-query of its own), the dead `<input>` branch.

---

## F. Host-side, for the record

Not this repo's work, listed because §A–§E are useless without it.

- **Answer OQ-5 for a static host.** Palimp's premise is "the deployed artifact is a build output and
  Publish re-runs the build." The host's export mode is built and CI-exercised but env-gated as a
  preview; it becomes the production build.
- **`redirects()` retires permanently** — `scripts/pages-shim.mjs`'s meta-refresh stubs stop being
  scaffolding and become the mechanism.
- **The deploy workflow declares `workflow_dispatch:`**, or the dispatch 404s.
- **Drop the `NEXT_PUBLIC_PREVIEW` gating** of `noindex` and `PreviewNotice`.
- **Fix the two absolute CSS asset paths at source** — the preview plan deferred this explicitly
  until OQ-5 lands.
- **Keys used by `highlight()` stay dictionary-owned** unless they move to `asString`. It takes a
  string and its throw-on-drift behaviour is deliberate (ADR 018).

---

## Settle these during implementation

Two things known now, deliberately not decided now, because both want the shape of the real change
in front of them. Neither blocks starting.

**1. Version the packages before the first tarball.** Four packages all sitting at `1.0.0` with no
changelog makes "which build is in the host?" unanswerable the moment the host reports a bug. This
plan changes `core`'s public surface (§B2) and `fe-next`'s (§B), so the first pack is the natural
moment — but the scheme is open: lockstep versions across all four (simple, honest about the fact
that they only ever ship together) or independent semver (accurate, more bookkeeping for a
four-package repo with one consumer). **Decide at §D, not before**, and record the choice here.

**2. `core` changes, and the seam does not protect it.** §B2 adds `fieldsStore`, `PalimpFields` and
a Devtools modal to `core`; §E changes the publish context and the Devtools error path. That is
expected — the same result as `publish-status.md`, where a genuinely new capability moved the
contract. Adapters isolate *implementations*, not *features*. Worth stating up front so nobody
mid-implementation reads a `core` edit as evidence the design is leaking, and reaches for an
adapter-shaped workaround. The load-bearing claim is narrower and still holds: **adding a backend**
touches zero files in `core`. Nothing here weakens it.

---

## Verification

1. `pnpm check-types` and `pnpm build` clean — the standing gate.
2. `p(key, { asString: true })` returns the stored value, then `defaultMessage`, then the key,
   matching the JSX branch exactly. Verify against a key with a row, a key with only a default, and
   a key with neither — and that the JSX branch is unchanged for all three.
3. Both overloads infer correctly at the call site: `asString: true` yields `string`,
   omitted yields `ReactNode`, and neither needs an annotation.
4. `asString` called from `generateMetadata` in an example, with `setBackendAdapter()` moved to a
   shared module — confirm the emitted `<title>` carries the stored value, on a cold build.
5. `loadMessages()` runs **once** per page render with both `generateMetadata` and the body calling
   in. Count the calls; don't infer it.
6. `PalimpFields` renders nothing for a visitor — check the DOM and the RSC payload, not just the
   screen — and adds no `@palimp/core/admin` code to the visitor bundle.
7. Edit a field in the modal: the drawer badge counts it, Save writes it in the same batch as an
   inline edit, and a failed save keeps it pending.
8. Unmount a `PalimpFields` (navigate away) and confirm its fields leave the modal while any
   pending edit for those keys survives in `editsStore`.
9. Kill a session server-side, reload with the cookie/flag intact: the drawer shows an error and a
   working recovery action, not a spinner.
10. Mount `PalimpProvider` with a `publishToken` and no publish provider: the button is disabled
    with a reason.
11. `pnpm pack:all`, install the tarballs into a scratch Next app outside this monorepo, confirm
    install resolves — the check that the `workspace:*` peer rewrite actually happened. Then break
    it on purpose (hand-edit a tarball's `package.json` back to `workspace:*`) and confirm the
    script's assertion catches it.
12. Host-side, once one band is converted: `pnpm measure` before and after, number recorded here.

## Files expected to change

- `libs/fe-next/src/palimp.tsx` — the `asString` overloads, the `cache()` wrap, the named
  unset-adapter error
- `libs/fe-next/src/index.ts` + a new `PalimpFields.tsx` — the `next/dynamic` re-export
- `libs/core/src/Admin/fieldsStore.ts` — new, mirroring `editsStore`
- `libs/core/src/Admin/PalimpFields.tsx` + `Admin/index.ts` — new, registers and renders `null`
- `libs/core/src/Admin/Devtools/*` — the fields modal and its drawer button; the `getUser()` error
  state and recovery
- `libs/core/src/PalimpPublishContext.ts` — nullable publish context, publish button reason
- `libs/be-supabase/src/client.ts` — clear the session hint when `getUser()` finds no user
- `scripts/pack.mjs` + root `package.json` — new, `pack:all`
- `libs/fe-next/README.md`, `libs/core/README.md` — `asString` and its two asymmetries,
  `PalimpFields`, consuming outside the monorepo
- `docs/architecture.md` — `asString` and `PalimpFields` in the contracts and render sections;
  strike the two fixed sharp edges
