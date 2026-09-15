# Collections, phase 2 — live admin rendering

**Status:** proposed · **Date:** 2026-08-20 · **Branch:** `pr/08-collections`

Phase 1 ships with a cost that its own §H insists belongs at the front of this plan, so here it
is. **Adding an item with prose takes two publish cycles.** The owner adds the item in the modal
and Saves; nothing on the page changes, because the list is server-rendered. They Publish and wait
out a rebuild; the card appears — rendering its derived prose key as its body text, since the key
has no row. They type the body inline, Save again, Publish again, and wait out a second rebuild.
Two Publishes, two waits, and in between a live site showing `varieties.pisang-raja.body` to every
visitor. String edits have never worked this way: an admin sees a string edit the moment they type
it, because each editor re-reads its own key. Collections are the only palimp content an admin
cannot see before publishing.

Phase 2 closes that gap for the admin without changing anything for the visitor. A structural
change — add, remove, reorder, a fact edited in the modal — appears on the admin's page
immediately, drafts included; the fresh item's card arrives with its prose editor already inline,
so the body is typed *before* the first Save, and the whole thing lands in **one** Save and **one**
Publish. Visitors keep receiving the baked fragment the build produced, byte-for-byte the phase-1
output.

Scope is the [README](README.md)'s phase-2 list and nothing beside it: a list wrapper
(`<PalimpCollectionList>` in `fe-next`, its live half in `core/admin`), the client text primitive
host cards need (`PalimpText`), the formalized prose-key helper (`collectionItemKey`), and the
dogfood conversion in both examples. §G states what stays out — most sharply, that a new item's
*per-slug route* still needs a Publish, because no client wrapper can mint a static route.

The grounding exploration is [00-exploration.md](00-exploration.md) §E1; the phase map and
decision log are in [README.md](README.md). Every claim below was re-checked against the source on
this branch (phase 1 as it actually landed, divergence note included), not carried over from
earlier plans — and per the house precedent, the boundary shape was **built and measured** before
being proposed: the payload and bundle numbers in §E come from real static exports of a prototype,
and the type signature in §A was compiled under the real flags, both on 2026-08-20.

## The decisions this plan is built on

Three gates, answered 2026-08-20 in this planning session, before the rest of the file was
written. Recorded in the [decision log](README.md#decision-log); restated here with the reasoning
at full length, because two of the three were decided by measurement rather than by argument.

- **D6 — the RSC boundary: one client card, used on both sides.** The host writes its item
  renderer once, as a **client component**, and hands it to the wrapper by module reference; the
  same component renders the baked children (server-side, into the visitor's HTML) and the live
  admin map. The alternative — keep the baked side as plain server markup and pass the client card
  only for the live half — was prototyped and measured, and it loses on both axes at once: the
  flight payload grows instead of shrinking (+795 B vs −507 B on the dogfood, §E), because the
  baked markup serializes into the payload where the client card's props would not, **and** the
  card's chunk ships to visitors eagerly anyway, because a client-module reference in the payload
  pulls its chunk into the eager script set even when nothing renders it (measured, §E — this was
  the fact that decided the gate). Same bundle cost, worse payload, plus a second copy of the card
  for the host to keep in sync. One card wins on every count.
- **D7 — preview mode: the live list stays live, and needs no code to do it.** Preview's
  documented meaning is "how the page will look, not how it currently is"
  ([architecture.md](../../architecture.md#render-edit-save)) — and after the next Save-and-Publish
  the page will have the pending items, so an admin in preview sees the pending document mapped
  through the item component, prose rendered as text. No preview branch is added anywhere: the
  wrapper's gate is `admin`, untouched by `preview`, and the prose inside the cards is
  `EditComponent`, whose existing preview branch
  ([EditComponent.tsx:40-42](../../../libs/core/src/Admin/EditComponent.tsx#L40-L42)) renders
  `pending ?? data ?? staleValue ?? ""` as plain text. Preview correctness falls out of
  composition. The one wrinkle is recorded in §C: an untyped fresh prose key previews as *empty*,
  where the published page would render the key.
- **D8 — the wrapper registers the collection itself.** A page that renders
  `<PalimpCollectionList>` does not also render `<PalimpCollections>` for that collection: the
  live half registers into `collectionsStore` exactly the way the registrar does, and the store's
  existing dedup-by-resolved-key, first-registration-wins semantics
  ([collectionsStore.ts:29-45](../../../libs/core/src/Admin/collectionsStore.ts#L29-L45)) make a
  page that accidentally has both harmless. The measurement forced this decision too: the
  prototype, which kept the two components separate, shipped the `staleDocument` **twice** in the
  flight payload — once in the wrapper's props, once in the registration — and unlike the
  declaration, that copy grows with the content. The wrapper needs the declaration and the
  document anyway; registering them is free. `<PalimpCollections>` stays as-is for collections
  edited in the modal but not live-rendered on that page.

## What is already true

Re-verified against the tree — phase 1 as landed, divergence note included — while writing this.

- **Liveness has exactly one mechanism in palimp, and it is per-component re-reading.** An admin
  sees a string edit because `EditComponent` runs `useQuery(editQueryKey(key))` plus
  `useEdit(key)` and resolves `pending ?? data ?? staleValue ?? ""`
  ([EditComponent.tsx:28-36](../../../libs/core/src/Admin/EditComponent.tsx#L28-L36)). The
  collections *modal* already does the same one level up — the same query key, the same chain with
  `staleDocument` as the last link
  ([CollectionsModal.tsx:108-120](../../../libs/core/src/Admin/Devtools/CollectionsModal.tsx#L108-L120)).
  Phase 2 is that chain in a third place: on the page, above a list. Nothing new is invented; the
  mechanism is relocated.
- **The save path already refreshes anything on that chain.** `useSaveButton` drains the store,
  writes once, and invalidates `editQueryKey(key)` for every key it wrote
  ([useSaveButton.tsx:13-22](../../../libs/core/src/Admin/Devtools/useSaveButton.tsx#L13-L22)).
  A live list keyed the same way refreshes after a save with zero changes to the save path — the
  same free ride the modal got in phase 1.
- **The client half of registration is thin and admin-gated; the data rides the server half.**
  `<PalimpCollections>` resolves `{declaration, staleDocument}` on the server
  ([PalimpCollections.tsx:29-47](../../../libs/fe-next/src/PalimpCollections.tsx#L29-L47)), and
  its client half returns `null` for visitors before any dynamic import happens
  ([PalimpCollectionsClient.tsx:20-29](../../../libs/fe-next/src/PalimpCollectionsClient.tsx#L20-L29)).
  The wrapper copies this split exactly, with children in place of `null`.
- **The visitor-facing text primitive already exists; it just isn't reachable.**
  `XcoreClientComponent` — admin gate, `next/dynamic` into `EditComponent`, plain text for
  visitors ([ClientComponent.tsx:17-31](../../../libs/fe-next/src/ClientComponent.tsx#L17-L31)) —
  is exported from its module but not from `index.ts`, and the package `exports` map exposes only
  `.` and `./login` ([package.json:6-15](../../../libs/fe-next/package.json#L6-L15)). A host card
  cannot import it today. Its `staleValue` prop is required, which p() always satisfies by
  resolving first ([palimp.tsx:53-69](../../../libs/fe-next/src/palimp.tsx#L53-L69)); a live-mapped
  fresh item has nothing to satisfy it with.
- **The parse ladder's two layers are already split the way the live list needs.**
  `readCollectionDocument` is the shape gate,
  `validateCollectionItems` the per-item judge
  ([collections.ts:172-198](../../../libs/core/src/collections.ts#L172-L198),
  [239-430](../../../libs/core/src/collections.ts#L239-L430)) — the phase-1 divergence note split
  them precisely because one consumer drops invalid items and another keeps them editable. The
  live list is a third consumer and picks the same behaviour as `collection()`: drop, so the page
  shows what the next Publish would render.
- **`admin` is three-state, and `undefined` renders the visitor view.** `PalimpProvider` starts
  `admin` at `undefined`; every gate in `fe-next` is `if (!context.admin)`. So during prerender
  *and* during the first client paint, a wrapper gated the same way emits its children — the baked
  fragment — and swaps to the live list only after `hasSession()` resolves. The visitor HTML is
  therefore the baked cards by construction, and the admin sees the same swap-on-mount that
  `EditComponent` already exhibits.
- **Item ids are unique among valid items.** The validator rejects a missing, empty, or duplicate
  `idField`, first occurrence winning
  ([collections.ts:411-424](../../../libs/core/src/collections.ts#L411-L424)) — so a live map that
  drops invalid items can key its elements by id, and reordering moves DOM nodes instead of
  recreating them.

## §A — `<PalimpCollectionList>`: the boundary

The host-facing surface, in `fe-next`:

```tsx
// app/VarietyCard.tsx — the host's card, a client component, written once
"use client";
export const VarietyCard = ({ item, staleBody }: {
  item: { id: string; name: string; featured?: boolean };
  staleBody?: string;
}) => (
  <div style={styles.card}>
    <h3>{item.name}{item.featured ? " ★" : ""}</h3>
    <p><PalimpText messageKey={collectionItemKey("varieties", item.id, "body")}
                   {...(staleBody !== undefined ? { staleValue: staleBody } : {})} /></p>
  </div>
);

// app/page.tsx — the server side
const items = await collection(varieties);
<PalimpCollectionList collection={varieties} itemComponent={VarietyCard}>
  {items.map((v) => (
    <VarietyCard key={v.id} item={v}
      staleBody={p(collectionItemKey(varieties, v.id, "body"), { asString: true, … })} />
  ))}
</PalimpCollectionList>
```

`<PalimpCollectionList>` is an async **server** component, the `<PalimpCollections>` shape with
two more props: it awaits the same cached `loadMessages()`, strips `defaultItems`, resolves
`staleDocument` as the stored row or the serialized seed — identical resolution, extracted into a
shared internal helper so the two server components cannot drift — and renders a thin
`"use client"` half with `{declaration, staleDocument, itemComponent, children}`. That client half
is the `PalimpCollectionsClient` shape with one change: visitors (and the `admin === undefined` window) get
`{children}` instead of `null`; admins get the live half via `next/dynamic` (§B).

### The division of labour, stated once

- **Children are the baked fragment.** The host maps them on the server, so they can carry
  anything only the server knows: row-resolved prose via `p(…, { asString: true })` handed to the
  card as an ordinary string prop, `defaultMessage` dictionaries, locale prefixes. This is why the
  wrapper never needs to know which fields have prose — the exact knowledge a generic wrapper
  cannot have.
- **`itemComponent` is the live map.** The live half calls it with `{ item }` and nothing else. A
  card therefore declares everything beyond `item` optional, and behaves sensibly when only `item`
  arrives: `PalimpText` without `staleValue` is exactly that behaviour for prose (§D).

### The type, compiled

```ts
interface Props<F extends ReadonlyArray<CollectionField>> {
  collection: CollectionSchema<F>;
  itemComponent: ComponentType<{ item: CollectionItem<F> }>;
  children: ReactNode;
}
export const PalimpCollectionList: <const F extends ReadonlyArray<CollectionField>>(
  props: Props<F>,
) => Promise<ReactNode>;
```

Typechecked under `libs/tsconfig.base.json` on 2026-08-20 — same flags, same compiler, the
phase-1 "compiled, not reasoned about" rule. Three facts fall out of ordinary contravariance, and
all three were compiled rather than asserted:

| written | result |
| --- | --- |
| card props `{ item; staleBody?: string }` | compiles — extra optional props are the pattern |
| card props `{ item; staleBody: string }` (required) | error — the live map cannot supply it |
| card props `{ item: { id: number } }` | error — item type must match the schema's inference |

The middle row is the valuable one: a card that *needs* a server-supplied prop is a card that
would render wrongly in the live map, and the compiler rejects it before the runtime can. These
three become `@ts-expect-error` fixtures beside the phase-1 ones in
`collections.fixtures.ts`. Internally, the client half and the live half erase the item type the
way `AnyCollectionSchema` erases the schema's — typing is enforced at the one host-facing seam and
plumbed as `unknown` past it.

### Constraints a host will hit, named now

- `itemComponent` must be a component exported from a `"use client"` module. A server component
  or an inline arrow fails Next's serialization with "Functions cannot be passed directly to
  Client Components" — an error that does not point back here. README quirk.
- The wrapper is an async server component and cannot sit in a `"use client"` subtree — the same
  quirk `<PalimpCollections>` already documents, inherited verbatim.
- The card renders for visitors, so it ships to visitors: its chunk is eager and its instances
  hydrate. That is the honest cost of live rendering and it is measured, not guessed, in §E —
  on the dogfood it is +1,465 B of eager JS and a net *reduction* in payload bytes.

## §B — The live half: `LiveCollectionList` in `core/admin`

One new file in `libs/core/src/Admin/`, exported from the `./admin` entry, loaded only through
`next/dynamic` — the placement that keeps antd, react-query and the rest out of every eager
chunk, which §E verifies held in the prototype (the parse code appears in lazy chunks only).

What it does, in order:

1. **Registers** `{declaration, staleDocument}` into `collectionsStore` from the same
   `useEffect` + `useId` + serialized-signature idiom as the phase-1 registrar
   ([PalimpCollections.tsx:11-28](../../../libs/core/src/Admin/PalimpCollections.tsx#L11-L28))
   — this is D8. First-registration-wins dedup makes coexistence with an explicit
   `<PalimpCollections>` carrying identical data harmless.
2. **Resolves the working document** with the modal's own chain, verbatim in meaning:
   `useQuery(editQueryKey(key))` against `getKey`, `useEdit(key)` for the pending draft, and
   `pending ?? data ?? staleDocument`
   ([CollectionsModal.tsx:108-120](../../../libs/core/src/Admin/Devtools/CollectionsModal.tsx#L108-L120)).
   Because the query key is the one `useSaveButton` invalidates, the list refreshes after a save
   with no save-path change; because `useEdit` fires per keystroke, a fact typed in the modal
   appears on the page as it is typed.
3. **Parses and filters like the build, not like the modal.** `readCollectionDocument`; if the
   document is unreadable, render `{children}` — the baked fragment is the last known-good render,
   and the modal is already the surface that explains unreadability with its alert. If readable,
   `validateCollectionItems` and **drop** invalid items, silently — the same items `collection()`
   would drop loudly at build, so the admin's page equals the next Publish. The warnings' home
   stays the modal, which marks the same items with the same validator; a second console stream
   from the page would be noise about things the modal already shows.
4. **Maps** `itemComponent` over the surviving items, `key` = the item's id (unique among valid
   items, see "already true"), so a reorder moves nodes and a focused inline prose editor survives
   its card changing position.

An empty valid document renders an empty list, not the children: the owner deleted the items, and
resurrecting the baked cards would be the same wrong instinct as parse-ladder row 5 falling back
to `defaultItems`.

No part of the live half is preview-aware, save-aware, or modal-aware. It is a renderer of the
working document, and everything else composes.

## §C — Preview

D7 in practice. Preview today short-circuits each `EditComponent` to text; the page's structure is
whatever the server baked. With the wrapper, structure joins content: toggling preview as an admin
shows the pending document's items — added, removed, reordered — as plain rendered cards, which is
the first time "how the page will look" is answerable for a structural change before a Publish.

The one wrinkle, promised in the gate: a fresh item whose prose was never typed previews as an
**empty** body, while the published page would render the derived key (the `p()` missing-content
fallback). The chain in `EditComponent`'s preview branch ends `?? ""`, and `PalimpText` passes
`staleValue ?? ""` for a key with no row. This is arguably the better render — preview is a
lie-detector for layout, and a long raw key is a worse stand-in for absent copy than whitespace —
but it is a divergence between preview and publish, it will be noticed, and it is hereby
documented rather than discovered. README quirk, verification item.

One adjacent fact worth stating because the modal's §D note reads as its opposite: the live cards'
prose editors are real `EditComponent`s, so the interaction guard covers them — a live card inside
a host `<a>` or click-handling ancestor is the exact case the v1.4.0 guard exists for, unchanged.
The phase-1 asymmetry (the *modal's* controls are outside the guard) still holds and still lives
in the modal.

## §D — `PalimpText` and `collectionItemKey`

**The text primitive** is not new code; it is `XcoreClientComponent` made reachable and made
honest about absence:

- `staleValue` becomes optional. The visitor branch renders `staleValue ?? messageKey` — the
  missing-content-obvious fallback `p()` applies server-side, now applied at the component for the
  one caller that cannot resolve first. `p()` itself always passes a resolved string, so nothing
  observable changes for existing pages; the compiled signature is the only difference.
- `EditComponent` is untouched: the primitive passes `staleValue ?? ""` down, and the existing
  `pending ?? data ?? staleValue ?? ""` chain plus the `placeholder={messageKey}` behaviour
  ([EditComponent.tsx:54](../../../libs/core/src/Admin/EditComponent.tsx#L54)) already give a
  fresh key an empty editor labelled with its own key — the exploration's "the existing chain
  already handles that", verified against the line rather than quoted.
- The export is an alias: `export { XcoreClientComponent as PalimpText }` from `fe-next`'s index.
  `XcoreClientComponent` keeps its name and module (it is public surface; renaming is a breaking
  change per [CLAUDE.md](../../../CLAUDE.md)); `PalimpText` is the name documentation teaches.
  It keeps passing `textarea` down, so `EditComponent`'s input branch stays dead, as documented in
  [architecture.md](../../architecture.md#sharp-edges).

**The key helper** goes in `libs/core/src/collections.ts` — pure, beside `collectionKey`,
re-exported through `fe-next` like `defineCollection`:

```ts
export const collectionItemKey = (
  collection: string | Pick<AnyCollectionSchema, "name">,
  id: string,
  suffix: string,
): string =>
  `${typeof collection === "string" ? collection : collection.name}.${id}.${suffix}`;
```

Phase 1 declined to formalize this because its shape depended on phase 2; phase 2 is what fixes
it. Four choices inside those lines, each deliberate:

- **It accepts the bare name, and client cards must use that form.** A `"use client"` card that
  imports the schema module for the sake of `collectionItemKey(varieties, …)` ships the schema —
  `defaultItems` included — in the visitor's JS: the exact "same bytes down a different pipe"
  shape phase 1's §E rejected, arrived at by accident. The server side, already holding the
  schema, passes it; the card passes the string. README quirk, and the dogfood demonstrates both
  forms.
- **Namespace is `schema.name`, not the storage key.** Prose keys are page keys — flat, host-side,
  greppable — and `collection.<name>` is a storage namespace (D2). The phase-1 dogfood already
  writes `varieties.<id>.body`, not `collection.varieties.<id>.body`; the helper canonizes the
  precedent. Corollary, documented: two schemas sharing a `name` under different `key` overrides
  would share prose namespaces — the storage-key dedup in the store does not protect prose.
- **No locale parameter.** §F of phase 1 puts the host's locale prefix *in front*, where the host
  already solved locale; a host with locales writes `` p(`${locale}.${collectionItemKey(…)}`) ``
  or wraps the helper once. Teaching the helper about locales would be guessing at every host's
  prefix scheme — the exact reason phase 1 deferred it.
- **It takes the id, not the item**, so the caller decides what an id is — the server side has
  typed items, the card has `item.id`, and neither needs the schema's `idField` re-resolved.

Both examples' dogfood adopts the helper on both sides of the boundary, which is the drift the
formalization exists to prevent: the baked `p()` call and the card's `PalimpText` computing the
same key from the same function rather than from two template literals that happen to agree.

## §E — Measured: payload, bundle, hydration

Measured 2026-08-20 on a prototype of §A/§B built in the supabase example (working tree only,
reverted after), static-exported with a stub server adapter serving a stored three-item document
plus one prose row — the same conditions as the phase-1 §E measurement. Uncompressed bytes,
production `next build`, this branch's libs. "Baseline" is phase 1 as landed.

| | baseline | **chosen shape (D6)** | dual render (rejected) |
| --- | --- | --- | --- |
| visitor `out/index.html` | 26,005 B | **25,498 B (−507)** | 26,800 B (+795) |
| eager JS (11 scripts in every column) | 643,733 B | **645,198 B (+1,465)** | 645,198 B (+1,465) |
| host card chunk | — | eager (it renders for visitors) | **eager anyway** — the bare module reference pulls it |
| hydrated instances | 30 editors | 27 editors + 3 cards + 1 wrapper | 30 editors + 1 wrapper |
| parse/admin code | lazy chunk (715,991 B) | still lazy-only (grepped) | still lazy-only |

What the numbers say, read honestly:

- **The chosen shape makes the payload smaller, not larger.** Moving the card into a client
  component removes its markup from the flight payload (props ship; JSX structure does not),
  which outweighs the added `staleDocument`, module references, and per-card item props — on this
  page, by 507 bytes. This will not hold for every host: a card with little markup and fat items
  tips the other way. The direction of each term is what generalizes, not the sign of the sum.
- **The eager-JS cost of live rendering is ~1.5 KB on this page** — the card, the thin wrapper,
  and the dynamic-import shims, landing in the page's existing client chunk (8,021 → 9,486 B).
  The admin machinery stays where phase 1 put it: `readCollectionDocument`'s code appears in lazy
  chunks only, in every variant.
- **The rejected shape is dominated, and that was only visible by measuring.** Keeping the baked
  side as server markup was supposed to spare visitors the card JS; measured, it spares nothing —
  a client reference serialized into the payload makes Next ship the chunk eagerly whether or not
  anything renders it — while paying +795 B of payload for the duplicated markup *and* leaving the
  host maintaining two renderings of one card. This is the measurement that settled D6.
- **Hydration instance count is a wash on the dogfood**: three body editors became three cards
  wrapping the same editors. The per-item hydration cost for a host is one card component per
  item — real, linear in items, and made of the host's own code.

Two caveats, so the verification pass knows what to re-measure rather than trust: the prototype's
live half was a stub (the real one adds store and query wiring, all of it inside the already-lazy
admin chunk), and the prototype shipped `staleDocument` twice — the wrapper's copy plus the
registration's — which D8 removes, so the real payload delta should land *below* −507 B here.
Wall-clock hydration time was not measured; it needs a browser against a real page, and the
host-adoption §C rule keeps that measurement with the host's own performance budget. Bytes and
instance counts are what a build can measure, and they are what this table holds.

## §F — The dogfood

Both examples, identically (the guard-fixture section stays supabase-only, as in phase 1):

- `app/VarietyCard.tsx` — the §A card, verbatim: facts from `item`, body through `PalimpText`
  with `collectionItemKey`, `staleBody` optional.
- The varieties section in `page.tsx` becomes the §A composition: `<PalimpCollectionList
  collection={varieties} itemComponent={VarietyCard}>` wrapping the baked map, which now maps
  `<VarietyCard>` with `staleBody={p(…, { asString: true, … })}` instead of open-coding the card.
  The `varietyBodies` dictionary and the hoisted-lookup pattern stay exactly as the phase-1
  divergence note left them.
- The standalone `<PalimpCollections collections={[varieties]} />` line is **removed** — D8 makes
  the wrapper the registrar. `<PalimpCollections>` keeps its README section and its export; the
  dedup path (a page rendering both) gets a verification item instead of a permanent dogfood.
- `collections.fixtures.ts` gains the three §A type fixtures.

## §G — What phase 2 deliberately does not do

1. **A new item's per-slug route still needs a Publish.** `generateStaticParams` runs at build;
   no client wrapper can mint a route on a static export. The item's *card* is live; its
   *standalone page* — for hosts that have one — appears at the next Publish, which also remains
   the moment visitors see anything. The two-publish-cycle cost this plan opened with becomes one
   Save and one Publish; it does not become zero.
2. **Liveness is opt-in per list.** A page that keeps a plain `collection()` map renders
   structural changes at the next Publish, exactly as phase 1 documented. Nothing retrofits.
3. **Visitors get the baked fragment, full stop.** No visitor-side re-reading, no loading states,
   no CLS from late data — the premise of the static export is not renegotiated by this phase.
4. **The page grows no structural affordances.** Add, remove, reorder, and fact edits live in the
   modal; the wrapper renders. An on-page "add item" button is a different feature with different
   guard implications, and nobody has asked for it.
5. **No `asString` liveness.** A fact used in `generateMetadata` or an attribute is baked; that is
   the documented `asString` quirk, unchanged.
6. **No structured problem reporting, no concurrency control, no size bounds** — phase 1 §H items
   6–8 carry forward untouched.
7. **Media, relations, conditional fields** — phases 3 and 4, as mapped.

## Alternatives weighed and rejected

- **Dual render: baked server markup + client card only for the live map.** Measured in §E and
  dominated: same eager-JS cost (the module reference alone ships the chunk), larger payload
  (+795 B vs −507 B), and the host maintains the card twice. The one shape that looked cheaper
  was, measured, cheaper at nothing.
- **A host-facing hook (`useCollection()`) instead of a wrapper component.** Every host hand-rolls
  the client boundary, the admin gate, the `undefined` window, and the baked-fallback — five
  chances to ship editor behaviour to visitors — and the hook cannot reach `editsStore` without
  the host importing `@palimp/core/admin`, which is either a static import (the exact bundle
  mistake the CLAUDE.md forbids) or per-host dynamic-import ceremony. The wrapper is that ceremony
  written once, correctly.
- **A render prop: `children={(items) => …}`.** Functions cannot cross the RSC boundary at all;
  fails before it can be argued with.
- **Cloning the baked children per live item** (map over `Children.toArray`, re-key). Falls apart
  on the only case that matters: an *added* item has no child to clone. Dead end, listed because
  it is the first idea everyone has.
- **`ssr: false` on the live half** to skip the hydration mismatch window. The gate on
  `admin === undefined` already renders children on the server and first paint, so there is no
  mismatch to suppress; `ssr: false` would just add a flash.
- **A leaner `core` entry for the live half** instead of `./admin`. A fourth exports subpath so
  that admin-gated code can avoid the admin chunk it is gated behind — indirection with no
  beneficiary.
- **Warning from the live list when it drops invalid items.** The modal already marks the same
  items via the same validator, on the surface where the owner can act; a console stream from the
  page would duplicate it for nobody.

## Documentation to update when it lands

- [libs/fe-next/README.md](../../../libs/fe-next/README.md) — extend the Collections section with
  `<PalimpCollectionList>`, `PalimpText`, `collectionItemKey`; usage snippet in the §A shape.
  **Quirks:** `itemComponent` must come from a `"use client"` module (and the Next error when it
  does not names neither palimp nor the prop); a `"use client"` card must not import the schema
  module — it would ship `defaultItems` in the visitor bundle, so it passes the collection *name*
  to `collectionItemKey` instead; a client component referenced in the payload ships
  its chunk eagerly even if never rendered; preview renders an untyped fresh prose key as empty
  where publish would render the key; a new item's per-slug route still needs Publish; the wrapper
  registers the collection, so a page needs `<PalimpCollections>` only for collections it does not
  live-render.
- [libs/core/README.md](../../../libs/core/README.md) — `LiveCollectionList` under "The admin UI";
  its parse-and-drop behaviour (matches the build, not the modal); the unreadable-document
  children fallback; the note that live cards are inside the interaction guard while the modal's
  controls are not.
- [docs/architecture.md](../../architecture.md) — the collections bullet under **Render, edit,
  save** gains the live-wrapper sentence: structural liveness is the `EditComponent` re-read
  mechanism one level up, admin-only, with visitors on the baked fragment.
- README.md here — decision log rows D6–D8 (done with this plan), phase map row, next steps.
- **The backend READMEs do not change.** Same rule, same reason as phase 1.

## Verification

1. **`pnpm check-types`**, including the three new `@ts-expect-error` fixtures from §A (compiled
   in planning; the fixtures make them permanent).
2. **`pnpm build`** — `exports` maps intact; antd/react-query/lucide still absent from every
   eager chunk.
3. **Stub-adapter static export, re-measured against §E** (the phase-1 item 3 procedure): visitor
   HTML carries the baked cards and no editor markup; the card chunk is eager and the parse/admin
   code is not; `staleDocument` appears **once** per collection in the payload (D8 — the prototype
   shipped it twice); the index.html delta is at or below §E's −507 B; eager-JS delta ≈ +1.5 KB.
4. **The dedup path**: a scratch page rendering both `<PalimpCollectionList>` and
   `<PalimpCollections>` for one collection registers it once (first wins), and the modal shows
   one tab.
5. **The credentialed manual pass — no build covers any of this** (Supabase, per the house rule;
   ask for credentials rather than reporting types-and-export verification as done):
   - add an item in the modal → its card appears on the page **before any Save**, prose editor
     inline with the derived key as placeholder; type the body inline; the badge reads `Save (2)`
     (document + prose); **one** `setKeys` batch carries both;
   - a fact edited in the modal updates the card per keystroke; reorder and delete reflect
     immediately; a focused prose editor survives its card being reordered (key-by-id);
   - after Save, the list re-reads through the invalidation loop and stays correct; a failed save
     retains both drafts and the page keeps showing them; **Discard changes** snaps the page back
     to the fetched document;
   - preview shows the pending structure as plain cards; the untyped-prose-previews-empty wrinkle
     confirmed and README-linked;
   - an editor inside a live card within an interactive ancestor stays inert per the guard
     fixtures;
   - Publish once; after the rebuild the visitor page shows the added item with its typed body —
     the one-cycle flow this plan opened with. The added-item-renders-after-rebuild half stays
     unexercisable until this branch is what the deploy workflow builds, and if so the landing
     note says so, item by item, as phase 1's does.

---

## Divergence note (2026-08-20, implementation)

Built as specified, with the following departures — each found by measuring, none by preference.

1. **`collectionItemKey` lives in its own module, `libs/core/src/collectionItemKey.ts`,
   re-exported through `./collections`.** The plan placed it in `collections.ts`, beside
   `collectionKey`. Built that way, the §E budget broke: the helper is the one collections
   function client cards call, bundling is module-granular, and the card's import dragged the
   whole parse ladder into the visitor's eager JS. Same entry, same imports, same surface — the
   function just sits in a file the validator does not.
2. **`@palimp/core` and `@palimp/fe-next` now declare `"sideEffects": false`.** The other half of
   the same finding: a `"use client"` card importing `PalimpText` / `collectionItemKey` from the
   fe-next index shipped every statically-imported module in the barrel — `palimp.tsx` and the
   server components included — because nothing told the bundler the packages were side-effect
   free. They are (module-level state is reachable only through exports), and saying so is what
   makes the index barrel safe to import from client code at all. Before both fixes the measured
   eager-JS delta was **+5,263 B** against the plan's ≈ +1.5 KB; after, **+580 B**.
3. **§E re-measured, and the chosen shape did better than the prototype** (stub-adapter static
   export, §E conditions; baseline re-measured at 33a1243 with the same stub, matching §E's
   eager-JS figure to the byte): visitor `out/index.html` 26,039 → 24,917 (**−1,122 B**, below
   §E's −507 B exactly as D8 predicted, the second `staleDocument` copy being gone); eager JS
   643,733 → 644,313 (**+580 B**, under the ≈ +1.5 KB budget — the `sideEffects` flag also shook
   phase-1 modules out of chunks that never used them); `staleDocument` **once** per collection
   in the payload; the card chunk eager and referenced by both sides as one module (`$21` /
   `$L21` in the flight payload); parse and admin code in lazy chunks only; antd, react-query and
   lucide absent from all eleven eager scripts (and present in lazy ones, so the grep proves
   something); no editor markup in the visitor HTML.
4. **Small unplanned decisions, recorded:** the three §A type fixtures call
   `PalimpCollectionList` as a plain function — the fixture file is `.ts`, JSX is unavailable,
   and the props typecheck identically; the wrong-item fixture writes `{ slug: number }` rather
   than the plan's `{ id: number }`, because the fixture schema's id field is `slug`; the
   fe-next README's phase-1 "+698 bytes" note left with the quirk it lived in, since the example
   no longer registers through `<PalimpCollections>` and the number no longer describes the page.

**Landing notes.** Verification status, item by item: **1, 2 and 3 ran and pass** (the three new
`@ts-expect-error` fixtures compiled-and-failed as specified; the measurements are recorded
above). A full static export against the real Supabase table also ran: the stored document —
phase 1's `test-unicode` item included — renders through the wrapper at build. **Items 4 and 5
ran 2026-08-21 against real Supabase credentials**, CDP-driving a signed-in session in the dev
server, and pass:

- **Item 4** — a scratch page rendering both `<PalimpCollectionList>` and `<PalimpCollections>`
  for `varieties` registered it once: the drawer read `Collections (1)` and the modal showed
  exactly one tab.
- **Add → one Save, one Publish**: the added item's card appeared on the page **before any
  Save**, its inline editor's placeholder the derived `varieties.pisang-raja.body`; the body was
  typed inline; the badge went `Save (1)` → `Save (2)`; and the save was **one** `setKeys` POST
  (`/rest/v1/inline?on_conflict=key`) carrying the document and the prose row together.
- **Liveness**: a fact edited in the modal updated the card per keystroke (observed at every
  keypress); reorder and delete reflected immediately; **key-by-id held** — a marked textarea
  DOM node survived its card's reorder as the same node. One honest caveat: the "focused prose
  editor survives reorder" line cannot be exercised literally, because antd's modal traps focus
  — a page editor cannot *hold* focus while the modal (where reorder lives) is open at all; the
  mechanism the line names, node identity under reorder, is what was verified.
- **Save-path behaviour**: a failed save (aborted POST) kept `Save (2)` and both drafts visible
  on the page; the subsequent real save cleared the badge and the list re-read correctly
  through the invalidation loop, typed body intact. **Discard changes** snapped a
  rename+reorder+delete draft back to the fetched document and cleared the badge.
- **Preview**: showed the pending structure as plain cards — six cards including a never-saved
  draft item, zero editors — with typed prose as text; the documented wrinkle confirmed: the
  untyped fresh item's body previewed **empty**, where the published page would render the key.
- **Guard**: in a live card inside an `<a href>`, a trusted click focused the editor without
  navigating, typing entered the draft, and middle-click stayed inert.
- Fresh page loads produced zero console errors (no hydration mismatch from the
  children-to-live-list swap).

**Still not run:** the Publish step (item 5's last line) — its added-item-renders-after-rebuild
half stays unexercisable until this branch is what the deploy workflow builds, as phase 1's note
already records, and the dispatch path itself was demonstrated in phase 1. The demo database now
holds the `pisang-raja` item and its prose row, left in deliberately like phase 1's test data;
the prose row would outlive any later deletion of the item, since no delete primitive exists.
