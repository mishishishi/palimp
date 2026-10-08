# Editor safety — the plan set

**Status:** all three plans written; **01 built** (1.9.0, 2026-10-08), 02 and 03 not ·
**Written:** 2026-10-06, against 1.8.1 (`b2934c7`) · **Branch:** docs on
`t3code/publish-failure-silent-surfacing`, 01 on `t3code/01-publish-failure-is-silent` off it —
neither pushed

Three ways the editor loses an owner's work or lies to them about it, all reported by the first
non-example host and all written up before any of them was built. Unlike
[collections/](../collections/), this folder arrived complete: the plans were written in the host
repo, from the host's incident record and a read of the 1.8.1 source, as the counter-offer to
replacing palimp with a file-based CMS. They are **3–4 days of library work** against the 12–18
that replacement was estimated at.

## How this folder works

The folder contract is the usual one — each plan was written **before** its phase is built, in the
house genre (proposal, trade-offs weighed, alternatives rejected, verification checklist), and is
kept as written afterwards with divergence notes at the bottom. This README is the exception: like
`collections/README.md` it is a **living index** — statuses, the decision log and the next step get
updated here as the work moves.

One departure from the collections rhythm: there is no planning session left to run. Each plan
already resolves what its phase needed, so the next session for any of them is an **implementation**
session. What it still owes is the decisions below marked open.

## The direction in one paragraph

Palimp can write a row and it can overwrite one; it cannot remove one, and it cannot tell you a
write failed. Those two gaps are the whole set. **01** returns an error react-query has already
caught and nobody reads, so a refused publish token stops looking like success. **02** adds the
missing primitive — a batched, optional `removeKeys` on the backend adapter, plus the Supabase
grant and policy that have never existed — and spends it on a *Reset to original* that deletes the
row so the dictionary default wins again. **03** spends the same primitive on an undo: one reserved
`__palimp.undo` key, written inside the Save batch, holding the previous values; undoing replays
strings through `setKeys` and absences through `removeKeys`. No new table, no migration, no change
to how a page reads a key.

## Decision log

Gate decisions. Answered ones carry the date and the reason that survived reading the source; open
ones gate the phase they name and must be answered in writing before that phase is built.

| # | question | answer | why |
| --- | --- | --- | --- |
| E1 | Fix the silent publish by toast, or by persistent state? | **Persistent** (2026-10-06) — a label branch plus the status modal; an `onError` toast rejected | The failure outlives the toast: the site is still serving the old build an hour later, and an editor who missed the toast has no way to ask the drawer what happened. A toast is worth revisiting as an *addition* once the states exist |
| E2 | Is `removeKeys` required on `PalimpClientBackendAdapter`? | **Optional**, capability-gated (2026-10-06) | An adapter written against 1.8.x keeps satisfying the interface; the drawer hides Reset when it is absent, exactly as the Publish button gates on `available`/`hasToken`. Batched for the reason `setKey` is commented out — a per-key delete allows a half-reset |
| E3 | Does an empty string mean "absent"? | **No** (2026-10-06) | An intentionally empty string has to stay representable; inferring intent from the value is how it stops being. Reset is an explicit action the editor chooses, not a reading of `""`. This is the host's ADR 039 rejection, and it stands |
| E4 | Where does undo's previous value live? | **One reserved key `__palimp.undo`** (2026-10-06), filtered out of `loadMessages()` in both server adapters | A `prev.<key>` row per key doubles the set `loadMessages()` fetches whole into every build, and every page's payload with it. One row is bounded by the batch, not by history |
| E5 | Order | **02 before 03** (2026-10-06); 01 independent | Undoing the first-ever edit to a string means removing a row. Without `removeKeys` the best available is writing the `defaultMessage` as a literal row, which looks identical today and pins the copy tomorrow |
| E6 | Version | **1.9.0** (2026-10-06) | Additive across all three: a new exported error class, a widened hook return, an optional interface member, a reserved key prefix. No existing behaviour changes meaning. **Cut by 01 on 2026-10-08** — 02 and 03 now land inside a version that already exists, or bump again if either ships separately |
| E7 | **Does Reset reach keys with no editor on the page?** | **open** — gates 02 | 02 enumerates mounted and registered keys, which is the set a page can offer. But its own report names the orphaned key — typed into a question the host later deleted, invisible and unremovable — and that key is in no store. Answering "mounted only" is coherent and leaves the reported case unfixed; answering "all stored keys" needs an adapter `listKeys` the interface does not have. Decide before building the modal |
| E8 | **Who runs the Supabase SQL on an existing project?** | **open** — gates 02 shipping to the host | `grant delete` and a delete policy are a manual step against a live, client-owned database. Until it runs, Reset fails with `42501` and looks like a bug in the feature. Whether that is a release-note instruction, a documented migration file, or a check the drawer performs is undecided |

## Plan map

| # | plan | status |
| --- | --- | --- |
| 01 | [01-publish-failure-is-silent.md](01-publish-failure-is-silent.md) — the dispatch error nothing reads | **built, 2026-10-08, as 1.9.0.** Both halves as written. Eight divergence notes at the bottom of the plan; the load-bearing one is that the auth error class had to split — a generic `PalimpPublishAuthError` in `core`, `GithubAuthError` subclassing it in the adapter — because `instanceof` in the drawer would otherwise invert the dependency direction. **All five verification steps are unrun** (no live host, no revocable PAT); the 401/403 narrowing was verified directly against the built `dist/` with a stubbed `fetch`, which is the mechanism behind step 4 but not step 4 |
| 02 | [02-reset-to-original.md](02-reset-to-original.md) — the row palimp cannot remove | **not built.** Gated on E7; needs E8 before it reaches the host |
| 03 | [03-undo-last-save.md](03-undo-last-save.md) — one reserved key, no schema change | **not built.** Needs 02 |

## Next step

**01 is built and 1.9.0 is cut.** Two things it still owes, neither of them library work:

1. **Run §Verification against a live host** — a revoked PAT and a renamed workflow. Read
   [divergence 2](01-publish-failure-is-silent.md#divergence-notes) first: steps 1 and 2 as
   written cannot both be observed, because the mount-time poll disables the button before a
   press, and a revised step 1 should rename the workflow rather than revoke the token.
2. **Revendor 1.9.0 into `nano-pro-web`** by that repo's `agent-guidelines/revendoring-palimp.md`,
   and shorten `agent-guidelines/editing-copy.md` §3 — the paragraph that teaches the client to
   check the status panel by hand exists because of this bug.

Then **answer E7 and E8 in writing**, which is what unblocks 02; 03 follows 02. Neither decision
is affected by anything 01 landed — 01 touched no adapter interface.

## Where these came from

Written in `nano-pro-web` — the first host that is not an example, and the source of all three
reports — while weighing whether to replace palimp with Sveltia CMS. That assessment, the incident
record and the client-facing handover that currently has to document these defects as behaviour all
live in that repo's `agent-guidelines/`. Three things there depend on these landing: the handover's
"the only way back is retyping it", its instruction to check by hand whether a publish actually
ran, and ADR 039's "an edit is one-way, and that is accepted".

Getting a release back into that host is its own documented procedure there
(`agent-guidelines/revendoring-palimp.md`) and is not palimp's concern beyond `pnpm pack:all`.
