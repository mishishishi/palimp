# docs/releases — what each release owed its hosts

One file per release that a host has to take deliberately: what changed, how the upgrade lands
there, which of its own docs the release makes false, and what only a credentialed session in that
host can verify. palimp is pre-1.0 and distributed as tarballs rather than from a registry, so an
upgrade is never just a version range — somebody repacks, revendors and re-verifies by hand.

**These are transfer artifacts.** Each was written for a particular host and handed over as a copy;
the copy in that repo is the working one. The copy here exists because the handover is the only
place some things are written down: the commit the tarballs were packed from, the checksums, the
behaviours that look like bugs and are not, and the host docs the release contradicted.

**Kept as written once the upgrade lands**, like [plans/](../plans/) — the point is the record of
what the release was expected to cost. If reality diverged, add a note at the bottom rather than
editing the steps. What the code does *today* lives in [../architecture.md](../architecture.md) and
the package READMEs.

| release | host | notes |
| --- | --- | --- |
| [1.9.0-revendor-nano-pro-web.md](1.9.0-revendor-nano-pro-web.md) | `nano-pro-web` | The silent publish failure. No host code change; the one trap is that a revoked token disables Publish before it can be pressed, so `Publish failed` is only reachable by renaming the workflow. |

Earlier handovers (1.7.0 collections, 1.8.0 save integrity, 1.8.1 publish status) were written into
the gitignored `dist-packages/` and exist only in the host's `.locally_ignored/`. They are not
reproduced here.
