# Collections — the plan set

**Status:** phases 1–3 built, verified on Supabase and merged (v1.7.0, `48f6417`); phase 4 planned · **Started:** 2026-08-19 · **Branch:** `pr/08-collections`

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
D9–D14 were answered **2026-08-31**, in the phase-3 planning session and before
[03-media.md](03-media.md) was written. D9 is the D1 clause — "Sveltia stays the fallback if
media becomes central" — taken as the gate it was written to be: the plan's §A defines "central"
and the condition under which the recommendation flips. D10 departs from this file's phase-3
brief (it stores a URL, not a path), for reasons found in the source rather than the brief. D14
narrows the brief's "both backends" to Supabase, on the user's word that Firebase Storage will
not exist before the feature ships.
D15–D17 were answered **2026-09-15**, in the phase-4 planning session and before
[04-save-integrity.md](04-save-integrity.md) was written. The phase was not in this file's map: the
host found, by reading the source, that an invalid item saves and is then dropped at build with
only a log line to say so. D15 is the user's call; D16's placement of `unique` was decided by
compiling the alternative.

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
| D9 | Does phase 3 cross D1's media gate — build, or fall back to Sveltia? (2026-08-31) | **Build.** "Central" is defined in 03-media.md §A as six signs (derivatives, a library surface, reference-checked deletion, media outside collections, private-until-published, volume); the recommendation flips at two of them, or at derivatives or privacy alone | None is present in the requirement (one art-directed, consent-cleared file per field, dozens, public), each would be structural for palimp and additive for Sveltia, and the seam costs one interface, one context, one widget and a small adapter per backend with zero contract changes; the coexistence path (Sveltia-managed repo files pasted into the widget's URL input) is kept open by D10 |
| D10 | What does the item store? (2026-08-31) | **The public URL**, not a storage path; the `image` widget is a URL input plus an Upload button | A path needs resolving on the server, in the live map and for visitors — three surfaces and a `setMediaAdapter()` singleton; a URL needs `<img src>` and nothing else, keeps `fe-next` at zero code changes, and lets the same field take a repo path with no adapter mounted (the exploration's v1 workflow as a degraded mode). Cost: relocating a bucket rewrites documents |
| D11 | Public or signed access? (2026-08-31) | **Public read, authenticated create-only**; no update or delete from the client; signed URLs rejected | A static export bakes the URL for the life of the deploy and a signature expires in hours — not a hardening option but a premise conflict; `inline` rows are already public-read on both backends. Consequence recorded as a quirk: an upload is public on upload, before Save or Publish |
| D12 | Seam shape and feature detection (2026-08-31) | **The publish seam's shape** — `PalimpMediaAdapter` + nullable `PalimpMediaContext` in `core`, the widget disables Upload with "No media provider" — with the implementations mounted through an optional **`media` prop on each existing backend provider**, not a second provider | Publishing is a different service with its own credentials, so it has its own provider; media lives in the same project, key and session as the rows, so a separate provider would repeat them. The bare context stays the seam for any third-party or git-backed adapter |
| D13 | Upload timing, paths and orphans (2026-08-31) | **Upload on selection**; paths are `<collection>/<timestamp>-<rand>-<name>`, never overwritten (`upsert: false` plus create-only rules), `Cache-Control: immutable`; nothing deletes; orphans accepted | Deferring to Save needs a non-string draft layer, a media-aware save path and a live card that cannot show the image — three invariants for one class of leftover the landing notes already document (prose rows outlive items). Never-overwritten is what makes a stored URL stable across rebuilds by construction |
| D14 | Which backends does phase 3 implement? (2026-08-31) | **Supabase only.** The Firebase adapter is designed in 03-media.md §E and deferred; the firebase example mounts no `media` prop and runs the degraded widget | Cloud Storage for Firebase is not provisioned and will not be before the feature is published; the house rule verifies admin behaviour against a real backend or records it unrun, and a whole adapter recorded unrun is a liability, not a deliverable. The seam is backend-agnostic, so the follow-up is new files in `be-firebase` with no `core` change — and the firebase example is the one real page exercising D12's "lose only the upload button" |
| D15 | Does Save block on invalid collection items? (2026-09-15) | **No — it confirms.** Save lists the pending collection items the build will drop, with "Save anyway" | Save is one all-or-nothing `setKeys` batch, so a block would hold every other pending edit hostage to one bad item; a saved invalid item loses nothing — it stays in the document, marked, and publishes once fixed |
| D16 | Shape and scope of `unique` (2026-09-15) | **On `FieldBase`**, meaningful on `string`/`text`/`number`/`select`/`image`, misplaced use a schema problem; unique within the **nearest enclosing array**; exact match, first wins, empty and absent never collide; the later duplicate dropped at build | Measured: narrowing the attribute to the scalar interfaces does not reject a misplaced one through `defineCollection`'s `const F` inference, so the type could not keep that promise. Dropping, not warning, because a host building routes from the field is the one that needs it |
| D17 | What does Duplicate do to unique values? (2026-09-15) | **Suffixes** the id and unique `string`/`text` fields (`-copy`, `-copy-2`, …); **removes** unique `number`/`select`/`image`; copies lists whole; copies no prose | The old whole-item clone made every copy invalid on creation — the likeliest path to the host's dropped item. A suffix yields a valid, visibly copied item without a blocking prompt |

## Phase map

| phase | plan file | status |
| --- | --- | --- |
| 1 — collections core | [01-core.md](01-core.md) — written 2026-08-19, divergence note appended | **built on `pr/08-collections-01-core`; verified incl. the credentialed pass on Supabase (2026-08-20) — Firestore round-trip and a real Publish still unrun** |
| 2 — live admin rendering | [02-live-rendering.md](02-live-rendering.md) — written 2026-08-20, divergence note appended | **built and merged into `pr/08-collections` (`09be3cd`, v1.6.0); verified incl. the credentialed pass on Supabase (2026-08-21; measured deltas better than §E: payload −1,122 B, eager JS +580 B) — only the Publish step unrun, blocked on the deploy workflow building `main`** |
| 3 — media seam | [03-media.md](03-media.md) — written 2026-08-31, divergence note appended | **built and merged into `pr/08-collections` (`48f6417`, v1.7.0); verified incl. the credentialed pass on Supabase (2026-08-31; §E's eager-JS estimate was low — the be-supabase media shell is ≈ 1,160 B and eager whether or not `media` is mounted) — the Firebase adapter deferred by D14, the authenticated update/delete refusal half-tested, Publish still unrun** |
| 4 — save integrity | [04-save-integrity.md](04-save-integrity.md) — written 2026-09-15 | **planned; not built** |
| 5 — demand-driven extensions | `05-extensions.md` | unscoped; opened only on demand. Renumbered from 4 on 2026-09-15 — plans 00–03 call it "phase 4" |

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
both backends; setup docs good enough to run without guessing. *(Narrowed 2026-08-31: the item
stores the URL — D10 — and the implementation is Supabase only, the Firebase adapter deferred
— D14.)*

### Phase 4 — save integrity → `04-save-integrity.md`

**Goal:** an owner cannot commit an item that will not publish without being told, and Duplicate
stops producing such items.

**In:** a confirm on the drawer's Save listing pending collection items the build will drop (D15);
a `unique` field attribute in the shared validator (D16); Duplicate giving the copy unique values
(D17); `unique: true` on the dogfood's `name`; README and quirks updates; lockstep 1.8.0.

**Out:** blocking Save, partial saves, case-insensitive uniqueness, cross-collection uniqueness,
copying prose on Duplicate, any contract or adapter change.

**Exit criteria:** the plan's verification list, including the credentialed Supabase pass —
Duplicate, the confirm's three outcomes, and a static export showing the dropped item.

### Phase 5 — demand-driven extensions → `05-extensions.md`

Unscoped by design; opened only when a real host needs one of: a relation widget fed from another
collection, conditional field visibility (`showWhen`), or the per-item-keys storage mode (the
migration the document's `v` field exists for).

## Next steps

1. **Build phase 4** — an implementation session builds exactly
   [04-save-integrity.md](04-save-integrity.md) on a branch off this one
   (`pr/08-collections-04-save-integrity`), 1.8.0 lockstep inside the feature commit, and runs the
   credentialed pass on Supabase.
2. **The Firebase media adapter** (03-media.md §E, deferred by D14) when Cloud Storage is
   provisioned on the Firebase project — new files in `be-firebase`, the `## Cloud Storage`
   README section replacing the placeholder quirk, its own divergence entry, its own lockstep
   bump. Not before. Note that §E's Firebase design carries two facts to re-check against the
   console rather than trust: the default bucket name, and the plan requirement for projects
   created after October 2024.
3. **Phase 5 opens only on demand.** Unrun items to close when circumstances allow: the Firestore
   round-trip and the firebase example's admin rendering (both need Firebase credentials); the
   added-item-renders-after-rebuild Publish check (needs a collections branch to be what the
   deploy workflow builds), shared by all three phases; and phase 3's authenticated
   `update`/`remove` refusal, which was verified anonymously but not from a second signed-in
   session.
