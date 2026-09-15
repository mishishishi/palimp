# Collections, phase 1 — the core

**Status:** proposed · **Date:** 2026-08-19 · **Branch:** `pr/08-collections`

The first buildable phase of the collection set. When it lands, a host declares a collection
schema in code, the signed-in owner adds, edits, duplicates, reorders and deletes its items from
an antd modal off the Devtools drawer, Save commits them atomically alongside pending prose edits,
and the next Publish renders them — with **zero files changed in the backend adapters**.

Scope is the vertical slice and nothing beside it: the schema types and their item inference in
`libs/core`, the document format and its validator, the modal and its store in
`libs/core/src/Admin`, a `collection()` reader and a `<PalimpCollections>` registration in
`libs/fe-next`, the dogfood in the examples, and the package docs. Media, live rendering of
structural changes, relations, conditional fields and drag-and-drop are all later phases and are
named again in §H so the boundary is explicit rather than implied.

The grounding exploration is [00-exploration.md](00-exploration.md); the phase map and the
decision log it feeds are in [README.md](README.md). Everything below was re-checked against the
source rather than taken from the exploration — the places where the source changed the answer are
called out where they occur.

## The decisions this plan is built on

All five gates were answered 2026-08-19, before this file was written. They are recorded in the
[decision log](README.md#decision-log); restated here because the rest of the document assumes
them.

- **D1 — build, not buy.** Build natively and borrow Sveltia's field vocabulary, keeping Sveltia
  the acknowledged fallback if media becomes central. Reading the code strengthened this rather
  than merely confirming it: `editsStore`, `setKeys` and `getKey` absorb the entire feature with
  no contract change, and the Fields modal is a working precedent for a structured editor that
  needed no save-path change at all.
- **D2 — `collection.<name>`, with a `key` override on the schema, never locale-prefixed.**
  Nothing in the workspace parses a key — `p()` does a flat `messages.find(m => m.key === key)`
  ([palimp.tsx:41](../../../libs/fe-next/src/palimp.tsx#L41)) and both adapters treat it as an
  opaque row id — so the namespace collides with nothing and needs no reservation. Entities are
  locale-free; their prose is not, and that is where the prefix belongs (§F).
- **D3 — no live list wrapper in phase 1.** The modal is the editing surface; a structural change
  reaches the page at the next Publish. Strings are live only because each `EditComponent`
  re-reads its own key ([EditComponent.tsx:28-36](../../../libs/core/src/Admin/EditComponent.tsx#L28-L36));
  a server-rendered list has no analogous mechanism, so phase 2 is a different mechanism rather
  than a larger phase 1. §H states what this costs, because it costs more than the index implies.
- **D4 — the build never throws on data.** Invalid *items* are dropped with a loud warning;
  `defaultItems` is the fallback only when the document fails to parse or fails its shape check.
  Palimp's one existing build-time throw is a wiring error
  ([`PalimpBackendAdapterUnsetError`](../../../libs/fe-next/src/palimp.tsx#L11-L18)), never a data
  error, and `p()`'s answer to a missing key is to render the key rather than to fail. Dropping
  loudly is that same instinct one level up.
- **D5 — the minimal seven, Sveltia-named.** `string`, `text`, `number`, `boolean`, `select`,
  `object`, `list`, with `required` / `pattern` / `min` / `max`. `object` and `list` are the two
  that cannot be retrofitted later without reworking the inference, which is the argument for
  taking them now rather than the argument for taking all twenty.

## What is already true

Re-verified against the tree while writing this, not carried over.

- **Values are strings, with no exception.** `Message` is `{ key: string; value: string }`
  ([types.ts:1-4](../../../libs/core/src/types.ts#L1-L4)); Supabase stores `inline(key, value)`
  text; Firestore stores `inline/{key}` with one `value` field, and its client returns `null` for
  a `value` that is not a string
  ([be-firebase/client.ts:91](../../../libs/be-firebase/src/client.ts#L91), already documented at
  [be-firebase/README.md:55](../../../libs/be-firebase/README.md)). Nothing in the workspace
  `JSON.parse`s a stored value today. Phase 1 makes exactly one class of key an exception, and
  encodes it as a **string** on both backends so the Firestore gate keeps passing.
- **Creation is free; deletion does not exist.** `setKeys` is an upsert — one
  `.upsert(rows, { onConflict: "key" })`
  ([be-supabase/client.ts:99-112](../../../libs/be-supabase/src/client.ts#L99-L112)) and one
  atomic `writeBatch` ([be-firebase/client.ts:92-104](../../../libs/be-firebase/src/client.ts#L92-L104))
  — so a key springs into existence on first save. No adapter method removes a row.
- **There is no enumeration.** `loadMessages()` takes no filter and reads the whole table
  ([be-supabase/server.ts:7-27](../../../libs/be-supabase/src/server.ts#L7-L27)); `getKey` reads
  one row. A variable-length list must therefore carry its own index somewhere, which is the whole
  reason for the document shape in §B.
- **The save is all-or-nothing on purpose.** `setKey` stays commented out at
  [PalimpClientBackendAdapter.ts:10](../../../libs/core/src/PalimpClientBackendAdapter.ts#L10).
  `useSaveButton` drains `editsStore`, calls `setKeys` once, clears, then invalidates
  `editQueryKey(key)` for **every** key it wrote
  ([useSaveButton.tsx:13-22](../../../libs/core/src/Admin/Devtools/useSaveButton.tsx#L13-L22)) —
  which is the detail that makes the collection document refresh itself after a save with no
  change to the save path at all. A throw skips `clear()`, so a failed save keeps the drafts.
- **The drawer already hosts a structured editor.** `FieldsModal` renders declared off-page keys
  as labelled `EditComponent`s inside an antd `Modal`
  ([FieldsModal.tsx](../../../libs/core/src/Admin/Devtools/FieldsModal.tsx)), opened from a button
  that shows a count and disables at zero
  ([DevtoolsContent.tsx:47-56](../../../libs/core/src/Admin/Devtools/DevtoolsContent.tsx#L47-L56)).
  The drawer is 192px wide ([Devtools/index.tsx:29](../../../libs/core/src/Admin/Devtools/index.tsx#L29)),
  so anything richer than a button is a `Modal`. That decision is made; phase 1 copies it.
- **`fieldsStore` is the store shape to copy** — a `Map` keyed by *registration id*, a listener
  `Set`, and a snapshot merged on write because `useSyncExternalStore` needs referential stability
  ([fieldsStore.ts:16-54](../../../libs/core/src/Admin/fieldsStore.ts#L16-L54)). `PalimpFields`
  registers from an effect keyed on `JSON.stringify([group, fields])` with `useId()` as the id
  ([PalimpFields.tsx:13-24](../../../libs/core/src/Admin/PalimpFields.tsx#L13-L24)), because hosts
  pass inline arrays whose identity changes every render.
- **The site is a static export.** `output: "export"`
  ([next.config.ts](../../../examples/supabase-next/next.config.ts)); values bake into the HTML at
  build; Publish means rebuild ([architecture.md](../../architecture.md)).
- **Strict flags that shape real code.** `exactOptionalPropertyTypes` and
  `noUncheckedIndexedAccess` on top of `strict`
  ([tsconfig.base.json](../../../libs/tsconfig.base.json)). Both bite in §A, and one of them turns
  out to describe the wire format as well as the type system.

## §A — The schema type, and how item types are inferred

The developer defines fields, types and constraints in code; the owner adds and edits items. That
split is Sveltia's and it is adopted deliberately (D1) — on a static site the render side is
bespoke code anyway, so a field the page's component does not know about cannot render.

New file `libs/core/src/collections.ts`, at the package **root** entry, not `./admin`: it is types
plus one identity function plus a pure validator, so it pulls in nothing and is importable from a
server component, a client component and the build alike.

### The vocabulary

```ts
export type CollectionField =
  | StringField | TextField | NumberField | BooleanField
  | SelectField | ObjectField | ListField;

interface FieldBase {
  readonly name: string;
  readonly label?: string;
  readonly required?: boolean;
}

export interface StringField  extends FieldBase { readonly widget: "string";  readonly pattern?: string; readonly default?: string }
export interface TextField    extends FieldBase { readonly widget: "text";    readonly default?: string }
export interface NumberField  extends FieldBase { readonly widget: "number";  readonly min?: number; readonly max?: number; readonly default?: number }
export interface BooleanField extends FieldBase { readonly widget: "boolean"; readonly default?: boolean }
export interface SelectField  extends FieldBase { readonly widget: "select";  readonly options: ReadonlyArray<string>; readonly default?: string }
export interface ObjectField  extends FieldBase { readonly widget: "object";  readonly fields: ReadonlyArray<CollectionField> }
export interface ListField    extends FieldBase { readonly widget: "list";    readonly fields: ReadonlyArray<CollectionField>; readonly min?: number; readonly max?: number }
```

`string` and `text` infer the same TypeScript type and differ only in the antd control they get
(§D). That is the point of having both, and it is worth saying so where someone will otherwise
try to collapse them.

### The inference

```ts
type FieldValue<F extends CollectionField> =
  F extends { readonly widget: "string" } | { readonly widget: "text" } ? string :
  F extends { readonly widget: "number" } ? number :
  F extends { readonly widget: "boolean" } ? boolean :
  F extends { readonly widget: "select"; readonly options: ReadonlyArray<infer O extends string> } ? O :
  F extends { readonly widget: "object"; readonly fields: infer FS extends ReadonlyArray<CollectionField> } ? CollectionItem<FS> :
  F extends { readonly widget: "list";   readonly fields: infer FS extends ReadonlyArray<CollectionField> } ? ReadonlyArray<CollectionItem<FS>> :
  never;

type Prettify<T> = { [K in keyof T]: T[K] } & {};

export type CollectionItem<FS extends ReadonlyArray<CollectionField>> = Prettify<
  { [F in Extract<FS[number], { readonly required: true }> as F["name"]]:  FieldValue<F> } &
  { [F in Exclude<FS[number], { readonly required: true }> as F["name"]]?: FieldValue<F> }
>;

export interface CollectionSchema<
  F extends ReadonlyArray<CollectionField> = ReadonlyArray<CollectionField>,
> {
  readonly name: string;
  readonly key?: string;
  readonly label?: string;
  readonly idField: F[number]["name"];
  readonly fields: F;
  readonly defaultItems?: ReadonlyArray<CollectionItem<F>>;
}

export const defineCollection = <const F extends ReadonlyArray<CollectionField>>(
  schema: CollectionSchema<F>,
): CollectionSchema<F> => schema;
```

Three things this buys, each of which is the reason for a specific piece of the shape:

- **`const F`** (TS 5.0's const type parameter; the repo is on 6.0.3) means the host writes no
  `as const` at the call site and still gets literal types — so `options: ["a","b"] as const`
  narrows to `"a" | "b"` without ceremony.
- **`idField: F[number]["name"]`** constrains the id to be one of the declared field names. A
  typo there is a compile error, not a collection whose items have no stable identity.
- **`defaultItems?: ReadonlyArray<CollectionItem<F>>`** is checked against the inferred item type,
  so an in-repo seed that does not satisfy the schema fails `check-types` rather than failing at
  build against the validator.

**This was compiled, not reasoned about.** A prototype of exactly the above was typechecked under
`libs/tsconfig.base.json` — same `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`,
`verbatimModuleSyntax`, same compiler. It passes, declaration emit produces a nameable type, and
all five failure cases fail with the errors quoted below. The item type prints legibly, which
`Prettify` is there for and which matters more than it sounds: this type is what a host reads in
an editor tooltip.

```
{ slug: string; title: string; year?: number;
  segment?: "residential" | "civic" | "retail"; area?: number; sample?: boolean;
  gallery?: readonly { id: string; src?: string }[]; consent?: { granted: boolean } }
```

| written                                        | result                                                          |
| ---------------------------------------------- | --------------------------------------------------------------- |
| `{ slug, title, area: undefined }`             | TS2375 — `undefined` not assignable to `number`                   |
| `idField: "nope"`                              | TS2322 — `"nope"` not assignable to `"slug"`                      |
| `defaultItems: [{ year: 2020 }]`               | TS2741 — `slug` missing                                           |
| `defaultItems: [{ slug: "a", year: "2020" }]`  | TS2322 — `string` not assignable to `number`                      |
| `segment: "nope"`                              | TS2322 — not assignable to the options union                      |

### The optional field whose absence is meaningful

This is the case the brief singles out and it is the one that decides whether the whole thing is
usable. The host's motivating field is an optional number that is *absent*, never `0`.

Under `exactOptionalPropertyTypes`, `area?: number` accepts an absent property and rejects an
explicit `undefined` — that is the TS2375 row above. Reading is unaffected: `item.area` is
`number | undefined`, and under `noUncheckedIndexedAccess` an item pulled out of an array is
`Item | undefined` besides, so `items[0]?.area` is the honest spelling.

Two consequences the implementation has to honour, and one gift:

1. **The validator must omit, never assign.** Building `{ area: undefined }` is a type error, so
   items are assembled with the house pattern from
   [publish-github/src/client.ts](../../../libs/publish-github/src/client.ts) —
   `...(present ? { area: value } : {})` — rather than by widening the type.
2. **The modal must delete, never blank.** Clearing an `InputNumber` yields `null`, and writing
   `"area": null` into the document produces an item the validator then drops, because `null` is
   not a number. Clearing a field removes the key from the item.
3. **The gift: `JSON.stringify` agrees.** `JSON.stringify({ a: undefined })` is `"{}"` — the wire
   format cannot represent an explicit `undefined` either. So "absent means absent" is not a
   TypeScript nicety imposed on the storage; it is the only thing the storage can express, and
   `exactOptionalPropertyTypes` happens to describe it exactly. An item that round-trips through
   a save comes back identical, which would not be true if optional-and-`undefined` were legal.

### What the inference does not do

It is a compile-time promise about the *schema*. At runtime `collection()` receives `unknown` from
`JSON.parse` and ends with a single cast, gated on validation having passed. There is no way
around that and pretending otherwise would be worse than saying it: **the validator is the only
thing that makes the cast true, so its coverage must match the `FieldValue` table row for row.**
That correspondence is the one invariant in this plan worth a comment in the source.

## §B — The document format and its validation

One collection is one storage key. Its value is a JSON document, stored as a string:

```json
{ "v": 1, "items": [ { "slug": "vila-na-kopci", "year": 2024, "gallery": [] } ] }
```

The load-bearing property is that **the document is the enumeration**, which dissolves the three
missing primitives without touching a contract: enumerate is the array, and create / delete /
reorder are all "save the new document" — one `editsStore` entry riding the existing atomic batch.
The key is `schema.key` or `collection.<name>` (D2), resolved by a `collectionKey()`
helper exported beside the types so the modal, the reader and the host all compute it identically.

`v` is the format version and it exists for one reason: the per-item-key storage mode the
exploration keeps in reserve. A phase-1 reader that meets `v: 2` cannot guess at a later writer's
format, so it treats the document as unreadable rather than as partly readable.

### The parse ladder

`parseCollectionDocument(schema, raw)` lives in `libs/core/src/collections.ts` — pure, no React, no
antd — and returns `{ items, problems }`. `collection()` logs the problems; the modal renders them
inline. Sharing one function is what makes the modal and the build agree by construction rather
than by discipline.

| # | condition                                          | result                                              |
| - | -------------------------------------------------- | --------------------------------------------------- |
| 1 | no row for the key                                 | `defaultItems ?? []`, **no warning** — an empty database changes nothing |
| 2 | `JSON.parse` throws                                | `defaultItems ?? []`, loud warning                   |
| 3 | not an object, `items` not an array, or `v !== 1`  | `defaultItems ?? []`, loud warning                   |
| 4 | an item fails validation                           | that item dropped, one warning naming it; the rest survive |
| 5 | every item fails                                   | `[]`, **not** `defaultItems`                        |

Row 5 is the one that needs defending. The document exists, so the owner has edited it; falling
back to the in-repo seed would resurrect content they deleted, which is a worse failure than an
empty section. Rows 2 and 3 are different — there the owner's intent is unreadable, and the seed
is the only thing left that is known-good.

Warnings carry a stable prefix, `palimp: collection "varieties" —`, followed by the item index,
the id if one could be read, and the field and reason. That is greppable in a CI log, which is
where it will actually be read.

### The validation rules

Per item: every `required: true` field must be present and well-typed; a present optional field
must be well-typed; `pattern` must match; `min`/`max` must hold for numbers and for list lengths;
a `select` value must be one of `options`; `object` and `list` recurse, and a bad child invalidates
the whole item. The `idField` must be present, a non-empty string, and unique in the document —
a duplicate invalidates the *later* item, first occurrence winning, because ids derive prose keys
(§F) and two items sharing one would silently share their prose.

Two rules that are choices rather than consequences:

- **Unknown keys in a stored item are dropped, not rejected.** Removing a field from a schema must
  not invalidate every item written before the removal. The dropped keys are lost on the next
  save, which is the cost of not keeping them.
- **A malformed `pattern` disables that check and warns once**, rather than invalidating the
  collection. A bad regex is a developer's typo, and punishing the owner's data for it is the
  wrong direction.

Validation is display-only in the modal: it marks fields and items, and it never blocks a
keystroke. Blocking would mean silently discarding what the owner typed — the failure mode
`editsStore` exists to prevent.

## §C — Where the code lands

This is a feature, and [architecture.md](../../architecture.md#why-the-design-is-adapter-shaped)
is explicit that features legitimately move `core` — "adapters isolate implementations, not
features". The be-firebase "Files modified: None" bet stays intact because no adapter file
changes. If a draft of this touches one, the design is wrong, not the constraint.

| package                     | new                                                                                      |
| --------------------------- | ---------------------------------------------------------------------------------------- |
| `core` (root)               | `collections.ts` — the types, `defineCollection`, `collectionKey`, `parseCollectionDocument`, `serializeCollectionDocument`; re-exported from `index.ts` |
| `core/admin`                | `collectionsStore.ts`, `Devtools/CollectionsModal.tsx`, `PalimpCollections.tsx` (the registrar), a drawer button in `DevtoolsContent.tsx` |
| `fe-next`                   | `collection()` in `palimp.tsx` (same cached read), `PalimpCollections.tsx` (server) + a client registrar module |
| `examples/*`                | `app/collections.ts`, the varieties section rewritten, `app/palimp.ts` re-exporting `collection` |

Nothing else moves. `editsStore`, `useSaveButton`, `EditComponent`, the contexts and all four
contracts are untouched — the same claim §B2 of [host-adoption.md](../host-adoption.md) made about
the Fields modal and kept.

## §D — The modal

An antd `Modal`, for the reason the Fields modal is one: the drawer is 192px. The drawer gains a
button beside **Fields**, labelled `Collections (N)` and disabled at zero with "No collections",
mirroring [DevtoolsContent.tsx:47-56](../../../libs/core/src/Admin/Devtools/DevtoolsContent.tsx#L47-L56)
exactly.

### Layout

`width={880}`, and three regions:

- **Tabs across the top**, one per registered collection, labelled `schema.label ?? schema.name`.
  A dot on the tab when that collection has a pending draft. With one collection the tab strip is
  still shown — a stable layout beats a conditional one, and the strip is where the dirty dot
  lives.
- **A left rail, the item list.** An antd `List`, one row per item, showing the `idField` value
  (falling back to `#<index>` when it is empty or invalid), a dirty mark, and a validity mark. Row
  controls: duplicate, delete, move up, move down — four small icon buttons, no drag-and-drop in
  v1. **Add item** sits under the list.
- **A right pane, the item editor.** The generated form for the selected item: one control per
  field, `Form` in `layout="vertical"`, errors rendered under each control through
  `Form.Item`'s `validateStatus` / `help`, computed by the shared validator from §B.

The list scrolls independently of the editor, both inside a `maxHeight: "70vh"` body. Selection is
a `useState<number | null>`; after a delete it moves to the neighbour, after an add to the new
item, and after a move it follows the item rather than the position. Empty state is antd `Empty`
with "No collections are declared on this page.", the same as `FieldsModal`.

**The modal has no Save button.** There is exactly one save in palimp and it lives in the drawer.
Adding a second commit affordance here would create a place where an owner can believe their work
is committed when it is only drafted.

### Widgets

| widget    | antd control                    | cleared →                                      |
| --------- | ------------------------------- | ---------------------------------------------- |
| `string`  | `Input`                         | `""` when required, key deleted otherwise      |
| `text`    | `Input.TextArea` (`autoSize`)   | as above                                       |
| `number`  | `InputNumber`                   | key deleted (never `null` — §A)                |
| `boolean` | `Switch`                        | n/a — see the quirk below                      |
| `select`  | `Select`, `allowClear` when optional | key deleted                               |
| `object`  | bordered group, recursive       | —                                              |
| `list`    | bordered repeater with add / remove / move, recursive | `[]`                     |

`object` and `list` are rendered by the same recursive `FieldControl` component that renders the
top level; the item editor is that component applied to `schema.fields`, which is why nesting is
free once the recursion exists and expensive to add afterwards (D5).

**The boolean quirk, stated because it will otherwise be found the hard way:** a `Switch` has no
empty state, so an *optional* boolean cannot be returned to absent through the modal. Once
touched it is `true` or `false` forever. A field whose absence is meaningful should be a `number`
or a `select`; a boolean that gates rendering wants `required: true` with a `default`.

### The interaction guard is not involved here

Worth checking rather than assuming, because the Fields modal has the opposite property. The
window-capture guard fires only for events originating inside `[data-palimp-editor]`
([interactionGuard.ts](../../../libs/core/src/Admin/interactionGuard.ts), and the quirk in
[core/README.md](../../../libs/core/README.md#quirks) about Escape not closing the Fields modal).
The collections modal's controls are ordinary antd inputs, not `EditComponent`s, so nothing marks
them and the guard never sees their events: **Escape closes this modal normally.** That difference
between two modals in the same drawer is exactly the kind of thing that reads as a bug later, so it
is written down here and belongs in the verification pass.

### Draft granularity: per keystroke

Every change to the working document — a keystroke, a toggle, an add, a delete, a move —
re-serializes and calls `editsStore.set(collectionKey, json)`.

The alternative was a local working copy with an explicit **Apply** per item. It was rejected, and
the reason is not performance: a per-item buffer is a second draft layer that the drawer's badge
cannot see, so a half-typed item is lost when the modal closes, and — worse — an item can look
committed while sitting outside the batch that Save writes. Everything the repo does around
`editsStore` is arranged so that what the admin typed is what Save writes, including a failed save
keeping the drafts. Per keystroke inherits all of that for free and matches `EditComponent`, where
typing *is* the commit-to-draft.

The cost is that there is no per-item cancel. The single escape hatch is a **Discard changes**
button per collection, which is one call — `editsStore.delete(collectionKey)` — and restores the
fetched document. It gets a confirm, because it discards every item's changes at once.

The working document resolves as `pending ?? parsed(getKey()) ?? staleDocument`, which is
`EditComponent`'s `pending ?? data ?? staleValue` chain with the same three links and the same
meanings ([EditComponent.tsx:36](../../../libs/core/src/Admin/EditComponent.tsx#L36)). The
`useQuery` uses `editQueryKey(collectionKey)` — the *same* key an `EditComponent` would use — so
`useSaveButton`'s existing invalidation loop refreshes it after a save with no save-path change.
The `staleDocument` link is what §E is about.

### What the badge counts

`editsStore` entries, unchanged. A collection is one entry, so adding three items, reordering them
and deleting a fourth shows as **`Save (1)`**; add an inline prose edit and it is `Save (2)`.

That is under-reporting, and it is accepted rather than fixed. The badge's meaning is "unsaved
things", where a thing is a key — teaching it about collections would mean teaching `editsStore`
about them, and `editsStore` knowing nothing about its values is why it has survived three features
unchanged. The compensation is local: a dirty dot on the collection's tab, and a dirty mark per
changed item using the same cyan `boxShadow` idiom `EditComponent` uses for `touched`
([EditComponent.tsx:38](../../../libs/core/src/Admin/EditComponent.tsx#L38)).

### collectionsStore

A twin of `fieldsStore`, and deliberately a near-copy: `Map` keyed by registration id, listener
`Set`, snapshot merged on write for the `useSyncExternalStore` reason
([fieldsStore.ts:23-26](../../../libs/core/src/Admin/fieldsStore.ts#L23-L26)). One difference —
deduplication is by **resolved storage key**, not by collection name, because `key` can be
overridden and two names mapping to one key is the collision that actually matters. First
registration wins, as with fields.

## §E — Registration and what it costs in the flight payload

The exploration proposed `<PalimpCollections collections={[projects]}>` as "the `PalimpFields`
pattern one level up". **Reading the code changed this**, and it is the one design departure in
this plan.

`PalimpFields` in `fe-next` is a client component
([PalimpFields.tsx](../../../libs/fe-next/src/PalimpFields.tsx)) that returns `null` for visitors —
and its props serialise into the flight payload regardless, because the `admin` check runs in the
browser after the server has rendered. That is the finding §B2's divergence note recorded and the
quirk now in [fe-next/README.md](../../../libs/fe-next/README.md#quirks). Copying the shape
verbatim would ship the schema **plus `defaultItems`** — the entire in-repo seed dataset, a second
copy of content the page has already rendered into the HTML.

So `<PalimpCollections>` is an **async server component**, `fe-next`'s first:

```tsx
export const PalimpCollections = async ({ collections }: { collections: ReadonlyArray<CollectionSchema> }) => {
  const registrations = await Promise.all(
    collections.map(async (schema) => ({
      declaration: toDeclaration(schema),            // Omit<CollectionSchema, "defaultItems">
      staleDocument: await resolveDocument(schema),  // the row, or the serialized defaults
    })),
  );

  return <PalimpCollectionsClient registrations={registrations} />;
};
```

`resolveDocument` reads the same `cache()`d `loadMessages()` the page already called, so it costs
nothing extra. The client half is the `PalimpFields` shape unchanged: `"use client"`, gate on
`PalimpGeneralContext.admin`, `next/dynamic` into `@palimp/core/admin`.

What this buys: the payload carries a lean declaration plus **one** copy of the item data — the row
if there is one, the serialized seed if there is not — never both, and never `defaultItems` on top
of a row. And the modal gets a proper third link for its resolve chain, which the client-only shape
could not supply.

**Computed for the dogfood** (§G), as serialized prop bytes:

| | bytes |
| --- | --- |
| declaration, `defaultItems` stripped | 291 |
| stale document, as a payload string | 179 |
| three derived-body `p()` props | 482 |
| **after** | **952** |
| the six `varieties.*` `p()` props today | 648 |

**+304 bytes** for the section. Shipping `defaultItems` as well would add ~472 more, and unlike the
schema that number grows with the content rather than with the declaration. These are computed
prop sizes, not a measured payload — the real flight payload has framing overhead, and the
verification pass below requires confirming them against a real `out/index.html`, which is the
precedent §B2 of [host-adoption.md](../host-adoption.md) set when it measured rather than asserted.

Two costs of the server-component shape, both worth documenting where a host will hit them:

- **It cannot be rendered inside a `"use client"` subtree.** The failure is Next's "async/await is
  not yet supported in Client Components", which does not obviously point back here.
- **It awaits `loadMessages()`**, so a page that renders it without ever calling `palimp()` still
  needs `setBackendAdapter()` to have run — the same `PalimpBackendAdapterUnsetError` and the same
  "import it from your registration module" rule as
  [app/palimp.ts](../../../examples/supabase-next/app/palimp.ts) already states for `palimp`.

### The reader

`collection()` sits beside `palimp()` in `fe-next`, off the same cached read:

```ts
export const collection = async <const F extends ReadonlyArray<CollectionField>>(
  schema: CollectionSchema<F>,
): Promise<ReadonlyArray<CollectionItem<F>>> => { … };
```

It returns the array directly rather than `{ items }` — the caller's next move is `.map`, and
`palimp()` returns an object only because `p` needs a closure. Problems go to `console.warn` with
the §B prefix and are not returned; a host that wants them structured is phase 4's problem, and
inventing the reporting shape now would fix it before anyone has asked for it.

`collection()` is usable in `generateStaticParams`, which is what makes an owner-added item mint
its per-slug routes at the next Publish. That is the phase-1 payoff for a host with per-item pages.

## §F — Prose stays flat keys

The document holds *facts*. Sentences stay ordinary palimp keys derived mechanically from the
item's id: `varieties.<id>.body`, with the host's locale prefix in front where it has one. Derived
keys need no registration, because upsert creates rows on first save — which answers, word for
word, the objection that adding an item would mean a developer registering keys.

Three things fall out. In-place editing of item prose keeps working untouched, including inside
linked cards, which is the case the v1.4.0 window-capture guard was built for
([interactive-ancestors.md](../interactive-ancestors.md)). Entities stay locale-free, so `Message`
never needs a locale field and the locale problem stays where the host already solved it. And a
fresh item's prose key has no row and no `defaultMessage`, so `p()` renders the key itself — the
documented "make missing content obvious rather than blank" behaviour — with an inline editor
already attached, because `p()` returns an element.

**Phase 1 does not formalize the key-derivation helper.** The host writes the template itself.
A helper wants to know about locale prefixes and about phase 2's client wrapper, and fixing its
shape before either exists would be guessing. It is listed in phase 2's scope for that reason.

## §G — The dogfood

The three hardcoded variety cards at
[page.tsx:80-119](../../../examples/supabase-next/app/page.tsx#L80-L119) are a fixed-cardinality
collection. They become a real one.

`app/collections.ts`:

```ts
export const varieties = defineCollection({
  name: "varieties",
  idField: "id",
  fields: [
    { name: "id",       widget: "string",  required: true, pattern: "^[a-z0-9-]+$", label: "Id (slug)" },
    { name: "name",     widget: "string",  required: true, label: "Name" },
    { name: "featured", widget: "boolean", label: "Featured" },
  ],
  defaultItems: [
    { id: "gros-michel", name: "Gros Michel", featured: true },
    { id: "manzano",     name: "Manzano" },
    { id: "red-dacca",   name: "Red Dacca" },
  ],
});

export const varietyBodies: Record<string, string> = { /* the three existing card bodies */ };
```

The page maps items and reads each body through a derived key:

```tsx
const items = await collection(varieties);
…
{items.map((v) => (
  <div key={v.id} style={styles.card}>
    <h3 style={styles.cardTitle}>{v.name}{v.featured ? " ★" : ""}</h3>
    <p style={styles.cardBody}>
      {p(`varieties.${v.id}.body`, {
        ...(varietyBodies[v.id] ? { defaultMessage: varietyBodies[v.id] } : {}),
      })}
    </p>
  </div>
))}
```

This is chosen to exercise both halves of the design in one place: `name` is a fact, modal-edited
only; the body is prose, edited inline where it sits. The `varietyBodies` lookup is the documented
adoption pattern from [fe-next/README.md](../../../libs/fe-next/README.md) — keep the host's
dictionary, pass its value as `defaultMessage`, let rows be overrides — and the spread is forced by
`noUncheckedIndexedAccess` making `varietyBodies[v.id]` a `string | undefined`, the same
`exactOptionalPropertyTypes` pattern already demonstrated at
[seo.ts:23-26](../../../examples/supabase-next/app/seo.ts#L23-L26). `varieties.title` stays an
ordinary `p()`: it is copy about the section, not a fact about an entity.

`<PalimpCollections collections={[varieties]} />` goes beside the existing `<PalimpFields>`, and
`app/palimp.ts` re-exports `collection` next to `palimp` so the registration cannot be skipped.

**Two things to say out loud about the dogfood.** The six `varieties.one.*` … `varieties.three.*`
rows become orphans in the demo database — there is no delete primitive, so they stay. That is not
new (any renamed key does it) but a collection migration is the first time it is visible, and the
landing note should say the demo database has stale rows rather than leaving someone to find them.

And **the firebase example gets the same conversion**, which is a small addition to the phase-1
scope the index lists. Two reasons: verification item 4 needs the document round-tripped through
Firestore as a string, and that path only exists if the firebase example declares a collection; and
the two example pages are identical by construction, so a divergence here would be an accident
rather than a decision. The `@ts-expect-error` fixtures below live only in the supabase example.

## §H — What phase 1 deliberately does not do

1. **No live rendering of structural changes** (D3). A string edit appears immediately because
   `EditComponent` re-reads its key; an added item does not, because the list is server-rendered.
   The sharp version, which the index understates and which belongs on the record: adding an item
   *with prose* takes **two publish cycles** — add and Save, Publish, the card appears with its key
   as its body text, type the body inline, Save, Publish. The phase boundary still holds, because
   phase 2 is a genuinely different mechanism (a client wrapper and a host-supplied client render
   component) rather than more of phase 1. But phase 2 is not polish, and its plan should open with
   this sentence rather than with the payload measurement.
2. **No media.** Image fields are string paths; assets land in the repo by PR. The
   `PalimpMediaAdapter` seam is phase 3 and is the one phase that touches the backend packages —
   as new files implementing a new optional contract, never as a change to the storage contract.
3. **No relations and no conditional fields** (`showWhen`). Both are field-spec flags on the same
   shape, not architecture, and both are phase 4.
4. **No drag-and-drop.** Move up / move down only. Reordering by hand is tedious at forty items and
   fine at eight, which is the scale everything else here assumes.
5. **No adapter or contract change.** Zero files under `libs/be-*` and `libs/publish-github`.
6. **No structured error reporting from `collection()`.** Warnings only, with a greppable prefix.
7. **No concurrency control.** Two admins editing different items of one collection overwrite each
   other; today's per-key model has the same failure one level finer. A `version` check would need
   a conditional write the contract cannot express, so it is out of scope and recorded rather than
   solved.
8. **No size bounds.** Firestore caps a document at 1 MB and `loadMessages()` reads the whole table
   per build. Both assume dozens-of-items collections.

## Alternatives weighed and rejected

- **An entity as a bundle of flat keys** (`projects.brno.year`, …). No enumeration, no types, no
  repeatable gallery, and a developer registering keys for every new item. §A and §B answer each
  point; the document is what a key bundle cannot be.
- **Per-item keys plus an index key, now.** Finer saves and kinder concurrency, at the price of
  re-opening everything the document shape closed: deletion has no primitive, so removed items
  leave orphan rows unless the index is authoritative, and it eventually forces a `deleteKeys`
  change through `core` and both backends. Kept as a storage-mode evolution; `v` exists so that
  switch is a migration rather than a redesign.
- **New adapter methods** (`listKeys(prefix)`, `deleteKeys`, subscriptions). Moves three packages
  for capabilities the document shape gets free at this scale.
- **A per-item Apply button** instead of per-keystroke drafts. Rejected in §D: a second draft layer
  the badge cannot see, and an item that can look committed while sitting outside the batch.
- **`<PalimpCollections>` as a client component**, the `PalimpFields` shape verbatim. Rejected in
  §E: it ships `defaultItems` into the flight payload on top of the content already in the HTML,
  and it cannot hand the modal a stale document.
- **A host-side `"use client"` module importing the schema**, keeping the declaration out of the
  payload and in a client chunk instead. Same bytes down a different pipe, eagerly in the visitor's
  JS unless the host wraps it in `next/dynamic`, and it makes every host write a boilerplate
  boundary module.
- **A hard build failure on an invalid document** (D4). One bad row bricks Publish for the whole
  site, prose included, and Publish is a button an owner presses.
- **Coercing invalid items** — filling missing required fields with zero values so nothing
  disappears. Writes fiction into the page and makes `required` meaningless at build.
- **A runtime schema-builder**, with owner-defined fields. Pays off only with fully generic
  rendering; palimp's identity is "your markup, your page". §A's spec is data-shaped enough that
  storing it under a key later is not a rewrite.
- **Embedding Sveltia CMS** (D1). The buy option, with a real media library today, at the cost of a
  second login world, a second editing UI, and content forked across git and the database. It stays
  the fallback if media becomes central; its vocabulary is adopted meanwhile.

## Documentation to update when it lands

- [libs/core/README.md](../../../libs/core/README.md) — the `./admin` entry-point line; a
  `### Collections` section under "The admin UI"; `### collectionsStore` beside `### fieldsStore`.
  **Quirks:** whole-collection last-write-wins between two admins; the badge counts a collection as
  one edit however many items changed; an optional boolean cannot be returned to absent through the
  modal; `select` options that are not `as const` degrade the inferred type to `string`.
- [libs/fe-next/README.md](../../../libs/fe-next/README.md) — a `### Collections` usage section
  showing `defineCollection`, `collection()` and `<PalimpCollections>`. **Quirks:**
  `<PalimpCollections>` is the package's only server component and cannot be rendered inside a
  `"use client"` subtree; the declaration and the stale document ship in the flight payload (the
  `PalimpFields` quirk restated for a bigger object); a structural change reaches the page only at
  the next Publish; a new item's prose key renders as the key until it is typed into, which is the
  two-publish-cycle note from §H.
- [docs/architecture.md](../../architecture.md) — a bullet under **Render, edit, save** on the
  document-in-a-key shape and on `Message.value` being JSON for exactly one class of key, plus the
  note that the collections modal is outside the interaction guard's reach while the Fields modal
  is inside it.
- **The backend READMEs do not change.** `be-firebase`'s existing line about `getKey` returning
  `null` for a non-string `value` already covers the one constraint collections add. If a draft of
  this needs a backend README edit, the design has gone wrong.

## Verification

1. **`pnpm check-types` across libs.** The gate, and for this feature it is also the test suite:
   the example carries `@ts-expect-error` fixtures asserting that the five §A failure cases still
   fail — `area: undefined`, a bad `idField`, `defaultItems` missing a required field, a wrongly
   typed `defaultItems` value, and a `select` value outside its options. The repo has no tests, so
   `@ts-expect-error` inside a compiled example is the only way to make a type guarantee something
   that breaks when it stops holding.
2. **`pnpm build`.** Each `dist/` still matches its `exports` map, and `@palimp/core/admin` is
   still the only place antd, react-query and lucide appear.
3. **A real static export of the supabase example**, with §B's stub server adapter — no
   credentials needed, because this half is a build-time question. Confirm: no editor markup in
   `out/index.html` for a visitor; no collections code in any eagerly loaded chunk (and prove the
   grep non-vacuous by finding it in the lazy one); and **measure** the flight-payload delta
   against §E's +304-byte estimate rather than accepting the estimate.
4. **Document round-trip on both backends.** Through Supabase `text` and through Firestore as a
   **string** — the `typeof value === "string"` gate at
   [be-firebase/client.ts:91](../../../libs/be-firebase/src/client.ts#L91) must still pass. Include
   a unicode item name and a body containing quotes and a newline.
5. **Validator fixtures**, run against the built `dist` with `node -e` and no backend at all: an
   unknown field key (item survives), a missing required field (dropped, warned), a duplicate id
   (later one dropped), `v: 2` (whole document falls back to defaults), malformed JSON (same), a
   `select` value outside its options (dropped), every item invalid (empty array, *not* defaults).
   This is the one behavioural part of phase 1 that can be checked without credentials, so it
   should be checked.
6. **The credentialed manual pass — no build covers any of this.** The admin path mounts only
   behind `hasSession()`, so nothing below is reachable from CI:
   - add, edit, duplicate, reorder and delete an item; the list selection follows the item through
     each;
   - the badge reads `Save (1)` after a structural change and `Save (2)` with a prose edit
     alongside it, and the collection's tab carries a dirty dot while changed items carry a dirty
     mark;
   - Save writes the document and the derived prose key in **one** `setKeys` batch;
   - a failed save (throttle or offline) retains the draft, and reopening the modal still shows it;
   - **Discard changes** restores the fetched document and clears the badge entry;
   - Escape closes the collections modal (§D — the guard is not involved here, unlike the Fields
     modal), and the item editor's controls take focus normally;
   - Publish, then confirm the added item's card renders after the rebuild, and its per-slug route
     appears where `generateStaticParams` is used;
   - clearing an optional number field removes it from the document rather than storing `null`.

Ask for real Supabase or Firebase credentials rather than reporting the feature verified on types
and a static export alone. **If item 6 was not run, the landing note says so, item by item** — that
is the house rule from [host-adoption.md](../host-adoption.md) and the reason its own divergence
notes are trustworthy.

---

## Divergence note (2026-08-19, implementation)

Built as specified, with the following departures — each found by building, none by preference.

1. **`@palimp/core` grew a third entry point, `./collections`.** The module still lives at the
   package root and is still re-exported from `index.ts` as planned — but the root entry also
   re-exports the three React contexts, and a module that calls `createContext` cannot be
   imported from a server component. `collection()` and `<PalimpCollections>` are exactly that,
   so the static-export build (verification item 3) failed until server-side code had a pure
   subpath to import. Nothing about the design moved; the plan's "importable from a server
   component" claim just turned out to require its own `exports` entry, not only root placement.
2. **The shared validator is two exported layers, not one function.** The plan had the modal and
   the build sharing `parseCollectionDocument`. But parse *drops* invalid items, and §B also says
   modal validation is display-only and must keep them editable — one function cannot do both.
   Shipped: `readCollectionDocument` (the shape gate, rows 2–3) and `validateCollectionItems`
   (per-item problems plus the unknown-key restriction), with `parseCollectionDocument` composed
   from them. Build and modal still agree by construction; they just share the two halves rather
   than the composition.
3. **The §E payload estimate held in the props but not in the framing: measured +698 bytes, not
   +304.** Stub-adapter static export, `out/index.html`: 25,439 → 26,137. The registration row
   carries the estimated prop bytes plus flight overhead the estimate excluded by its own
   admission — the client-module reference row (~167 B) and the double escaping of
   `staleDocument` inside the flight string. `defaultItems` confirmed absent from the payload
   when a row exists; the visitor HTML carries no editor markup; the modal code appears in
   exactly one chunk, which no eager script tag references.
4. **The §G snippet's inline spread does not compile.** `varietyBodies[v.id]` is
   `string | undefined` under `noUncheckedIndexedAccess`, and truthiness does not narrow an
   element access whose key is a property chain — so the lookup is hoisted to a
   `const body = varietyBodies[v.id]` and the spread tests that. Same pattern, one line earlier.
5. **Small unplanned decisions, recorded:** `<PalimpCollections>` awaits `loadMessages()` once
   and maps, rather than a per-schema `resolveDocument` (equivalent, one read either way);
   **duplicate** copies the item verbatim, so the copy is immediately marked invalid (duplicate
   id, first occurrence wins) until renamed; a new item applies declared `default`s, starts a
   required string at `""` and a required boolean at `false`, and leaves a required number or
   select absent — inventing a value would be the coercion §B rejects; the type-fixture file is
   `app/collections.fixtures.ts`, and the TS2375 case's `@ts-expect-error` sits above the whole
   declaration because that is where the compiler reports it.

**Landing notes.** The six `varieties.one.*` … `varieties.three.*` rows become orphans in both
demo databases — there is no delete primitive, so they stay; not new (any renamed key does it)
but first visible here. Verification status, item by item: 1, 2, 3 and 5 ran and pass (the
validator fixtures cover all seven §B cases plus round-trip, pattern and warn-once). **Items 4
and 6 ran 2026-08-20 against real Supabase credentials**, CDP-driving a signed-in session in the
dev server: add / edit / duplicate / reorder / delete with selection following the item
throughout; per-keystroke drafts with the tab dot and per-item dirty marks; the badge counting
the collection as one entry; **one** `setKeys` POST carrying the document and the derived
`varieties.gros-michel.body` prose key together; an aborted save retaining both drafts and the
reopened modal still showing them; Discard restoring the fetched document and clearing the badge
entry; Escape closing the collections modal with the caret in a field; a fresh item's card
rendering its own derived key with an inline editor attached after reload; and a cleared
optional number saving as an absent key (`rank: 7` → cleared → key gone, never `null`). The
stored row round-trips as a string with a unicode-plus-quotes item name and a
newline-plus-quotes prose body intact. A real Publish was also fired from the drawer:
the dispatch returned 204, the drawer entered its "Publishing..." state, and the Pages deploy
completed successfully (confirmed by the user on GitHub; the drawer's own completion icon was not
re-checked) — but the workflow builds `main`, which predates this branch, so the deployed site
correctly shows the old cards. **Still not run:** the Firestore half of item 4 (no Firebase credentials were available);
the added-item-renders-after-rebuild half of the Publish check, which stays unexercisable until
this branch is what the deploy workflow builds; and the per-slug `generateStaticParams` check,
which the examples cannot exercise — neither has a per-slug route.
