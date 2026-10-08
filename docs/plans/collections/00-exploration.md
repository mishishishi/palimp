# Collections: entities the owner can add without a developer

**Status:** exploration record · **Date:** 2026-08-19

> Written as the record of the exploration, before any decision, and kept as the grounding for the
> plan set in this folder. [README.md](README.md) tracks the decisions, the phase map and their
> statuses — it supersedes the Phasing and Open-questions sections below as they are worked.
> Nothing here had been built when this was written.

Raised by the same host adoption that produced [host-adoption.md](../host-adoption.md) — which
scoped this out explicitly ("Collections stay out… Nothing below moves palimp toward entities").
The host read this codebase before adopting it and recorded the conclusion in its own decision
log: palimp is a flat key→string store, fine for copy, unable to model a collection of entities —
no enumeration, no types, no repeatable items, no media, and adding an item would mean a developer
registering new keys. Its launch shipped with the client-editable-collection requirement
downgraded and a note to revisit once palimp could model one. This plan is that revisit.

Scope: what has to change in `libs/core` and `libs/fe-next` so that a host can declare a
collection schema in code and the signed-in owner can add, edit, reorder and remove items from the
Devtools drawer. **Zero files change in the backend adapters** — that constraint is load-bearing
and §A is shaped around keeping it true. Media upload is out (§E2). The alternatives weighed,
including embedding Sveltia CMS outright, are at the end.

## What is already true

- The stored value type is `string`, everywhere, with no exception —
  [types.ts](../../../libs/core/src/types.ts) (`Message { key, value }`), the Supabase
  `inline(key text primary key, value text)` table, the Firestore `inline/{key}` documents with a
  single `value` field. Nothing in the workspace JSON-parses a stored value today.
- **Creation already works; deletion doesn't exist.** `setKeys` is an upsert — a single
  `.upsert(rows)` statement in
  [be-supabase](../../../libs/be-supabase/src/client.ts#L99-L112), one atomic `writeBatch` in
  [be-firebase](../../../libs/be-firebase/src/client.ts#L93-L104) — so a key springs into
  existence on first save with no registration step. No adapter method removes a row.
- **There is no enumeration.** `loadMessages()` reads the whole store with no filter; `getKey`
  reads one row. Nothing can ask "give me `projects.*`", so a variable-length list must carry its
  own index somewhere.
- **The save is all-or-nothing by design**
  ([PalimpClientBackendAdapter.ts:10](../../../libs/core/src/PalimpClientBackendAdapter.ts#L10)
  keeps `setKey` commented out on purpose), and both backends make the batch atomic. Dirty state
  is a module-singleton `Map<string,string>`
  ([editsStore.ts](../../../libs/core/src/Admin/editsStore.ts)); the Save button just drains it
  ([useSaveButton.tsx](../../../libs/core/src/Admin/Devtools/useSaveButton.tsx#L10-L25)) and a
  failed save keeps the edits.
- **The drawer already hosts a structured editor once.** The Fields modal
  ([FieldsModal.tsx](../../../libs/core/src/Admin/Devtools/FieldsModal.tsx)) renders declared,
  off-page keys as a labelled antd form, and needed zero changes to the save path: a modal edit
  and an inline edit are the same `editsStore` entry. The drawer is 192px wide, so anything richer
  than a button is a `Modal` — that decision is already made.
- **The site is a static export.** Values bake into HTML at build; admins see string edits live
  only because each editor re-reads its key client-side; `asString` values are fixed until the
  next Publish ([architecture.md](../../architecture.md)).

## What the feature must do

The host's content model splits content by one rule: *if it has fields, it is an entity; if it is
a sentence, it is copy.* Copy is already palimp's half. The entity half, taken from the collection
the host actually ships (a portfolio of realised projects), needs: a string id that doubles as a
URL slug, plain string facts, a year as a number, an enum field, a relation to another content
type, an optional number whose absence is meaningful (never written as `0`), a repeatable
gallery of `{ id, src?, taken? }` objects, a nested object with a consent boolean that gates
rendering, and a required boolean flag. Items mint prerendered routes, two locales each. Prose
about an item stays dictionary copy under keys derived from the item's id.

Two more requirements come from how the host adopted palimp for copy: database rows are
*overrides* over in-repo defaults, so an empty database must change nothing (a `defaultItems`
seed, mirroring `defaultMessage`); and the collection must be one **the owner adds to unaided** —
adding an item must not involve a developer registering keys.

## §A — The shape: one collection = one key, value = one JSON document

One storage key per collection (suggested convention `collection.<name>`; the definition carries
the key, so the host decides). The value is a JSON document, stored as a **string**:

```json
{ "v": 1, "items": [ { "slug": "…", "year": 2024, "gallery": [] } ] }
```

The load-bearing property: **the document is the enumeration**, which dissolves the three missing
primitives at once, without touching a contract:

- *Enumerate*: the items array. The build gets it through the same `loadMessages()` bulk read and
  the same React `cache()` — zero new server API, zero extra reads.
- *Create / delete / reorder*: all become "save the new document" — one `setKeys` entry, riding
  the existing atomic batch, committed together with whatever prose edits are pending. The absent
  delete primitive never bites.
- *No registration*: upsert semantics mean the first save of a new collection (or of a new item's
  derived prose keys, §D) creates the rows.

Costs accepted knowingly:

- **Whole-collection last-write-wins.** Two admins editing different items overwrite each other's
  collection. Today's per-key model has the same failure one level finer. Single-editor sites —
  the scale everything else here assumes — are fine; a `version` check would need a conditional
  write the contract cannot express, so it is out of scope and recorded here.
- **Size bounds.** Firestore caps a document at 1 MB and `loadMessages()` reads the whole table
  per build; both assume dozens-of-items collections, which matches the repo's stated trade.
- **Firestore must keep the value a string.** The client's
  [`typeof value === "string"` check](../../../libs/be-firebase/src/client.ts#L91) returns `null`
  for a real map — storing parsed JSON as a Firestore map would read back as absent. Encode as a
  string in both backends, symmetrically.

## §B — Schema in code, items in the database

The split Sveltia CMS uses (a developer-authored config, editor-authored entries), adopted
deliberately: **the developer defines fields, types and constraints in a typed config; the owner
adds and edits items.** A runtime schema-builder is rejected below — on a static site the render
side is bespoke code anyway, so a field the page's component doesn't know about cannot render.

```ts
// host code — vocabulary deliberately Sveltia-flavoured (name/label/widget/required/pattern)
export const projects = defineCollection({
  name: "projects",
  idField: "slug",
  fields: [
    { name: "slug",    widget: "string",  required: true, pattern: "^[a-z0-9-]+$" },
    { name: "year",    widget: "number",  min: 1990 },
    { name: "segment", widget: "select",  options: SEGMENTS },
    { name: "area",    widget: "number",  required: false },   // absent, never 0
    { name: "sample",  widget: "boolean", default: false },
    { name: "gallery", widget: "list", fields: [
      { name: "id",  widget: "string", required: true },
      { name: "src", widget: "string", required: false },
    ]},
  ],
  defaultItems: seedProjects,   // empty database changes nothing
});
```

Widgets for v1: `string`, `text`, `number`, `boolean`, `select`, `object`, `list`. Constraints:
`required`, `pattern`, `min`/`max`. Conditional visibility (`showWhen`) is a v2 flag on the same
spec, not an architecture question. The item type is *inferred* from the field spec (the
`as const satisfies` / mapped-type trick), so `collection(projects)` returns typed items and
`pnpm check-types` — the only automated gate — actually guards the host's render code.

Borrowing Sveltia's vocabulary is the "lite version" worth having: familiar semantics, documented
elsewhere, and a mechanical migration path in either direction if the feature is ever outgrown
([sveltiacms.app/en/docs/intro](https://sveltiacms.app/en/docs/intro)).

## §C — Where the code lands

This is a *feature*, and the architecture doc is explicit that features legitimately move `core`
("adapters isolate implementations, not features"). The be-firebase "Files modified: None" bet
stays untouched because no adapter file changes.

- **`libs/core` root**: `CollectionSchema` types + `defineCollection` — light, no antd, importable
  from server and client alike.
- **`libs/core/src/Admin`**: a `collectionsStore` twin of
  [fieldsStore.ts](../../../libs/core/src/Admin/fieldsStore.ts) (keyed by registration id, same
  merge-on-refresh); a `CollectionsModal` opened from a new Devtools button — item list with
  add / duplicate / delete / move-up / move-down (no drag-and-drop in v1), one antd widget per
  field type (`Input`, `Input.TextArea`, `InputNumber`, `Switch`, `Select`, nested repeater for
  `list`), schema validation inline. Every draft change serializes and calls
  `editsStore.set(collectionKey, json)` — same badge, same Save button, same
  failed-save-keeps-edits, same `["palimp:edit", key]` invalidation. No new mutation keys.
- **`libs/fe-next`**: a `collection()` reader beside `palimp()`, parsing and validating out of the
  same cached `loadMessages()` result. Usable in `generateStaticParams`, so an owner-added item
  mints its per-slug routes at the next Publish.
- **Registration**: a `<PalimpCollections collections={[projects]}>` component, the `PalimpFields`
  pattern one level up. Declarations ship in the RSC flight payload visitor or not — the same
  documented asymmetry `PalimpFields` already has; keep schemas lean.

## §D — Prose stays flat keys

The entity document holds *facts*; sentences stay ordinary palimp keys **derived mechanically
from `idField`** — `projects.<slug>.story.before`, `cs.projects.<slug>.story.before` with the
host's locale-prefix convention. Derived keys need no developer registration (upsert creates them
on first save), which answers the host's recorded objection to flat-key entities word for word.
Three things fall out for free:

- In-place editing of item prose keeps working untouched — including inside linked cards, which is
  exactly the interactive-ancestor case the v1.4.0 window-capture guard was built for.
- Entities stay locale-free (facts don't translate), so `Message` never needs a locale field; the
  locale problem stays where the host already solved it, in key prefixes.
- The Fields modal can list an item's derived prose keys next to its facts later, since both are
  ordinary `editsStore` entries.

## §E — What v1 does not do, said plainly

1. **Live structural rendering.** String edits appear live because each editor re-reads its key;
   a v1 collection renders server-side only, so a new item appears on the admin's *page* after
   Publish — the modal is the editing surface. The v2 path is a client list wrapper: admin
   re-reads the JSON key and maps a host-supplied **client** render component; visitors get the
   baked children fragment — the
   [ClientComponent.tsx](../../../libs/fe-next/src/ClientComponent.tsx) trick one subtree up.
   Fresh items' prose keys have no `staleValue`; the existing `pending ?? data ?? staleValue ?? ""`
   chain already handles that.
2. **Media.** No upload path exists anywhere in palimp and none is added here. v1: image fields
   are string paths; assets keep landing in the repo by PR — for the host that is defensible on
   its own merits, since its photography is consent-gated and art-directed, not drop-in. v2: an
   optional `PalimpMediaAdapter` seam (upload / list / public URL) with Supabase Storage and
   Firebase Storage implementations — the same orthogonal-capability shape the publish seam
   proved.
3. **Deep validation.** Field-level basics only; cross-field rules and conditional fields later.
4. **Build policy on an invalid document is an open decision.** A hard build failure on one bad
   row bricks publishing for everything, prose included; silently falling back hides breakage.
   Leaning: validate strictly in the modal so bad documents are rare; at build, drop invalid
   *items* with a loud log line, and fall back to `defaultItems` only if the document itself
   fails to parse. Not decided.

## Alternatives rejected

- **An entity as a bundle of flat keys** (`projects.brno.year`, …). Already rejected on the host
  side: no enumeration, no types, no repeatable gallery, developer-registered keys. Revisited only
  to note that §A answers each point — the JSON document is what a key bundle cannot be.
- **Per-item keys plus an index key, now.** Finer saves and kinder concurrency, but it re-opens
  everything the document shape closed: deletion has no primitive (orphan rows unless the index is
  authoritative), and it eventually forces a `deleteKeys` contract change through `core` and both
  backends. Kept as a storage-mode evolution if a collection outgrows the document; the `v` field
  exists so that switch is a migration, not a redesign.
- **New adapter methods** (`listKeys(prefix)`, `deleteKeys`, subscriptions). Moves all three
  packages for capabilities the document shape gets free at this scale.
- **Embedding Sveltia CMS.** A Git-based, browser-only SPA — content as repo files, edits as
  commits, auth delegated to the Git host (for GitHub: an OAuth app plus a small token-exchange
  proxy), currently in public beta with 1.0 GA targeted for late 2026
  ([roadmap](https://sveltiacms.app/en/roadmap)). It would work mechanically alongside palimp —
  the static export can ship `/admin/` + `config.yml`, commits trigger the deploy workflow — and
  it buys repeaters, 20+ widgets, validation, relations and a real **media library** today, for
  near-zero engineering. What it costs: a second login world (the owner needs a Git-host account
  and repo write access — the very auth objection the host recorded when it rejected a CMS), a
  second editing UI with no in-place story, content forked across git and the database, and
  publishes that bypass the drawer (push-triggered deploys are already a documented sharp edge).
  Verdict: the buy option if media becomes central before palimp grows it, or if owning
  collections stops being worth it; meanwhile its config vocabulary is adopted in §B.
- **A runtime schema-builder** (schema as data, owner-defined fields). Pays off only with fully
  generic rendering; palimp's identity is "your markup, your page", and a static site renders
  items with bespoke components. Deferred until a real need exists, and §B's spec is data-shaped
  enough that storing it under a key later is not a rewrite.

## Phasing

1. **Collections core** — schema DSL, document-in-a-key storage, `collection()` reader, drawer
   modal with generated form, `defaultItems` seeding. Dogfood exists: the three hardcoded
   `varieties.*` cards in the supabase example
   ([page.tsx](../../../examples/supabase-next/app/page.tsx#L84-L118)) are a fixed-cardinality
   collection begging to become a real one.
2. **Live admin rendering** of lists, plus a formalized helper for item-derived prose keys.
3. **Media adapter seam** + image widget.
4. Demand-driven: relation widget fed from another collection, conditional fields, per-item-key
   storage mode.

## Verification checklist

- [ ] `pnpm check-types` across libs after the `core` + `fe-next` changes.
- [ ] `pnpm build`; each `dist/` still matches its `exports` map; visitor bundle still free of
      antd/react-query/lucide (the modal stays behind the existing `next/dynamic` seam).
- [ ] Example dogfood: the supabase example's varieties cards replaced by a declared collection;
      RSC flight payload before/after compared for the declaration cost.
- [ ] Round-trips: JSON document through Supabase `text` and through Firestore as a **string**
      (the `typeof` check must still pass), unicode included.
- [ ] With real credentials (cannot be verified by any build): add / edit / duplicate / reorder /
      delete an item; Save commits facts and prose in one batch; a failed save retains the draft;
      Publish; a new item's route appears after rebuild via `generateStaticParams`.

## Open questions for the decision

1. Build A (this plan) or buy (Sveltia embed) — or A now with Sveltia acknowledged as the media
   fallback?
2. Storage key namespace: `collection.<name>` vs host-chosen, and whether the locale prefix ever
   applies to a collection key (this plan says no — entities are locale-free).
3. v1 with or without the live list wrapper (§E1)?
4. Build failure policy (§E4).
5. Widget vocabulary: mirror Sveltia's names exactly, or the minimal seven of §B?
