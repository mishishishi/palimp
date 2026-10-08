# Editor safety — the plan set

**Status:** four plans written; **01 built** (1.9.0, 2026-10-08), 02–04 not ·
**Written:** 2026-10-06 against 1.8.1 (`b2934c7`), except 03 — 2026-10-08, against 1.9.0 ·
**Branch:**
`pr/10-publish-failure-is-silent`, stacked on `pr/09-publish-status-staleness` — docs commit and
01 both on it, not pushed

Ways the editor loses an owner's work or lies to them about it. Unlike
[collections/](../collections/), this folder arrived nearly complete: 01, 02 and 04 were written in
the host repo, from the host's incident record and a read of the 1.8.1 source, as the counter-offer
to replacing palimp with a file-based CMS — **3–4 days of library work** against the 12–18 that
replacement was estimated at.

**03 was added here on 2026-10-08**, after 01 landed, and is the one plan not traceable to an
incident: reading 02 and 04 together surfaced the case both had missed — *discard what I saved,
keep what is published* — which is more frequent than either. It renumbered undo from 03 to 04.

## How this folder works

The folder contract is the usual one — each plan was written **before** its phase is built, in the
house genre (proposal, trade-offs weighed, alternatives rejected, verification checklist), and is
kept as written afterwards with divergence notes at the bottom. This README is the exception: like
`collections/README.md` it is a **living index** — statuses, the decision log and the next step get
updated here as the work moves.

One departure from the collections rhythm: 01, 02 and 04 need no planning session — each resolves
what its phase needed, so the next session for any of them is an **implementation** session, owing
only the decisions below marked open. 03 is the exception and carries three of those decisions
itself.

## The direction in one paragraph

Palimp can write a row and it can overwrite one; it cannot remove one, it cannot tell you a write
failed, and it does not know what it published. Those three gaps are the whole set. **01** returns
an error react-query has already caught and nobody reads, so a refused publish token stops looking
like success. **02** adds the missing primitive — a batched, optional `removeKeys` on the backend
adapter, plus the Supabase grant and policy that have never existed — and spends it on a *Reset to
original* that deletes the row so the dictionary default wins again. **03** closes the third gap:
the build emits the set it read as a static file, which is the only honest definition of
*published* under a static export, and the drawer diffs against it to offer *discard everything
since the last build*. **04** spends 02's primitive on a one-step undo instead: one reserved
`__palimp.undo` key written inside the Save batch, replaying strings through `setKeys` and absences
through `removeKeys`. No new table, no migration, no change to how a page reads a key.

Three targets, deliberately distinct: 02 goes to the string in the code, 03 to the string on the
live site, 04 to the string before the last Save.

## Decision log

Gate decisions. Answered ones carry the date and the reason that survived reading the source; open
ones gate the phase they name and must be answered in writing before that phase is built.

| # | question | answer | why |
| --- | --- | --- | --- |
| E1 | Fix the silent publish by toast, or by persistent state? | **Persistent** (2026-10-06) — a label branch plus the status modal; an `onError` toast rejected | The failure outlives the toast: the site is still serving the old build an hour later, and an editor who missed the toast has no way to ask the drawer what happened. A toast is worth revisiting as an *addition* once the states exist |
| E2 | Is `removeKeys` required on `PalimpClientBackendAdapter`? | **Optional**, capability-gated (2026-10-06) | An adapter written against 1.8.x keeps satisfying the interface; the drawer hides Reset when it is absent, exactly as the Publish button gates on `available`/`hasToken`. Batched for the reason `setKey` is commented out — a per-key delete allows a half-reset |
| E3 | Does an empty string mean "absent"? | **No** (2026-10-06) | An intentionally empty string has to stay representable; inferring intent from the value is how it stops being. Reset is an explicit action the editor chooses, not a reading of `""`. This is the host's ADR 039 rejection, and it stands |
| E4 | Where does undo's previous value live? | **One reserved key `__palimp.undo`** (2026-10-06), filtered out of `loadMessages()` in both server adapters | A `prev.<key>` row per key doubles the set `loadMessages()` fetches whole into every build, and every page's payload with it. One row is bounded by the batch, not by history |
| E5 | Order | **02 before 03** (2026-10-06); 01 independent. *That 03 is now [04](04-undo-last-save.md); the dependency is unchanged, and 03-as-written has the same one* | Undoing the first-ever edit to a string means removing a row. Without `removeKeys` the best available is writing the `defaultMessage` as a literal row, which looks identical today and pins the copy tomorrow |
| E6 | Version | **1.9.0** (2026-10-06) | Additive across all three: a new exported error class, a widened hook return, an optional interface member, a reserved key prefix. No existing behaviour changes meaning. **Cut by 01 on 2026-10-08** — the rest of the folder now lands inside a version that already exists, or bumps again as each ships. 03 was written after this row and estimates `1.10.0`/`1.11.0` |
| E7 | Does Reset reach keys with no editor on the page? | **parked** (2026-10-08) — **superseded by E10** | 02 enumerates mounted and registered keys, which is the set a page can offer. But its own report names the orphaned key — typed into a question the host later deleted, invisible and unremovable — and that key is in no store. Answering "mounted only" is coherent and leaves the reported case unfixed; answering "all stored keys" needs a key list the interface does not have. Parked rather than answered because 03's manifest may supply exactly that list as a by-product — whatever answers E10 answers this, so answering it twice risks two mechanisms for one question |
| E8 | Who runs the Supabase SQL on an existing project? | **Both: the drawer probes, and a migration file is prepared** (2026-10-08) | The probe is what the host sees: Reset hides itself where the grant is absent, the same shape as `available`/`hasToken` on Publish, so a project that has not run the SQL never shows a button that fails with `42501`. The migration file is written alongside it rather than instead of it, because the current preview project gets migrated when the production setup is ready, and that step needs something reviewable to run — not a paragraph in a release note. **What 02 still has to solve:** Postgres has no cheap read-only way to ask whether a role may delete — either query `information_schema.role_table_grants` or treat the first `42501` as the capability answer and hide Reset from then on |
| E9 | **What goes in the published manifest — every stored row, or only the keys the build rendered?** | **open** — gates 03 | Every row makes the file a complete key list, which is the `listKeys` E7 wanted, for free. It also publishes keys nothing renders — orphans, unrendered fields, the key namespace — at a URL any crawler can read. The *values* of rendered keys are already public in the HTML; these are not. Rendered-only closes that and costs the free list |
| E10 | **Is the unpublished diff exact site-wide, or scoped to what the page knows?** | **open** — gates 03 | Exact needs a client-side list of stored keys, from either a full manifest (E9) or a new optional `listKeys`. Scoped covers the manifest's keys plus the page-known set 02 builds, and misses a key created after the build on a page the editor has since left — so the count can read zero while a change is pending. Subsumes E7 |
| E11 | **Does Discard also drop pending unsaved edits?** | **open** — gates 03 | `editsStore` holds typed-but-unsaved values. Leaving them sends the count to zero while the page still shows edits; clearing them destroys work the editor never committed. Either answer is defensible and the confirm has to say which |

## Plan map

| # | plan | status |
| --- | --- | --- |
| 01 | [01-publish-failure-is-silent.md](01-publish-failure-is-silent.md) — the dispatch error nothing reads | **built, 2026-10-08, as 1.9.0.** Both halves as written. Eight divergence notes at the bottom of the plan; the load-bearing one is that the auth error class had to split — a generic `PalimpPublishAuthError` in `core`, `GithubAuthError` subclassing it in the adapter — because `instanceof` in the drawer would otherwise invert the dependency direction. **Verified against a live host on 2026-10-08** — `examples/supabase-next`, real Supabase credentials, a real PAT on `mishishishi/palimp`, the drawer driven over CDP. Steps 2–5 pass, including the one that proves the narrowing: a renamed workflow reads `Publish failed` with a 404, not `Publish token expired`. Step 1 is unreachable as written and now proven so. See §Verification run at the bottom of the plan |
| 02 | [02-reset-to-original.md](02-reset-to-original.md) — the row palimp cannot remove | **not built, and next.** E8 answered 2026-10-08: the drawer probes for the delete grant, and a migration file ships beside it. E7 parked behind E10, so the only call left is Reset's key scope |
| 03 | [03-discard-unpublished.md](03-discard-unpublished.md) — back to the live build | **not built.** Written 2026-10-08, after 01. Gated on E9, E10, E11; needs 02's `removeKeys` |
| 04 | [04-undo-last-save.md](04-undo-last-save.md) — one reserved key, no schema change | **not built.** Needs 02. Was 03 until 2026-10-08 |

## Next step

**01 is built, verified and 1.9.0 is cut.** One thing it still owes, and it is not library work:

1. ~~Run §Verification against a live host.~~ **Done 2026-10-08** — steps 2–5 pass, step 1 is
   unreachable as written. The run also corrected divergence 2's timing: a dead token takes about
   seven seconds to disable the button, not one, because react-query retries the `401` first, and
   the button is disabled throughout. Recorded in the plan's §Verification run.
2. **Revendor 1.9.0 into `nano-pro-web`** by that repo's `agent-guidelines/revendoring-palimp.md`,
   and shorten `agent-guidelines/editing-copy.md` §3 — the paragraph that teaches the client to
   check the status panel by hand exists because of this bug.

Then **02 is the next build**, because every plan left depends on its `removeKeys`. E8 is answered
and E7 is parked behind E10, so 02 needs only a scope call for Reset's key list — and the cheap
answer (the page-known set) is the right one if 03 is going to supply the full list anyway.

After 02, **answer E9, E10 and E11** and build 03. 04 is last and is the one piece of this folder
that could be dropped: once an owner can discard back to the live build, *"undo the last save"* is
a convenience rather than a safety net. Keep it written either way — it is the reason the cheap
version of version history came first.

## Where these came from

Written in `nano-pro-web` — the first host that is not an example, and the source of all three
reports — while weighing whether to replace palimp with Sveltia CMS. That assessment, the incident
record and the client-facing handover that currently has to document these defects as behaviour all
live in that repo's `agent-guidelines/`. Three things there depend on these landing: the handover's
"the only way back is retyping it", its instruction to check by hand whether a publish actually
ran, and ADR 039's "an edit is one-way, and that is accepted".

Getting a release back into that host is its own documented procedure there
(`agent-guidelines/revendoring-palimp.md`) and is not palimp's concern beyond `pnpm pack:all`.
