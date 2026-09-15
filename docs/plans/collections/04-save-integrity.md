# Collections, phase 4 — save integrity

**Status:** proposed · **Date:** 2026-09-15 · **Branch:** `pr/08-collections`

Phases 1–3 made the modal honest about invalid items and the build strict about them, and left a
gap between the two that nobody walked through: **Save**. The modal marks an invalid item and
keeps it editable (validation is display-only, phase 1 §B, for a reason that still holds). The
build drops it with a `palimp: collection` warning (D4). Between those two sits a Save button in
the drawer that knows nothing about collections, so an owner can commit a document whose items
will not publish, and be told by nobody but the build log.

The host found this while planning its own phase, checking the source rather than assuming: a
duplicate slug is shown as a problem in the modal, saves anyway, and is then missing from the
site. For the host it really is build-log-only — it renders its collection without
`<PalimpCollectionList>`, so there is no live card to vanish. And the likeliest way to get there
is not a typo: it is the modal's own **Duplicate** button, which clones the item id and all, so
every copy is invalid the moment it exists.

Phase 4 closes the gap from both ends and adds the attribute the host asked for alongside:

- **Duplicate produces a valid copy** (§C) — the id, and any other unique text field, gets a
  `-copy` suffix.
- **Save asks before committing items that will not publish** (§A) — a confirm listing them,
  with "Save anyway". Not a block.
- **`unique`**, a field attribute beside `required` (§B), which generalises the id rule the
  validator already enforces to any scalar field the host needs distinct — the obvious one being
  a second slug-like field, or a name that must not repeat.

No contract moves, no adapter file changes, `fe-next` ships zero code changes, and the build's
behaviour is unchanged except that `unique` gives it one more reason to drop an item — which is
exactly why the confirm lands in the same phase.

This phase re-opens the README's "phase 4 — demand-driven extensions" slot with a scope the host
asked for, rather than one of the three it listed; the extensions slot moves to phase 5
unchanged. Earlier plans that say "phase 4" mean the extensions.

## The decisions this plan is built on

Three gates, answered 2026-09-15 in this planning session before the rest of the file was
written. Recorded in the [decision log](README.md#decision-log) as D15–D17.

- **D15 — Save confirms; it does not block.** The user's call, and the reason survives reading
  the save path: `useSaveButton` drains every pending entry into one `setKeys` batch
  ([useSaveButton.tsx:13-21](../../../libs/core/src/Admin/Devtools/useSaveButton.tsx#L13-L21)),
  all-or-nothing by design (the reason `setKey` is commented out of the client contract). A
  disabled Save would hold every other pending edit on the page — prose, fields, other
  collections — hostage to one bad slug, and an unsaved draft is the loss `editsStore` exists to
  prevent. A confirm puts the consequence at the moment of commit, where the owner can act on
  it, and still lets them keep a half-finished item without losing the rest. Saving an invalid
  item loses nothing either: it stays in the stored document, marked in the modal, and publishes
  the moment it is fixed.
- **D16 — `unique` is an attribute on `FieldBase`, meaningful on scalar widgets, scoped to the
  nearest enclosing array.** Exact-match, first occurrence wins, the later item invalid —
  the id rule verbatim. Empty and absent values never collide, so an optional unique field stays
  optional. It applies to `string`, `text`, `number`, `select` and `image`; on `boolean`,
  `object` or `list` it is a **schema problem** (warned once, check ignored), not a compile
  error — measured, not assumed: a `unique` property on a boolean field inside
  `defineCollection`'s `const F` inference compiles cleanly, because excess-property checks do
  not run against an inferred type parameter, so narrowing the attribute to the scalar
  interfaces would buy nothing but a false promise. The scope rule answers the one ambiguous
  case: a `unique` field inside a `list` is unique among that list's entries within one item,
  not across every item's lists — the reading that matches what a list entry is.
- **D17 — Duplicate makes the copy valid by construction.** The id field and every `unique`
  `string`/`text` field outside a `list` get a `-copy` suffix, then `-copy-2`, `-copy-3`, the
  first value no other working item holds. `unique` `number`, `select` and `image` fields are
  **left out** of the copy — there is no safe suffix for them, and inventing one is the
  coercion phase 1 §B rejects; if the field is required, the validity mark says what is missing,
  exactly as for a fresh item. Lists are copied whole, so uniqueness inside them is preserved.
  Prose rows are not copied (§C says why).

## What is already true

Re-verified against the tree, phases 1–3 as landed.

- **The build and the modal already share one validator**, and it already enforces uniqueness
  for one field: `validateCollectionItems` tracks `seenIds` and marks a repeated id "duplicate id
  … — the first occurrence wins"
  ([collections.ts:434-465](../../../libs/core/src/collections.ts#L434-L465)).
  `parseCollectionDocument` drops whatever it marks
  ([collections.ts:545-568](../../../libs/core/src/collections.ts#L545-L568)), and
  `LiveCollectionList` drops the same items silently on the admin's page
  ([LiveCollectionList.tsx:91-98](../../../libs/core/src/Admin/LiveCollectionList.tsx#L91-L98)).
  Anything this phase adds to the validator reaches all three surfaces with no further code.
- **Validation in the modal is display-only, and the reason still holds.** Blocking a keystroke
  would discard what the owner typed. Nothing in this phase changes that — the confirm is on
  Save, not on input.
- **Save does not know collections exist.** `useSaveButton` reads `editsStore.entries()` and
  writes them; the drawer's button is `Save (n)`
  ([DevtoolsContent.tsx:44-46](../../../libs/core/src/Admin/Devtools/DevtoolsContent.tsx#L44-L46)).
  `collectionsStore` holds every registered declaration keyed by resolved storage key
  ([collectionsStore.ts](../../../libs/core/src/Admin/collectionsStore.ts)), which is exactly the
  lookup Save needs to recognise a pending entry as a collection document.
- **Duplicate clones the whole item** —
  `next.splice(index + 1, 0, structuredClone(workingItems[index]))`
  ([CollectionsModal.tsx:183-188](../../../libs/core/src/Admin/Devtools/CollectionsModal.tsx#L183-L188))
  — so the copy's id always equals the original's, and the copy is invalid on creation. This is
  the likeliest path to the host's lost project.
- **A malformed `pattern` is the precedent for a developer-side problem**: it disables its check
  and is reported once through `schemaProblems`, shown as an `Alert` in the modal and warned at
  build ([collections.ts:271-286](../../../libs/core/src/collections.ts#L271-L286)). A misplaced
  `unique` is the same class of mistake and takes the same route.
- **The only confirm in the admin UI is a `Popconfirm`** (Discard changes). The drawer is 192 px
  wide, so a list of problem items does not fit a popover anchored to it; antd's
  `Modal.useModal()` is the right tool, and the hook form — not static `Modal.confirm` — because
  static methods cannot consume context and would render outside the host's antd theme.

## §A — The Save confirm

### What counts

A pending `editsStore` entry is checked when its key is the resolved key of a collection in
`collectionsStore`. For each such entry, Save runs `readCollectionDocument` and then
`validateCollectionItems` on the pending value — the same two calls the build makes on the same
string, against the same declaration minus `defaultItems`, which validation never reads. So
**what the confirm lists is what the next build drops, by construction**, not by a second
implementation that could drift.

Three things deliberately do *not* trigger it:

- **Stored invalid items in a collection with no pending draft.** This Save does not write that
  document, so it changes nothing about what publishes. The modal still marks them.
- **Schema problems** (a bad `pattern`, a misplaced `unique`). They are the developer's, they do
  not drop items, and the owner cannot fix them.
- **Prose and field entries.** Nothing about them is invalid in a way the build acts on.

An unreadable pending document cannot come from the modal (it only ever writes
`serializeCollectionDocument` output), but a pending value is a string from anywhere; if one is
unreadable, the confirm lists the collection as "unreadable — the site will fall back to its
defaults", because that is what the parse ladder does.

### The dialog

`useSaveButton` gains `useCollections()` and derives the list with `useMemo` over
`[pending, collections]`. Its `onClick` becomes: nothing to report → `mutation.mutate()` as
today; otherwise `modal.confirm(…)` with `onOk: () => mutation.mutate()`. The hook returns the
`contextHolder`, which `DevtoolsContent` renders once. `useSaveButton.tsx` is already a `.tsx`
file with no JSX in it, so returning an element from it costs no rename.

```
┌ Some items won't appear on the site ─────────────────────────┐
│ Saving keeps them, but the site leaves them out until they   │
│ are fixed in Collections:                                    │
│                                                              │
│  • Varieties — #4 gros-michel: id: duplicate id              │
│    "gros-michel" — the first occurrence wins                 │
│  • Varieties — #5: name: required field is missing           │
│                                                              │
│                          [ Keep editing ]  [ Save anyway ]   │
└──────────────────────────────────────────────────────────────┘
```

- **Title** "Some items won't appear on the site". **OK** "Save anyway", **Cancel** "Keep
  editing". Neither is `danger`: saving an invalid item destroys nothing (D15).
- **One line per invalid item**: the collection's `label ?? name`, `#index`, the raw id when it
  is a non-empty string, and the item's **first** problem as `path: message` — with "(+N more)"
  when there are more. The modal is where the full list lives; this dialog only has to make the
  owner go and look.
- **At most eight lines**, then "and N more items". Owner-facing, so it does not reuse
  `formatCollectionProblem`, whose `palimp: collection` prefix is for a developer's grep.
- **Keep editing** closes the dialog and writes nothing. It does not open the Collections modal:
  antd fires `onCancel` for Escape and the close icon too, and a dialog that opens a second modal
  on Escape is a surprise. Considered and rejected in the alternatives.

`onOk` returns nothing, so the dialog closes at once and the drawer's button shows "Saving..." as
it does today. A failed save keeps the drafts, as it does today; the next Save asks again.

## §B — `unique`

### The attribute

```ts
interface FieldBase {
  readonly name: string;
  readonly label?: string;
  readonly required?: boolean;
  /**
   * No two values of this field may be equal among the items of the nearest
   * enclosing array — every item of the collection for a top-level or `object`
   * field, the entries of one list for a field inside a `list`. The later
   * duplicate is invalid and, at build, dropped. Empty and absent values never
   * collide. Meaningful on string, text, number, select and image.
   */
  readonly unique?: boolean;
}
```

It does not change `FieldValue` or `CollectionItem`; uniqueness is not a type. On `FieldBase`
rather than on the five scalar interfaces, because D16 measured that the narrower placement would
not produce a compile error where it matters (`defineCollection`'s inferred `F`), and an
attribute that type-checks in some call shapes and not others is worse than one that is honest
everywhere.

### The validator

`checkFields` gains one parameter — the **scope** a unique value is registered in, a
`Map<string, Set<string>>` from field path (relative to the scope's element) to the values seen
so far — and one more piece of state: whether this field pushed a problem of its own.

- `validateCollectionItems` creates one scope for the call. Top-level and `object`-nested fields
  register there under their relative path (`slug`, `seo.slug`).
- The `list` case creates a **fresh scope per list value** before mapping its entries, and passes
  it down with the relative path restarting at the entry. So `gallery[0].frameId` and
  `gallery[1].frameId` compete; the same frame id in two different items' galleries does not.
- **Only a value that passed its own checks participates.** A select value outside its options,
  a string failing its `pattern`, an out-of-range number: each already has a problem, and a
  second "duplicate" line about a value that is wrong anyway is noise. Checked by comparing the
  problem count before and after the field's `switch`.
- **Empty and absent never collide.** Absent fields `continue` before the switch already; `""`
  is skipped explicitly. That keeps two freshly added items with a required unique `string`
  (which `newItem` seeds as `""`) from marking each other — the missing value is the problem, and
  it is not a uniqueness one.
- **Equality is exact**, over a `typeof`-prefixed string (`"number:3"`, `"string:3"`), so values
  of different types never collide and `-0` equals `0`. No trimming, no case folding: a host
  that needs case-insensitive slugs says so with `pattern: "^[a-z0-9-]+$"`, which is what the
  dogfood already does.
- **The id field is skipped at the top level** even when it carries `unique: true`. The id rule
  runs after `checkFields` and already reports a duplicate; two lines for one fact is a bug.
- **The message** is `duplicate value "gros michel" — another item already has it; the first
  occurrence wins`, and inside a list `… — another entry in this list already has it …`, on the
  field's own path (`name`, `gallery[1].frameId`), so `FieldsEditor`'s existing per-path filter
  puts it under the right control with no modal change.

**Misplaced `unique`** — on a `boolean`, `object` or `list` field — pushes one schema problem per
field path, `unique is ignored on "featured" — it applies to string, text, number, select and
image fields`, deduplicated the way malformed patterns are, and the check does not run. A unique
boolean has no sensible meaning (at most one `true` *and* one `false`), and a unique object or
list would need a structural equality nobody has asked for.

As a consequence of sharing the validator, **the modal marks a duplicate as it is typed, the live
list drops it as it is typed, the build drops it with a warning, and Save lists it** — four
surfaces, no code in three of them.

## §C — Duplicate

`duplicateItem` stops being `structuredClone` plus splice. New module-local helper in
`CollectionsModal.tsx`, `copyForDuplicate(declaration, item, workingItems)`:

1. `structuredClone` the item, as today.
2. Walk the declaration's fields — top level, and into `object` fields; **not** into `list`
   fields, which are copied whole so their internal uniqueness is preserved.
3. For the **id field** and each **`unique` `string` or `text`** field whose value in the copy is
   a non-empty string: strip a trailing `-copy` or `-copy-<n>` to get a stem, then take the first
   of `stem-copy`, `stem-copy-2`, `stem-copy-3`, … that no working item holds at that path. So
   `gros-michel` → `gros-michel-copy`; duplicating either again → `gros-michel-copy-2`.
4. For each **`unique` `number`, `select` or `image`** field, remove the key from the copy.
5. Insert after the original and select it, as today.

The collision check reads **every** working item, invalid ones included — a value held by an
invalid item still blocks a valid copy from taking it, because fixing that item would otherwise
create the duplicate.

**Why a suffix and not a prompt.** A dialog asking for a new id before the copy exists would be
the modal's first blocking step, and the modal has none on purpose. A suffix gives a valid item
immediately, visibly named as a copy, and selected — so the form the owner renames it in is
already open.

**What a suffix cannot promise.** A host `pattern` that rejects `-copy` (`^\d+$`, say) leaves the
copy invalid, with the pattern problem marked. That is correct: the host's rule wins, the mark
says so, and Save's confirm catches it if the owner does not.

**Prose is not copied.** An item's prose lives in flat keys derived from its id
(`varieties.<id>.body`). The copy has a new id, so its prose keys have no rows, and its cards
render their own keys until typed into — which is what an added item does today. Copying the rows
would mean Duplicate writing *N* `editsStore` entries it cannot enumerate (the modal does not know
which suffixes a host derives), and the old behaviour (a shared id, so shared prose) was the bug.
Documented as a quirk.

**Images, unchanged unless unique.** A non-unique `image` still copies its URL verbatim and two
items still share one file (phase 3's quirk stands). A `unique` image is left out per step 4.

## §D — Where the code lands

| package | new | changed |
| --- | --- | --- |
| `core` (root) | — | `collections.ts` (`unique` on `FieldBase`, the scope in `checkFields`, the misplaced-`unique` schema problem) |
| `core/admin` | — | `Devtools/useSaveButton.tsx` (the check, `Modal.useModal`, returns `contextHolder`); `Devtools/DevtoolsContent.tsx` (renders it); `Devtools/CollectionsModal.tsx` (`copyForDuplicate`) |
| `be-supabase`, `be-firebase`, `publish-github` | — | — (lockstep version bump only) |
| `fe-next` | — | — (README only) |
| `examples/*` | — | `app/collections.ts` in both (`unique: true` on `name`) |

**What does not change, stated so the review can check it:** every adapter contract and
`Message`; `editsStore`; `collectionsStore`; `parseCollectionDocument`, `readCollectionDocument`
and `collection()` (the validator change reaches them with no edit); `LiveCollectionList`;
`FieldsEditor`, `FieldControl` and `newItem`; the modal's display-only validation; every
`exports` map; `fe-next`'s code. The lockstep bump is 1.7.0 → **1.8.0**, inside the feature
commit — a new schema attribute is a feature, not a fix.

## §E — The dogfood

Both examples, identically: `varieties.name` gains `unique: true`. It is the one other field in
the schema whose repetition would be a real editorial mistake, and it exercises the §C suffix on a
field that is not the id (`Gros Michel` → `Gros Michel-copy`, which is ugly on purpose — the owner
renames it). `defaultItems` are already distinct, so a build against an empty database changes
nothing.

No new type fixture. D16 measured that the one negative fixture worth having (`unique` on a
boolean fails to compile) cannot exist, and a positive one would be `unique: true` compiling,
which the dogfood already proves.

## §F — What phase 4 deliberately does not do

1. **No blocking Save.** (D15.)
2. **No case-insensitive or trimmed uniqueness.** `pattern` is the tool for normalising input.
3. **No uniqueness across collections**, and none across locales (collections are locale-free).
4. **No unique `boolean`, `object` or `list`.** Warned, ignored.
5. **No prose copy on Duplicate.** (§C.)
6. **No confirm for stored-but-not-pending invalid items.** The modal marks them; this Save does
   not write them.
7. **No "Review items" button that opens the Collections modal from the confirm.** (Alternatives.)
8. **No per-item Save, no partial Save that skips invalid items.** Save stays all-or-nothing.
9. **Phase 1 §H, phase 2 §G and phase 3 §I carry forward untouched**, including last-write-wins
   between two admins — which `unique` does not fix: two sessions can each add `pisang-raja`,
   and the second Save simply overwrites the first document.

## Alternatives weighed and rejected

- **Disable Save while any pending collection has invalid items.** The host's first ask, and
  rejected in D15: all-or-nothing Save makes one invalid item a lock on every other pending edit.
- **Save only the valid items.** Silently rewriting the document at commit is the partial write
  the client contract refuses (`setKey` stays commented out for the same reason), and it would
  destroy the owner's half-finished item instead of merely not publishing it.
- **Make validation blocking in the modal.** Discards keystrokes. Phase 1 §B.
- **Warn instead of drop for `unique` at build.** Would make the attribute decorative for exactly
  the host that needs it most — one that builds `generateStaticParams` from the field, where two
  items with one slug is a build that emits one route for two projects.
- **Put `unique` on the five scalar interfaces only.** Measured not to reject a misplaced
  attribute through `defineCollection`'s inference (D16); it would type-check a mistake in the
  common call shape while advertising that it cannot.
- **A prompt for a new id on Duplicate.** The modal's first blocking step. (§C.)
- **Copy prose rows on Duplicate.** The modal cannot enumerate which derived keys a host uses.
  (§C.)
- **Open the Collections modal from "Keep editing".** antd routes Escape and the close icon
  through `onCancel`, so the modal would open on dismissal. A third footer button ("Review")
  avoids that, and was left out as UI the host did not ask for; it can be added without touching
  anything else here.
- **Static `Modal.confirm`.** Cannot consume antd context, so it renders outside the host's
  theme. `Modal.useModal` is the documented fix.

## Documentation to update when it lands

- [libs/core/README.md](../../../libs/core/README.md) — the Collections section: `unique` beside
  `required`/`pattern`/`min`/`max`, with its scope rule; the "Validation … is display-only"
  paragraph gains "… and Save asks before committing items the build will drop"; Duplicate's
  suffixing. **Quirks:** a duplicate `unique` value is dropped at build like any invalid item;
  empty and absent never collide; Duplicate does not copy prose, and leaves unique non-text
  fields out; the phase-3 "Duplicate shares a file" line gains "unless the field is `unique`";
  the confirm checks only collections still registered on the current page — a draft left
  pending after client-side navigation away from its collection saves without the check.
- [libs/fe-next/README.md](../../../libs/fe-next/README.md) — the Collections section's field
  list gains `unique`, one sentence on `generateStaticParams` as the reason a slug wants it.
- [docs/architecture.md](../../architecture.md) — the collections bullet gains one sentence: Save
  lists items the build will drop before writing them.
- [README.md](README.md) here — decision log D15–D17 (done with this plan), phase map row, the
  extensions slot renumbered to 5, next steps.

## Verification

1. **`pnpm check-types`** — the new parameter threaded through `checkFields`' recursion, and the
   `exactOptionalPropertyTypes` shape of the confirm's line objects.
2. **`pnpm build`** — every `exports` map unchanged.
3. **Pure fixtures, `node -e` against the built `dist`, no backend.** The validator on:
   two items with one `unique` string (second invalid, message on the field path); `""` twice
   and absent twice on an optional unique string (both valid); `3` and `"3"` in fields of
   different widgets (no collision); `0` and `-0` on a unique number (second invalid); a unique
   select value outside its options repeated (one "not one of the declared options" each, no
   duplicate line); the id field with `unique: true` duplicated (one duplicate-id line, not two);
   `seo.slug` inside an `object` repeated across items (invalid); a unique `frameId` repeated
   inside one item's list (invalid) and across two items' lists (valid); `unique: true` on a
   boolean (one schema problem, reported once for many items, no item invalid). And
   `parseCollectionDocument` dropping the duplicate with a `palimp: collection` warning line.
   `copyForDuplicate` is module-local, so its cases are driven in item 5, not here.
4. **Chunk placement**, grepped in a stub-adapter static export of the supabase example: "Save
   anyway" appears in the lazy admin chunk only; visitor eager JS and `out/index.html` unchanged
   beyond the dogfood schema's `"unique":true` bytes in the registration row.
5. **The credentialed manual pass on Supabase — no build covers any of this.** Ask rather than
   report items 1–4 as the verification. In order:
   - Duplicate `gros-michel` → the copy is `gros-michel-copy` / `Gros Michel-copy`, **no validity
     mark**, and the live card appears; duplicate the original again → `-copy-2`; duplicate
     `gros-michel-copy` → `-copy-3` (stem stripped, next free taken); the copy's prose renders its
     own key.
   - Rename a copy's `name` to `Manzano` → the mark appears under Name as it is typed, and the
     live card disappears.
   - **Save** with that pending → the confirm lists exactly that item with its first problem;
     **Keep editing** → no network request, drafts intact, badge unchanged; Escape → the same.
   - **Save anyway** → one `setKeys` POST, the badge clears; reload → the item is still in the
     modal, still marked.
   - Fix the name, Save → **no confirm**, one POST.
   - A pending prose edit alone → Save with no confirm. A pending prose edit plus a pending
     *valid* collection → no confirm, one POST carrying both.
   - With a stored invalid item and **no** pending change to that collection, edit prose and
     Save → no confirm (§A).
   - A full static export against the real table after "Save anyway" with a duplicate → the build
     log carries the `palimp: collection "varieties"` duplicate line and the visitor HTML has one
     card fewer.
   - The dialog renders inside the drawer's antd theme (not unstyled) — the reason for
     `Modal.useModal`.
   - The Publish rebuild stays blocked on the deploy workflow building `main`, as in phases 1–3.

**If any part of item 5 was not run, the landing note says so, item by item.**

## Divergence note (2026-09-15, implementation)

Built as specified — §D's file list, and §D's "what does not change" list intact (no contract,
`editsStore`, `collectionsStore`, parse ladder, `LiveCollectionList`, `FieldsEditor`/`FieldControl`/
`newItem` or `exports` map moved; `fe-next` is README-only). The departures:

1. **"First occurrence wins" is positional, and Duplicate inserts the copy *before* every later
   item — so renaming a copy onto a later item's value marks the later item, not the copy.** Found
   by driving item 5: duplicating `gros-michel` places the copy at #1, and typing `Manzano` into
   its Name marked the **stored** `manzano` (#4) invalid, removed *that* live card, and left the
   copy's card showing "Manzano". The walkthrough expected the mark under the field being typed
   into. The validator does exactly what D16 says, the confirm listed exactly the item the build
   then dropped, and the stored item is recoverable by fixing either one — so nothing was changed,
   but it is the likeliest way an owner meets `unique`, and it is now a core README quirk. An
   order-independent rule (mark every holder of a repeated value, or the most recently edited) is
   a design change for a later plan, not a fix.
2. **A misplaced `unique` is found by walking the declaration, not the items.** §B said it is
   "deduplicated the way malformed patterns are", which would only report it when some item
   carries the field. Walking `fields` once up front reports it whether or not any item does,
   including for a collection with no items and for a field inside a `list` nobody has added an
   entry to. The message names the declared dotted path (`"gallery.featured"`), with no list
   indices.
3. **`useSaveButton.tsx` gained a module-local `isPlainObject`** — the third copy in `core` — to
   read the raw id without a cast. The confirm's collection label is `label ?? name`, so on the
   dogfood (no `label`) the lines read `varieties — #4 manzano: …`, lowercase.

**Landing notes.** Verification status, item by item.

**Items 1–4 ran and pass.** Item 1: `check-types` clean across the libs, and `tsc --noEmit` clean in
both examples with the dogfood's `unique: true`. Item 2: `pnpm build` clean, every `exports` map
unchanged. Item 3: thirteen fixtures against the built `dist`, no backend, all passing — every
case §Verification lists, plus a unique `text` field holding `"3"` then `3` (no duplicate line),
`unique` on an `object` and on a boolean inside a `list` (two schema problems, nested path named),
and `formatCollectionProblem` on the dropped item producing
`palimp: collection "varieties" — item 1 (b), field "name": duplicate value "X" — another item
already has it; the first occurrence wins`. `copyForDuplicate` was additionally exercised as an
extracted copy under Node's type stripping (id, unique string, unique `text` inside an `object`
suffixed; unique `number` and `select` removed; list copied whole; `-copy`, `-copy-2`,
stem-stripped `-copy-3`) before item 5 drove the real one. Item 4 (stub-adapter static export of
the supabase example, against a 087be50 baseline built the same way): `out/index.html`
25,164 → **25,180** (+16 B — exactly `"unique":true,` escaped, one occurrence); eager JS
645,649 → **645,649**, byte-identical; "Save anyway" in one chunk, which `index.html` does not
reference; zero `data-palimp-editor` in the visitor HTML.

**Item 5 ran 2026-09-15 against real Supabase credentials**, CDP-driving a signed-in session in the
dev server:

- **Duplicate** `gros-michel` → `gros-michel-copy` / `Gros Michel-copy`, no validity mark, live card
  appeared; the original again → `-copy-2`; `gros-michel-copy` → `-copy-3`. The copy's prose editor
  rendered its own key (`varieties.gros-michel-copy-3.body`, as the placeholder of an empty editor).
- **Rename a copy's Name to `Manzano`** → a mark appeared as it was typed and a live card
  disappeared — on the stored `manzano`, per divergence 1.
- **Save** → the confirm listed exactly that one item with its first problem; **Keep editing** →
  closed, zero write requests (a `fetch` wrapper logged every non-GET), `Save (1)` unchanged, rows
  intact; **Escape** → the same, and it closed only the confirm, not the Collections modal under it.
- **The dialog rendered in the drawer's antd theme** — the same `css-dev-only-…` / `css-var-root`
  classes as the drawer, themed primary button, screenshot checked.
- **Save anyway** → one `setKeys` POST to `/rest/v1/inline?on_conflict=key`, `Save (0)`; after a
  reload the item was still there, still marked, with the message under Name.
- **A full static export against the real table** → the build log carried
  `palimp: collection "varieties" — item 2 (manzano), field "name": duplicate value "Manzano" — …`,
  and the visitor HTML had six cards for seven stored items.
- **A pending prose edit with a stored invalid item and no pending collection draft** → no
  confirm, one POST carrying only `hero.lead`. This is the stricter form of "a pending prose edit
  alone", which it therefore also covers.
- **The fix, together with a prose edit** → deleting the copy made the pending collection valid;
  Save with the prose revert pending as well → no confirm, **one** POST carrying both keys. The plan
  said "fix the name"; deleting the copy was chosen instead so the demo project ends where it
  started, and it exercises the same path.

**Not run, and why:** the **Publish** rebuild, blocked on the deploy workflow building `main`, as
in phases 1–3; and **anything Firebase** — the firebase example's schema change is typechecked
only, for want of Firebase credentials.

**Test data left in the demo project:** none. The collection document is back to its six items and
`hero.lead` to its original text; the only trace is the rows' updated timestamps.
