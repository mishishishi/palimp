# Collections — the plan set

**Status:** phase 1 built and verified on Supabase (merged); phase 2 built and verified incl. the credentialed pass on `pr/08-collections-02-live-rendering`, awaiting merge · **Started:** 2026-08-19 · **Branch:** `pr/08-collections`

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

D1–D5 were answered **2026-08-19**, in the phase-1 planning session and before
[01-core.md](01-core.md) was written. Each matched the exploration's leaning, but the reasons below
are the ones that survived reading the source rather than the ones the exploration gave.
D6–D8 were answered **2026-08-20**, in the phase-2 planning session and before
[02-live-rendering.md](02-live-rendering.md) was written; two of the three were decided by
measuring a prototype rather than by argument.

| # | question | answer (2026-08-19) | why |
| --- | --- | --- | --- |
| D1 | Build natively, or buy (embed Sveltia)? | **Build**, borrowing Sveltia's field vocabulary; Sveltia stays the fallback if media becomes central | `editsStore`, `setKeys` and `getKey` absorb the whole feature with no contract change, and the Fields modal already proves a structured editor needs no save-path change |
| D2 | Storage key namespace | **`collection.<name>`**, with a `key` override on the schema; never locale-prefixed | Nothing in the workspace parses a key, so the namespace collides with nothing; entities are locale-free, their prose is not |
| D3 | Is the live list wrapper in scope for v1? | **No** — phase 1 is modal-only | Strings are live only because each `EditComponent` re-reads its key; a server-rendered list has no analogous mechanism, so phase 2 is a different mechanism, not a smaller phase 1 |
| D4 | Build policy for an invalid document | **Never throw**: drop invalid items with a loud warning; `defaultItems` only when the document fails to parse or fails its shape check | Palimp's one build-time throw is a wiring error, never a data one, and `p()` answers a missing key by rendering the key — dropping loudly is that instinct one level up |
| D5 | Widget vocabulary | **The minimal seven**, Sveltia-named (`string`, `text`, `number`, `boolean`, `select`, `object`, `list`) | `object` and `list` are the two that cannot be retrofitted without reworking the item inference; the rest of Sveltia's vocabulary can arrive whenever a host asks |
| D6 | RSC boundary for live rendering (2026-08-20) | **One client card, used on both sides** — the host's item renderer is a client component, passed by module reference and also used to render the baked children | Measured: the dual-render alternative pays +795 B of payload and *still* ships the card chunk eagerly, because a client-module reference in the flight payload pulls its chunk in even unrendered |
| D7 | Preview mode × live list (2026-08-20) | **The live list stays live in preview**, with zero preview-specific code | Preview means "how the page will look", which after the next Save-and-Publish includes pending structure; `EditComponent`'s existing preview branch handles the prose, so correctness falls out of composition |
| D8 | Does the wrapper also register the collection? (2026-08-20) | **Yes** — `<PalimpCollectionList>` registers into `collectionsStore`; `<PalimpCollections>` stays for modal-only collections | The wrapper needs the declaration and document anyway, and the measured prototype shipped `staleDocument` twice when the two stayed separate; the store's dedup-by-key makes accidental coexistence harmless |

## Phase map

| phase | plan file | status |
| --- | --- | --- |
| 1 — collections core | [01-core.md](01-core.md) — written 2026-08-19, divergence note appended | **built on `pr/08-collections-01-core`; verified incl. the credentialed pass on Supabase (2026-08-20) — Firestore round-trip and a real Publish still unrun** |
| 2 — live admin rendering | [02-live-rendering.md](02-live-rendering.md) — written 2026-08-20, divergence note appended | **built on `pr/08-collections-02-live-rendering`; verified incl. the credentialed pass on Supabase (2026-08-21; measured deltas better than §E: payload −1,122 B, eager JS +580 B) — only the Publish step unrun, blocked on the deploy workflow building `main`** |
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

1. **Merge `pr/08-collections-02-live-rendering` into `pr/08-collections`** — the credentialed
   pass ran 2026-08-21 and passed; the merge is the user's call.
2. **Then plan phase 3 (media seam)** — independent of phase 2. Unrun items to close when
   circumstances allow: the Firestore round-trip (needs Firebase credentials), and the
   added-item-renders-after-rebuild Publish check (needs a collections branch to be what the
   deploy workflow builds) — shared by phases 1 and 2.
