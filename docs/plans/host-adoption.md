# Adopting palimp in a real host — nano-pro-web

**Status:** proposed · **Date:** 2026-08-18 · §D, §B and §E items 1–2 landed 2026-08-18; A, B2, C
and §E item 3 unbuilt — see the divergence notes for
[§D](#divergence-note--d-as-built-2026-08-18), [§B](#divergence-note--b-as-built-2026-08-18) and
[§E](#divergence-note--e-items-1-and-2-as-built-2026-08-18). Body kept as written.

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

---

## Divergence note — §D as built, 2026-08-18

§D landed first, as the only section blocking the host. Sections A, B, B2, C and E remain
unbuilt; nothing below applies to them.

**Versioning: lockstep, as recommended in "Settle these during implementation" item 1.** All five
packages carry one version and ship together. `pack:all` does not merely follow the convention, it
enforces it — a set whose versions have drifted fails *before* the build, so the slip costs a
second rather than a minute. Independent semver stays available if a second consumer ever makes
the bookkeeping worth it. Versions stayed at `1.0.0`: §D changes no public surface, and the bump
belongs to the commit that lands §B.

Lockstep leaves a gap the plan named but did not close — the same version gets packed from
different commits while pre-1.0, so the version alone still does not answer "which build is in the
host?". Each run therefore writes **`palimp-manifest.json`** beside the tarballs, recording the
version, commit and whether the tree was dirty. Committed alongside the tarballs, it answers the
question. Not in the plan; added because the plan's stated reason for versioning at all was that
question.

**Five packages, not four.** The plan says "one or both backends". The script packs everything
under `libs/` unconditionally and the host takes what it needs — a `--backend` flag would be
configuration standing in for a copy-paste choice the host makes anyway.

**One flag the plan did not have: `--verify-only <dir>`.** The plan's verification step 11 asks to
hand-edit a tarball back to `workspace:*` and confirm the assertion catches it. That is not
runnable as written — every invocation repacks over the tampered file. `--verify-only` runs the
assertions against tarballs already on disk, which makes step 11 executable and, incidentally, lets
a host verify a `vendor/` directory it did not produce.

**`link:` fails later than expected, and the plan's stated reason is wrong.** The plan rejects
`link:` partly because it "hits the `workspace:*` peer failure". It does not: `pnpm install`
succeeds with no warning. The failure is at import — a symlinked package resolves its own peers
(`next`, `react`, `@palimp/core`) from *this* repo's `node_modules`, where `next` exists only under
`examples/`. Verified: `ERR_MODULE_NOT_FOUND` for `next/dynamic` inside `libs/fe-next/`. The
conclusion holds and the README documents it, but as an import-time trap rather than an install-time
one — which matters, because an install that succeeds is the more expensive kind of wrong. The
replacement dev loop is re-running `pack:all --out ../host/vendor` and `pnpm install`; the filename
is unchanged but the content hash is not, so pnpm picks it up (verified).

**One assertion beyond the plan's six:** every target in each packed `exports` map must exist in
the tarball. The plan's build-first rule exists to prevent a tarball that installs and then fails
at import; this is the check that would actually catch it, and it makes `pnpm build`'s
"`dist/` still matches its `exports` map" gate true of the shipped artifact rather than the tree.

**Verification run:** steps 1 and 11. `check-types` and `build` clean. The five tarballs installed
into a scratch Next 16 app outside the monorepo: install resolved with no peer warnings, the
lockfile pinned each by sha512, a file importing all four packages' entry points typechecked with
`skipLibCheck: false`, and a runtime `import()` across the tarball boundary resolved. Three
deliberate breaks each failed with the intended message and exit 1 — `workspace:*` restored by
hand, a `dist/` file deleted from a tarball, and one source `version` bumped out of lockstep.

---

## Divergence note — §B as built, 2026-08-18

§B landed second. Sections A, B2, C and E remain unbuilt; nothing below applies to them. Zero files
in `libs/core` changed, as the section predicted — the whole of §B is 30 lines of
[fe-next/src/palimp.tsx](../../libs/fe-next/src/palimp.tsx) plus the examples and the docs.

**Versions: 1.0.0 → 1.1.0 across all five packages**, in this commit, which is the thread §D left
open. Additive: `asString` is optional, both existing call shapes keep their existing types, and no
export was removed.

**The overloads are declared once, and the implementation is asserted into them.** The plan shows
an `interface P`; that is what shipped, as an exported `PalimpP`, so a host can type a helper that
takes `p` — the §B2 pattern of mapping one field array through `p` in `generateMetadata` wants a
name for it. What the plan does not mention is that an implementation whose body returns
`string | ReactNode` is **not assignable** to that interface: TypeScript checks the source against
*every* target signature, and `string | Element` does not satisfy the `: string` one. Two ways out
— repeat the signatures as overloads on a `function` declaration, or assert. Assertion, because the
overload-implementation gap is unchecked either way (neither form verifies that `asString: true`
really returns the string), and duplicating the signatures within twenty lines of the interface
would read as an accident. The assertion carries a comment saying exactly that.

**`asString` must be a literal `true` — confirmed, and the error is mildly better than the plan
feared.** `{ asString: someCondition }` produces TS2769 "No overload matches this call", which then
lists *both* overloads: `Type 'boolean' is not assignable to type 'true'` and, last and therefore
most visible, `… not assignable to type 'false'`. It does name the flag, so it is not unrelated;
what misleads is the final line, which reads as if `false` were the required value. Documented in
the README as the plan asked.

**The named error is a class, `PalimpBackendAdapterUnsetError`, exported.** The plan says "a named
error"; a class gives the name in the build log — `Error [PalimpBackendAdapterUnsetError]: …` —
and lets a host distinguish it from a backend failure. Its message states the fix rather than the
fact, since the fix is the non-obvious half.

**Registration moved further than "a shared module".** The plan asks for `setBackendAdapter()` in a
module imported by both the layout and any page reading metadata. A bare side-effect import is
still forgettable — the page that forgets it is exactly the page that broke. So the shared module
also **re-exports `palimp`**, and pages import `palimp` from `./palimp.ts` rather than from
`@palimp/fe-next`. Getting `p` at all now requires having run the registration. The layout keeps a
side-effect import of the same module. Both examples were updated and both grew a `generateMetadata`
using `asString`, which is what made verification items 4 and 5 runnable.

**Verification run: items 1–5, all five, no credentials needed.** `check-types` and `build` clean.
Items 2, 4 and 5 were run against a real `next build` of the Supabase example with a **stub server
adapter** — a counting `loadMessages()` returning two known rows. That exercises real RSC `cache()`,
real `generateMetadata` ordering and the real static export, and it needs no database, which the
plan assumed it would. Results:

- `<title>STORED TITLE FROM DB</title>` in `out/index.html` on a cold build — the stored row, via
  `asString` from `generateMetadata`.
- All three fallback cases in the string branch, in one build: stored row → the row; default only →
  the default (`meta.description`); neither → the key itself (`<meta name="keywords"
  content="meta.absent">`). The element branch resolved identically for the same page's keys.
- **`loadMessages()` ran exactly once** with both `generateMetadata` and the body calling in —
  `[stub] loadMessages call #1`, and nothing else. Counted, not inferred. Control: the same build
  with `cache()` stripped from `dist/` logged calls #1 *and* #2, so the dedupe is `cache()`'s doing
  and not an accident of the build.
- Item 3, both overloads inferring with no annotation, was checked by typechecking a throwaway file
  against the emitted `.d.ts` with `@ts-expect-error` on the two cases that must fail (a `string`
  annotation on the element branch, and a computed `asString`). Both errored; the positive cases
  did not. The file was deleted — there is no test harness here to keep it in.

The two behaviours §B creates are documented, not fixed: an `asString` key renders no editor (§B2),
and its value changes only on publish, including for the admin (inherent). Both are in
[fe-next's README](../../libs/fe-next/README.md#quirks) under Quirks, alongside the literal-`true`
gotcha.

**What was not verified:** anything touching a real Supabase or Firebase project. The stub adapter
covers the palimp side of items 2, 4 and 5 completely; what it cannot show is a real
`loadMessages()` round trip, which is unchanged by §B.

---

## Divergence note — §E items 1 and 2 as built, 2026-08-18

§E landed third, items 1 and 2 only. Item 3 — the GitHub PAT in the browser — is unchanged and
still documented rather than fixed, as the section says it should be. Sections A, B2 and C remain
unbuilt; nothing below applies to them.

**Versions: 1.1.0 → 1.2.0 across all five packages**, and the root README's `file:./vendor/…`
block with them. `core`'s public surface changed — `PalimpPublishContext` is now
`Context<PalimpPublishAdapter | null>` — so this is the standing convention working as intended
rather than a judgement call.

**Unlike §B, this touched `libs/core`, which "Settle these during implementation" item 2
pre-authorised.** Five files there, plus one in `be-supabase`. The load-bearing claim is untouched:
adding a *backend* still costs zero files in `core`.

### Item 1 — the stale-session hang

**No contract change, as the section hoped, and the reason is worth recording.** The recovery has
to clear the hint `hasSession()` reads, and `PalimpClientBackendAdapter` has no method for that —
but `logout()` clears it on both backends *and does so even when the session is already dead
server-side*, which is the part that needed checking rather than assuming. Firebase's `logout()`
calls `setSessionFlag(false)` unconditionally after `signOut()`. Supabase's delegates to
`supabase.auth.signOut()`, which — verified in `auth-js@2.108.2`'s `_signOut` — explicitly ignores
a 401, 403 or 404 from the server and calls `_removeSession()` anyway. So `logout()` + `ctx.reset()`
is the whole fix, and no adapter method was added.

**The recovery action clears the session; it cannot sign the client back in.** The plan calls it a
"sign in again" action. `core` does not know the login route — `fe-next` supplies navigation
through `LoginPage`'s `onLogin` prop, and hardcoding `/login` in `core` would 404 on any host that
put it elsewhere. So the button is labelled **Sign out**, and the alert and a success notification
say to sign in again from the login page. Honest about what the button does; the alternative was a
label that promises a navigation `core` cannot perform.

**The error message is shown, not just the friendly sentence.** `DevtoolsSessionError` renders the
reason and the **Sign out** button first, then the raw `error.message` in small muted text at the
bottom. The client does not need it; whoever they call does, and this failure previously existed
only in a console they were never going to open.

**A failed recovery stays visible.** `reset()` fires on `onSuccess`, not `onSettled` — if
`logout()` itself fails, its message renders and the drawer stays put. Resetting regardless would
re-arm `hasSession()`, which would still be true, and loop straight back to the same error with
the reason for the loop hidden.

**Supabase's correction path skips retryable errors.** The plan asks for the Firebase equivalent —
clear the hint when `getUser()` finds no user. Supabase's version calls `signOut()`, because the
auth cookie is chunked (`sb-<ref>-auth-token`, `.0`, `.1`) and hand-deleting it is not reliable.
But `getUser()` also rejects when the browser is simply offline, and clearing on that would sign an
admin out for a dropped connection. The guard is `userError?.name !== "AuthRetryableFetchError"` —
a name check rather than an `isAuthRetryableFetchError` import, so no SDK code enters the bundle
for it. Firebase needs no such guard: its check is `auth.currentUser` after `authStateReady()`,
which is local.

**One thing deliberately not changed: the react-query retry default.** A dead session now fails
three retries (~7s) before the error state appears, so there is still a spinner — bounded, and
ending in something actionable. Cutting `retry` for this query would surface a genuine network
blip as an expired session, which is a worse trade.

### Item 2 — silent no-op without a publish provider

Straightforward and as specified. `usePublishButton`'s hardcoded `available: true` became
`available: !!adapter`, the label chain in `DevtoolsContent` gained **"No publish provider"** ahead
of "Missing publish token", and the button's `disabled` gained `!publish.available`.

**`usePublishRun` uses `skipToken`, not `enabled`.** The section asks that the `adapter!` assertion
stop being an assertion. `enabled: !!adapter` cannot do that — it stops the query at runtime but
narrows nothing, so the `queryFn` still needs the `!`. `queryFn: adapter && token ? () =>
adapter.getLatestRun(token) : skipToken` narrows both consts inside the closure, so both `!`s are
gone rather than relocated. `enabled` was dropped; `skipToken` covers it.

### Verification — what was and was not run

**Run and clean: the standing gate.** `pnpm check-types` and `pnpm build`, both green. The emitted
`libs/core/dist/PalimpPublishContext.d.ts` was read back to confirm the nullable type reached the
public surface rather than only the source, and `usePublishRun.ts` was grepped for surviving `!`
assertions — none.

**Not run: verification items 9 and 10.** Both need a real signed-in admin session against a real
Supabase or Firebase project, and no credentials were available. §B's trick does not transfer:
that was verified with a stub *server* adapter under `next build`, and §E is entirely client-side
admin UI that no static build reaches. So the behaviour of both fixes at runtime is **unverified**:

- item 9 — kill a session server-side, reload with the cookie or flag intact, confirm the drawer
  shows the error state and that **Sign out** actually returns the page to a usable visitor view
  rather than looping;
- item 10 — mount `PalimpProvider` with a `publishToken` and no publish provider, confirm the
  button is disabled and reads "No publish provider".

What *is* established without credentials: the code typechecks and builds, the nullable context is
real in the emitted surface, and the `logout()`-clears-a-dead-session claim item 1 rests on was
checked against the installed `auth-js` source rather than assumed. What is not: that the rendered
drawer looks right at 192px, and that the recovery round trip actually terminates.
