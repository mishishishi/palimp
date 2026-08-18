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
| [interactive-ancestors.md](interactive-ancestors.md) | **not built** | Proposed 2026-08-18. The only entry here that is still ahead of the code: editing a `p()` nested in an `<a>`, `<button>` or `<summary>`. |
| [host-adoption.md](host-adoption.md) | `pnpm pack:all`, `asString`, `PalimpFields`, the session error state and the disabled Publish button | **Nearly all built.** Written for the first host that was not an example. §D (tarball distribution, lockstep versions), §B (`asString`, the cached load, the shared registration module), §E items 1–2 and §B2 + §A all landed. Only §C (a host-side measurement) and §E item 3 (the browser PAT, documented not fixed) remain, and neither is a library change. One divergence note per section at the end; the §E and §B2 notes record which verification items could not be run without credentials. |

## Adding a plan

New plans go in as new files. Don't rewrite an existing one to match reality — that destroys the
record of what was expected versus what happened, which is the only thing these files are still
good for. If a plan is contradicted by the code, add a divergence note at the bottom.
