# Undo last save — one reserved key, no schema change

Written 2026-10-06, before the fix, against `@palimp/core` 1.8.1 (`b2934c71`).
Not built, and **depends on [02-reset-to-original.md](02-reset-to-original.md)** — see §Why 02 is a
prerequisite. **Written in `nano-pro-web`** and moved here unchanged — see
[01's transfer note](01-publish-failure-is-silent.md#where-this-came-from).

## The report

Save is irreversible and it is one button. Before Save there are three ways back — the browser's own
undo inside the field, retyping, or a reload, which drops the whole `editsStore` Map. **After Save
there are none.** The pending edit is cleared, the row is upserted, and the previous value existed
only in a react-query cache that has just been invalidated.

That is a surprising amount of destruction behind a button that is pressed casually and often, and
whose own guidance to editors is *"Save often, Publish deliberately"*. The host's handover document
spends a whole section on it: *"Save is not a draft you can throw away."*

## Why the previous value is already in hand

[`EditComponent`](../../../libs/core/src/Admin/EditComponent.tsx) fetches the stored value for every
key it renders, to decide whether the field has been touched:

```ts
const { data } = useQuery({
  queryKey: editQueryKey(messageKey),
  queryFn: () => backend.getKey(messageKey),
}, queryClient);
```

So at the moment `useSaveButton` runs, `queryClient.getQueryData(editQueryKey(key))` is the value
about to be overwritten, for every key with a mounted editor — which is every key a pending edit can
come from, by construction. **No extra read is needed in the common case.** Where the cache is cold
(a drawer-only field whose modal has been closed, a collection document edited and then navigated
away from), the mutation falls back to `backend.getKey(key)` for the missing ones before writing.

## The fix

**1. One reserved key: `__palimp.undo`.** Written in the *same* `setKeys` batch as the edits, so
Save stays one all-or-nothing round trip:

```ts
const entries = editsStore.entries();
const previous = await previousValues(entries, backend);   // cache first, getKey for misses
await backend.setKeys([
  ...entries,
  ["__palimp.undo", JSON.stringify({ at: Date.now(), entries: previous })],
]);
```

where `previous` is `[key, value | null][]` — `null` meaning *no row existed*, which is the case
that needs 02.

**2. `Undo last save` in the drawer**, under Save, enabled only when `__palimp.undo` is present and
its `at` is within a session's reach. It reads the blob, then:

- every entry with a string previous value → `setKeys`,
- every entry with `null` → `removeKeys` ([02](02-reset-to-original.md)),
- `__palimp.undo` itself is overwritten by the undo's own batch, so **undo is itself undoable**, one
  step, and the drawer does not have to grow a redo.

Behind the same confirm shape `useSaveButton` already uses:

> **Undo the last save?**
> 3 strings go back to what they were before, including 1 that had never been saved. Anything you
> have typed since is kept.

**3. `loadMessages()` filters the reserved key out, in both server adapters.** This is not optional
housekeeping — the blob would otherwise be fetched at build and **serialized into every page's
payload**, for every visitor, on a site that pays ~396 B per key already.

`libs/be-supabase/src/server.ts` — one PostgREST predicate:

```
/rest/v1/inline?select=key,value&key=not.like.__palimp.%
```

`libs/be-firebase/src/server.ts` — skip documents whose id starts with `__palimp.` when mapping the
snapshot; Firestore has no `not like`, and a known-prefix skip over a collection the adapter already
reads whole costs nothing.

**`__palimp.` becomes a reserved key prefix** and `docs/architecture.md` has to say so: a host may
not use it for content, and anything under it is library bookkeeping that never reaches a page.

## Why 02 is a prerequisite

The commonest undo is **the first edit to a string** — the client changes a heading, saves, and
wants it back. There was no row before, so "back" means *no row*, and without `removeKeys` the best
available is writing the `defaultMessage` as a literal row. That looks identical today and is wrong
tomorrow: the string is now pinned, and a developer's later change to the dictionary never appears.

So 03 without 02 is an undo that silently freezes copy. Ship 02 first, or ship them together.

## What this costs

- **One row, written on every Save**, holding the previous values of that batch. It is bounded by
  the batch, not by history — ten saves of three keys leave one row, not thirty.
- ⚠ **The blob is as big as the biggest value it covers.** A collection document is one key whose
  value is the whole JSON of every item; undoing a project edit therefore stores a second copy of
  it. With the `loadMessages()` filter this costs storage and one write, never page payload. Cap
  the blob at a documented size (256 KB is well above any realistic batch) and, if a batch exceeds
  it, write `{ at, entries: [], skipped: true }` and let the button read *"Last save was too large
  to undo"* rather than silently offering a partial restore.
- **One extra `getKey` per cold key on Save**, usually zero.
- **`1.9.0`**, landing with 02.

## Rejected: a `prev.<key>` row per key

The first design, and it fails on payload. `loadMessages()` fetches the whole table into the build,
so a previous-value row per key **doubles the fetched set** and every page's props with it. It
could be filtered by the same prefix predicate — but then it is the same mechanism as the single
blob with N times the rows, N times the writes and an unbounded table. One key is strictly better
and no harder.

## Rejected: an `inline_history` table

Real version history: `(key, value, saved_at, user_id)`, a revisions panel, restore any point.
Worth building one day and not this. It needs a migration in every existing project, two new adapter
methods, a pagination story and a retention policy — and it answers a question nobody has asked yet.
Every incident so far has been *"I want the last one back"*, which one row answers.

Recorded here so that when the history table is eventually built, this plan is the reason the cheap
version came first rather than evidence it was overlooked.

## Rejected: keeping the undo blob in the browser

`sessionStorage` would cost no row and no payload. Rejected: the editor who needs the undo is often
not in that tab any more — the reported shape is *saved, navigated away, noticed later* — and an
undo that is gone after a reload cannot be told to a client as a safety net. Server-side is what
makes it a promise.

## Verification

`pnpm check-types` and `pnpm build` see none of this.

In an example with real credentials:

1. **Edit two keys that have stored rows, Save, Undo.** Both go back; `inline` holds the original
   values; the page shows them without a reload.
2. **Edit a key that has never been saved, Save, Undo.** The row is *gone* from `inline`, not set to
   the default — check the table, not the page, because the two look identical on screen. This is
   the 02 dependency doing its job.
3. **Save, edit something else, Undo.** The second edit survives; only the first batch is reverted,
   and `Save (n)` still counts the pending one.
4. **Undo the undo.** One further step back; the drawer must not offer a third.
5. **`__palimp.undo` is invisible to the site.** Build the example and grep the rendered HTML and
   flight payload for `__palimp` — zero hits is the whole point of the filter, on both backends.
6. **A collection document save**, undone. The deleted project comes back with its items intact.
