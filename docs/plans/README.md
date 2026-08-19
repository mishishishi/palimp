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

## Adding a plan

New plans go in as new files. Don't rewrite an existing one to match reality — that destroys the
record of what was expected versus what happened, which is the only thing these files are still
good for. If a plan is contradicted by the code, add a divergence note at the bottom.

A feature too large for one plan gets a **folder** instead — one plan file per phase, each still
written before its phase is built and kept as written afterwards, plus a `README.md` that is
explicitly a living index: phase statuses, a decision log and the next step, updated as the work
moves. [collections/](collections/) is the pattern to copy.
