# Discard unpublished changes — back to the live build

Written 2026-10-08, before the fix, against `@palimp/core` 1.9.0 (`pr/10`).
Not built, and **depends on [02-reset-to-original.md](02-reset-to-original.md)** — see §Why 02 is a
prerequisite. Unlike the rest of this folder it was **not** written in `nano-pro-web`; it came out
of reading 02 and 04 aloud and finding the frequent case missing — see §Where this came from.

## The report

The plans either side of this one answer *"put this string back to what the developer wrote"* (02)
and *"put the last Save back"* (04). The question an owner actually asks is neither:

> I have been editing for an hour. I do not like any of it. Put the site back to what people are
> seeing.

Nothing in palimp can answer that, and the reason is structural rather than missing UI. **Save
writes rows immediately; the visitor sees the last build.** Between a Save and the next successful
Publish the stored state and the published state diverge, and the only way to close the gap is to
publish — which is to say, the only way out of an editing session you regret is to ship it.

The drawer has never named either state. It shows a Save count (pending edits not yet written) and
a publish run; it has no word for *written but not live*, which is where the content spends most of
its life. [01](01-publish-failure-is-silent.md) made a failed publish visible. This names the gap
that a successful publish closes.

**Why this is the common case and 02 is the rare one.** The code's `defaultMessage` is the right
target only for a key nobody has meaningfully edited yet. On a site that has been live for months,
every string an owner touches already has a stored value they approved at some point, and the thing
they want back is that one — the one on the live site — not the developer's original. 02 remains
necessary (it is the only way to remove a row at all, and the only answer for a key cleared to
`""`), but it is reached for after an accident. This is reached for after a session.

## What this is not

**It is not 02.** 02 deletes the row so the dictionary wins. This one restores the row's *published*
value. For a key the build never had a row for, the two coincide — and that is exactly the case that
needs 02's `removeKeys`.

**It is not 04.** Undo is one step back in edit history and knows nothing about builds. Three saves
after a publish, undo returns the third; this returns all three. They compose rather than overlap:
undo is for *"that last one was wrong"*, discard is for *"none of today was right"*.

**It is not a draft mode.** Stored rows stay what the next build reads. See §Rejected.

**It is not version history.** One target, defined by the artifact on the CDN. No list, no dates, no
restore-any-point. The rejection in [04](04-undo-last-save.md#rejected-an-inline_history-table)
stands and this plan does not weaken it.

## What "published" means, and why palimp cannot answer it today

`loadMessages()` is read at build time by the server adapter, with the secret key, and
[`cache()`](../../../libs/fe-next/src/palimp.tsx)d for the render. The strings are then baked into
HTML and the flight payload. After that **the build keeps no record of what it read** — the rows
have moved on, the HTML has the values but not the keys, and nothing anywhere holds the pair.

So the published set has to be captured by the only thing that knows it: the build itself.

## The fix

**1. The build emits the published set, as part of the export.** A route the host mounts in one
file, in the shape `sitemap.xml` already uses under `output: "export"`:

```ts
// app/palimp-published.json/route.ts
import { createPalimpPublishedRoute } from "@palimp/fe-next";

export const dynamic = "force-static";
export const { GET } = createPalimpPublishedRoute();
```

It rides the same `loadMessages()` every page does — one more call into a `cache()`d read, costing
nothing — and serializes:

```json
{ "builtAt": "2026-10-08T09:14:22.108Z", "messages": [["hero.title", "Bananas"], …] }
```

Next writes it into the exported output as a real file. **The secret key never leaves the build**,
and nothing is served dynamically, so the static-export premise is intact.

⚠ **`basePath`.** Both examples set it from `NEXT_BASE_PATH`, so the drawer must resolve the URL
through the same base rather than hardcoding `/palimp-published.json`. A site deployed under a
subpath is the configuration most likely to make this feature silently find nothing.

**2. The drawer fetches it and diffs.** A `Discard (n)` button beside *Save*, where `n` counts

- keys whose stored value differs from the published one, and
- keys stored with no published entry at all — written since the build.

Zero disables it, and a missing or unparseable manifest **hides the affordance entirely**, the way
the Publish button gates on `available` and `hasToken`. A host that has not mounted the route gets
no button and no error, because a host that has not mounted the route has not opted in.

**3. The commit is Save's shape, inverted.**

```ts
const { changed, added } = diff(stored, published);
await backend.setKeys(changed);    // published value back over the stored one
await backend.removeKeys(added);   // keys the build did not have — needs 02
```

Same path, same all-or-nothing batching, same confirm style as `useSaveButton`:

> **Discard 7 unpublished changes?**
> 7 strings go back to what the live site is showing, and 2 that were added since the last publish
> are removed. This cannot be undone.

⚠ **Two calls are not one transaction.** A failure between them leaves a half-discard. Rejected
adding a combined adapter method for it: the operation is **idempotent** — the published set does
not move — so pressing Discard again finishes the job, and a visible error plus a count that has
not reached zero is a true report of the state. A third interface member for a case a retry fixes is
not worth the seam.

**4. The count is worth having on its own.** *n unpublished changes* beside the Publish button is
the other half of what 01 started: an editor who cannot tell whether a publish succeeded also
cannot tell whether one is needed. The count answers both, and it is the same diff.

**5. `/palimp-published.json` becomes a reserved URL**, documented in `docs/architecture.md` beside
the `__palimp.` key prefix [04](04-undo-last-save.md) reserves.

## Why 02 is a prerequisite

A key first written after the last build has no published value. Putting the site back means the row
must **not exist**, which is `removeKeys` and nothing else. Writing the `defaultMessage` as a
literal row instead would look right today and pin the copy tomorrow — the same failure 04 names
for undo. The common editing session includes at least one brand-new key, so this is the normal
path, not an edge.

## Gate decisions

Three, all open, all recorded in [README's decision log](README.md#decision-log) as E9–E11. Each
must be answered in writing before this is built.

- **E9 — every stored row in the manifest, or only the keys the build rendered?** Every row makes
  the file a complete key list, which is the `listKeys` E7 wanted, for free. It also publishes keys
  nothing renders — orphans, draft fields, the key namespace — at a URL any crawler can read. The
  values of rendered keys are already public in the HTML; these are not.
- **E10 — is the diff exact site-wide, or scoped?** Exact needs a client-side list of stored keys:
  either from a full manifest (E9) or a new optional `listKeys` on the adapter. Scoped means the
  diff covers the manifest's keys plus the page-known set 02 builds, and misses a key created after
  the build on a page the editor has since left. **E10 subsumes E7**: whatever lets this count
  exactly is what lets Reset reach an orphan.
- **E11 — does Discard also drop pending unsaved edits?** `editsStore` holds typed-but-unsaved
  values. Leaving them makes the count go to zero while the page still shows edits; clearing them
  destroys work the editor has not committed. Whichever way, the confirm has to say it.

## What this costs

- **One more wiring step for the host** — a route file, in `docs/setup.md` beside the provider
  wiring. Opt-in by construction: no route, no button.
- **A public JSON file holding the content set** (E9). Mitigable only by narrowing what goes in it;
  a static export has no runtime to gate a request on, and the drawer's session is client-side, so
  nothing checks who is asking.
- **~4 KB of admin bundle** — a fetch, a diff, a modal, all inside `@palimp/core/admin` and behind
  `next/dynamic`.
- **One fetch of the whole published set when the drawer opens.** Same order of magnitude as the
  set `loadMessages()` already ships into every page, and it is cacheable.
- **A version, additive**: a new `fe-next` export, new admin UI, possibly an optional `listKeys`
  (E10). `1.10.0` shipping with 02, `1.11.0` after it.

## Rejected: a snapshot row written at publish time

Copy the stored set into a reserved `__palimp.published` key when a dispatch succeeds — 04's
mechanism, no public file, no host wiring. Rejected on correctness: it records **what was stored
when the button was pressed**, which is not what the build read. A Save landing between the dispatch
and the build's `loadMessages()` is baked into the site and recorded as unpublished; a build
triggered by a git push is invisible to it entirely. It would also inherit 04's blob-size cap, now
sized by the whole site rather than one batch. Cheap, and wrong in a way no editor could be expected
to understand.

## Rejected: scraping the published pages

Fetch the live HTML and read the strings out. They are there — `XcoreClientComponent` renders the
resolved value — but the key is not, and matching by text fails the moment two keys share a string.

## Rejected: a draft mode

The structurally correct fix: stored rows are a draft, Publish promotes them, and discard is free
because the draft was never live. Rejected for this plan because it inverts the premise every page,
adapter and example is built on — **a row written by Save is what the next build reads**. It needs a
second column or a second table, a migration in every existing project, a preview story, and a
rewrite of `loadMessages()` in both server adapters. Recorded here so that when it is eventually
proposed, this plan is the reason the cheap version came first rather than evidence the expensive
one was overlooked.

## Verification

`pnpm check-types` and `pnpm build` see none of this. In an example with real Supabase credentials:

1. **Build with two stored rows.** `out/palimp-published.json` exists and carries both. This is the
   step most likely to fail outright: a route handler emitted as a file under `output: "export"` is
   the `sitemap.xml` pattern, and it has never been exercised in this repo.
2. **Edit one, Save, do not Publish.** The drawer reads *1 unpublished change*. Discard puts the
   published value back, and the page shows it **without a reload**.
3. **Edit a key with no stored row, Save, Discard.** The row is *gone* from `inline`, not set to the
   default — check the table, not the page. The 02 dependency doing its job.
4. **Delete `out/palimp-published.json`, or point the host at a build without it.** The button is
   absent and nothing throws. A host that never mounts the route must not see a broken feature.
5. **Publish, let the run finish, rebuild.** The count returns to zero with no further action — this
   is what proves the manifest is the build's own record and not a snapshot of a button press.
6. **Deploy under a `NEXT_BASE_PATH`.** The drawer still finds the manifest.
7. **Grep the exported output for the Supabase secret key.** Zero hits; the manifest is built with
   it and must not contain it.
8. **Firestore**: 1–5 again, to prove the route is adapter-agnostic.

## Where this came from

Not from `nano-pro-web`'s incident record, unlike the other three. It came out of a review of this
folder on 2026-10-08, immediately after 01 landed, in which the repo owner read 02 and 04 and named
the case they had both missed — *discard what I saved, keep what is published* — and judged it more
frequent than reset-to-original. The three existing plans were written from reports of damage
already done; this one is the first written from the question an owner asks before the damage.
