# docs/plans — historical design records

**Nothing in this folder describes current API.**

Each file here was written *before* the feature it discusses was built: a proposal, the trade-offs
weighed at the time, and a verification checklist. They are kept as written, unedited, because the
reasoning is worth having — including the parts that turned out differently.

They drift, and some already have. Read them for *why*, never for *what*.

For how the code behaves today:

- [../architecture.md](../architecture.md) — contracts, flows, sharp edges
- the package READMEs under [libs/](../../libs/) — entry points, data models, quirks
- the source, which is ~2 300 lines and the only authority

| plan | landed as | notes |
| --- | --- | --- |
| [publish-github.md](publish-github.md) | `@palimp/publish-github` | Its `PalimpPublishAdapter` was superseded by `publish-status.md` before the ink dried. Config no longer carries a `token`. |
| [publish-status.md](publish-status.md) | run status icon + modal | Closest to current, but several details shipped differently — see the divergence note at the end of the file. |
| [be-firebase.md](be-firebase.md) | `@palimp/be-firebase` | Landed essentially as written. Its "Files modified: None" claim held, which is the load-bearing evidence for the adapter design. |
| [documentation.md](documentation.md) | this documentation set | Executed. |
| [interactive-ancestors.md](interactive-ancestors.md) | the window-capture interaction guard | **Built**, §A4 excepted — the Alt+click passthrough stays deferred, with preview mode as the escape hatch. Divergences, all narrowing-or-widening rather than reversals, are recorded at the end of the file. |
| [collections/](collections/) | **not built** | A multi-phase plan **set**, not a single plan — the first one here. [collections/README.md](collections/README.md) is a living index (phase map, decision log, next steps) and the entry point; [00-exploration.md](collections/00-exploration.md) is the 2026-08-19 exploration that grounds it, kept as written. One plan file per phase, each written before its phase is built. |
| [host-adoption.md](host-adoption.md) | `pnpm pack:all`, `asString`, `PalimpFields`, the session error state and the disabled Publish button | **Nearly all built.** Written for the first host that was not an example. §D (tarball distribution, lockstep versions), §B (`asString`, the cached load, the shared registration module), §E items 1–2 and §B2 + §A all landed. Only §C (a host-side measurement) and §E item 3 (the browser PAT, documented not fixed) remain, and neither is a library change. One divergence note per section at the end; the §E and §B2 notes record which verification items could not be run without credentials. |
| [publish-status-staleness.md](publish-status-staleness.md) | `@palimp/publish-github` 1.8.1 | Three independent causes of one stale Publish modal, reported by the first non-example host. Built as written; records the rejected alternative (plumbing the modal's open state into the hook) and what `cache: "no-store"` costs in rate limit. |
| [editor-safety/](editor-safety/) | `PalimpPublishAuthError`, `GithubAuthError`, the Publish button's failed states (1.9.0) | A plan **set** of four: the publish failure that reports success, a reset to the dictionary original, a discard back to the live build, and a one-step undo. 01, 02 and the undo were written in one pass in the host repo; 03 was added here on 2026-10-08 and renumbered the undo to 04. 02 adds the `removeKeys` the adapter has never had and everything after it spends that, so 02 gates 03 and 04; 01 was independent. **01 built and verified against a live host** (2026-10-08, the supabase example with a real PAT); 02 is next and needs one scope call, 03 carries three open decisions of its own. [editor-safety/README.md](editor-safety/README.md) is the living index and carries them. 01's eight divergence notes include the one that matters to anyone reading the seam: the auth error class is split between `core` and the adapter, because the drawer's `instanceof` cannot point outward. 1.9.0's handover to the host is [../releases/1.9.0-revendor-nano-pro-web.md](../releases/1.9.0-revendor-nano-pro-web.md). |
| [drawer-actions.md](drawer-actions.md) | **not built** | Optional host-configured buttons under Publish, targeted at 1.10.0: a generic `PalimpDrawerActionsContext` in `core`, plus a serializable `extraTargets` prop on `PalimpGithubPublishProvider` so a Server Component layout can configure one. Written 2026-10-19 in `nano-pro-web`, after a host-side button was built and rejected for fighting the drawer's stacking context; its decisions were settled by the host's owner the same day. |

## Adding a plan

New plans go in as new files. Don't rewrite an existing one to match reality — that destroys the
record of what was expected versus what happened, which is the only thing these files are still
good for. If a plan is contradicted by the code, add a divergence note at the bottom.

A feature too large for one plan gets a **folder** instead — one plan file per phase, each still
written before its phase is built and kept as written afterwards, plus a `README.md` that is
explicitly a living index: phase statuses, a decision log and the next step, updated as the work
moves. [collections/](collections/) is the pattern to copy.
