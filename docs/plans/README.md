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
| [host-adoption.md](host-adoption.md) | §D → `pnpm pack:all`, §B → `asString`, §E1–2 → the session error state and the disabled Publish button | **Partly built.** First non-example host (`nano-pro-web`). §D (distribution by tarball, lockstep versions), §B (`asString`, the cached load, the shared registration module) and §E items 1–2 landed; §A, §B2 (off-page field editing), §C and §E item 3 have not. One divergence note per section at the end — §E's records which of its verification items could not be run. |
| [nano-pro-web-phase-15.md](nano-pro-web-phase-15.md) | — | **Not a palimp plan.** The host-side companion to the above, in `nano-pro-web`'s own phase format, parked here for transfer to that repo. Its links resolve there, not here. Carries a decision note at the end: the host's backend is **Supabase**. |

## Adding a plan

New plans go in as new files. Don't rewrite an existing one to match reality — that destroys the
record of what was expected versus what happened, which is the only thing these files are still
good for. If a plan is contradicted by the code, add a divergence note at the bottom.
