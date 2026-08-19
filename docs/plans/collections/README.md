# Collections — the plan set

**Status:** direction proposed, nothing built · **Started:** 2026-08-19 · **Branch:** `pr/08-collections`

Typed, repeatable entities the site owner adds, edits, reorders and removes unaided — the feature
the host adoption established palimp cannot currently model, and the largest one planned. The full
exploration that grounds everything here is [00-exploration.md](00-exploration.md); this file is
the working roadmap on top of it.

## How this folder works

Unlike the rest of `docs/plans/`, this README is a **living index**: phase statuses and decision
answers are updated here, the way the top-level plans table is. Everything else in the folder
follows the folder's usual contract — each phase gets its own plan file, **written before that
phase is built**, in the house genre (proposal, trade-offs weighed, verification checklist), and
kept as written afterwards, divergence notes at the bottom.

The intended rhythm, one session per step:

1. A planning session takes the next phase, reads this file plus the exploration, resolves the
   decisions that gate the phase, and writes `NN-<phase>.md`.
2. An implementation session builds exactly that plan, on its own branch off this one, with the
   lockstep version bump inside the feature commit and the package-README quirks sections updated.
3. Landing appends a divergence note to the phase plan and updates the table below.

## The direction in one paragraph

One collection = one storage key whose string value is a JSON document `{ "v": 1, "items": […] }`
— the document *is* the enumeration, so add/remove/reorder are all "save the new document" and the
missing delete/enumerate primitives never bite. The schema is developer-defined in code
(`defineCollection`, Sveltia-flavoured widget vocabulary, item types inferred), the owner edits
items in an antd modal off the Devtools drawer, and every draft change is an ordinary
`editsStore` entry riding the existing all-or-nothing `setKeys` batch. Item *prose* stays flat
palimp keys derived from the item id. **Zero files change in the backend adapters.** Sveltia CMS
was evaluated as the buy option and stays the acknowledged fallback if media dominates
(details and all alternatives: exploration §A–§D and "Alternatives rejected").

## Decision log

Gate decisions the phases depend on. Answers get recorded here (date + one line of why); a phase
plan may resolve the ones it is gated on as its first section.

| # | question | leaning (from the exploration) | status |
| --- | --- | --- | --- |
| D1 | Build natively, or buy (embed Sveltia)? | Build; adopt Sveltia's field vocabulary; Sveltia stays the media fallback | **open** — gates phase 1 |
| D2 | Storage key namespace | `collection.<name>`, definition carries the key; no locale prefix on collection keys (entities are locale-free) | **open** — gates phase 1 |
| D3 | Is the live list wrapper in scope for v1? | No — phase 2, so phase 1 ships modal-only editing | **open** — gates phases 1–2 |
| D4 | Build policy for an invalid document | Strict validation in the modal; at build drop invalid items with a loud log, `defaultItems` only on parse failure | **open** — gates phase 1 |
| D5 | Widget vocabulary | The minimal seven (`string`, `text`, `number`, `boolean`, `select`, `object`, `list`), Sveltia-named | **open** — gates phase 1 |

## Phase map

| phase | plan file | status |
| --- | --- | --- |
| 1 — collections core | `01-core.md` — not yet written | **next: plan it** |
| 2 — live admin rendering | `02-live-rendering.md` | waiting on phase 1 |
| 3 — media seam | `03-media.md` | waiting on phase 1; independent of phase 2 |
| 4 — demand-driven extensions | `04-extensions.md` | unscoped; opened only on demand |

### Phase 1 — collections core → `01-core.md`

**Goal:** an owner can create, edit, duplicate, reorder and delete items of a declared collection
from the Devtools drawer; Save commits them atomically with pending prose edits; a rebuild renders
them — with zero changes to the backend adapters.

**In:** `CollectionSchema` + `defineCollection` + inferred item types (`core` root, no antd);
`collectionsStore` + `CollectionsModal` + a drawer button (`core/admin`); a `collection()` reader
beside `palimp()` (`fe-next`), off the same cached `loadMessages()`, usable in
`generateStaticParams`; `<PalimpCollections>` registration; the `{v, items}` document format;
the seven v1 widgets with `required`/`pattern`/`min`/`max`; `defaultItems` seeding; dogfood in
the supabase example (the three hardcoded `varieties.*` cards become a real collection); package
README updates including the quirks sections.

**Out:** media and upload (phase 3), live page rendering of structural changes (phase 2),
relations and conditional fields (phase 4), any adapter or contract change, drag-and-drop.

**The plan must answer:** D1–D5 above; the exact schema type shape and how item-type inference
works; modal layout in antd (item list vs item editor, given the 192px-drawer → Modal precedent);
draft granularity (serialize per keystroke into `editsStore`, or apply-per-item); how
`collection()` reports validation problems at build; the declaration cost in the RSC flight
payload and how to keep schemas lean.

**Exit criteria:** the exploration's verification checklist, plus the credentialed manual pass
(add / edit / duplicate / reorder / delete / batched save / failed-save-retains-draft / publish /
new item's route after rebuild). The credentialed items cannot be verified by any build — say so
in the landing note if they were not run.

### Phase 2 — live admin rendering → `02-live-rendering.md`

**Goal:** structural changes appear on the admin's page without publishing, the way string edits
already do; visitors keep getting the baked fragment.

**In:** a client list wrapper (admin re-reads the document and maps a host-supplied **client**
render component); a formalized helper for item-derived prose keys; whatever re-export of the
client text primitive host render components need.

**The plan must answer:** the RSC boundary shape (how the host hands over a client component);
interplay with preview mode; measured hydration and bundle cost, not guessed — the host-adoption
plan's §C sets the precedent that this gets measured.

**Exit criteria:** an added item renders live for an admin without Publish; visitor payload
compared before/after and free of the admin machinery.

### Phase 3 — media seam → `03-media.md`

**Goal:** an image field whose file the owner uploads from the modal.

**In:** an optional `PalimpMediaAdapter` (upload / list / public URL) with its context — the same
orthogonal-capability shape as the publish seam, feature-detected so hosts without it lose only
the widget; implementations in `be-supabase` (Storage bucket) and `be-firebase` (Cloud Storage);
an `image` widget. This is the one phase that *does* touch the backend packages — as new files
implementing a new optional contract, never as changes to the storage contract.

**The plan must answer:** URL stability across rebuilds; public vs signed access; bucket/rules
setup documentation in the same shape as the table grants; upload limits and what happens to
orphaned files when an item is deleted.

**Exit criteria:** upload from the modal → path stored on the item → rendered after rebuild, on
both backends; setup docs good enough to run without guessing.

### Phase 4 — demand-driven extensions → `04-extensions.md`

Unscoped by design; opened only when a real host needs one of: a relation widget fed from another
collection, conditional field visibility (`showWhen`), or the per-item-keys storage mode (the
migration the document's `v` field exists for).

## Next steps

1. **Answer D1–D5**, or start the phase-1 planning session and resolve them as its first section.
2. **New session: write `01-core.md`** against [00-exploration.md](00-exploration.md) §A–§D and
   this file's phase-1 scope.
3. Implement phase 1 per its plan, on a branch off `pr/08-collections`; land with a divergence
   note and update the tables here.
