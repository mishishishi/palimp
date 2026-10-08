# Reset to original — the row palimp cannot remove

Written 2026-10-06, before the fix, against `@palimp/core` 1.8.1 (`b2934c71`).
Not built. **Written in `nano-pro-web`** and moved here unchanged — see
[01's transfer note](01-publish-failure-is-silent.md#where-this-came-from).

## The report

palimp has no way back to the original string. `resolve()` is `?? defaultMessage`, the adapter
exposes `getKey` and `setKeys` and nothing else, and the Supabase schema grants no `delete` — so a
stored row wins over the dictionary for ever, and **clearing a field stores `""`, which wins too.**

The host's handover document has to say this out loud: *"the only way back is retyping it"*. In
`nano-pro-web` that reaches a proof figure, a navigation label and a legal claim — an emptied `20+`
is a blank space where a number was, and nothing in the editor undoes it. Two further consequences
of the same gap, both met in production:

- **An orphaned key is unreachable.** A question the host deleted takes its editor with it; whatever
  was typed into that key stays in the table, invisible and unremovable.
- **The developer escape hatch is the database.** Two test rows were cleared in that host by hand,
  from the Supabase table editor. That is not a workflow, and it is not available to the client who
  owns the content.

## What this is not

**It is not "treat `""` as absent".** That reading is explicitly rejected in the host's own ADR 039
(`nano-pro-web`, *How palimp is adopted*) and the rejection stands: an intentionally empty string
has to stay representable, and inferring intent from the value is how you make it unrepresentable.
This plan adds an **explicit action** that deletes the row — a different thing, with a different
affordance, that the editor has to choose.

**It is not version history.** Resetting goes to the *dictionary default*, not to the previous
value. One step back from "I cleared it" to "as the developer wrote it". The previous value is
[03-undo-last-save.md](03-undo-last-save.md), and the two are deliberately separate: this one can
restore a string nobody has a copy of, and that one can restore a string the dictionary has never
seen.

## The fix

**1. `removeKeys` on the backend adapter, batched and optional.**

```ts
export interface PalimpClientBackendAdapter {
  …
  setKeys: (entries: ReadonlyArray<readonly [string, string]>) => Promise<void>;
  removeKeys?: (keys: readonly string[]) => Promise<void>;
}
```

**Batched, for the same reason `setKey` is commented out** in that file: a per-key write allows
partial commits, and a per-key delete allows a half-reset. One call, one round trip, all or
nothing.

**Optional, so an adapter written against 1.8.x still satisfies the interface.** The drawer
capability-gates on it exactly as the Publish button gates on `available` and `hasToken` — no
adapter, no Reset affordance, no type error for anyone's third-party backend.

**2. Both first-party adapters implement it.**

`libs/be-supabase/src/client.ts`:

```ts
removeKeys: async (keys) => {
  await ensureSupabase();
  if (keys.length === 0) return;
  const { error } = await supabase!.from("inline").delete().in("key", [...keys]);
  if (error) throw error;
},
```

`libs/be-firebase/src/client.ts`: a `writeBatch` of `deleteDoc` refs, chunked at 500 (Firestore's
batch limit), which `setKeys` there already has to do.

**3. Supabase needs a grant and a policy; Firestore needs neither.** `docs/setup.md` A4 and A5 grow
one line each:

```sql
grant delete on public.inline to authenticated;

create policy "inline delete (auth)" on public.inline
  for delete to authenticated using (true);
```

Firestore's existing `allow write: if request.auth != null` **already covers delete** —
`write` is create + update + delete — so B4's rules block is unchanged. Say so in the doc, because
a reader comparing the two backends will otherwise assume the rules are stale.

⚠ **Existing projects must run the SQL.** Without it the delete fails with `42501` and the row
survives, which looks exactly like a bug in the feature. The drawer's error message should name the
grant, the way `loadMessages()` already surfaces PostgREST's `hint`.

**4. The keys have to be enumerable before they can be offered.** This is the real work, and it is
why the affordance is in the drawer rather than on the page.

- `fieldsStore` already enumerates the registered `PalimpFields` of the current page.
- `collectionsStore` already enumerates registered collections.
- **In-place keys are enumerated nowhere.** `EditComponent` knows its own `messageKey` and tells
  no one.

Add `mountedKeysStore` beside `editsStore` — the same `useSyncExternalStore` shape, a refcounted
`Map<string, number>`, registered from `EditComponent`'s existing mount effect (the one that holds
`retainInteractionGuard`) and released on unmount. It then holds exactly the keys the current page
can edit in place, which is the set a *Reset* list should offer and no more.

**5. A `Reset` modal in the drawer.** A new button beside *Fields* and *Collections*, in their
style: `Reset (n)`, disabled at `n === 0`, where `n` is the number of mounted or registered keys
that **have a stored row** — known already, because every one of them has a
`["palimp:edit", key]` query whose `data` is `null` when nothing is stored.

Each row: the key, the stored value (truncated), a checkbox. Footer: *Reset selected*, behind a
confirm in `useSaveButton`'s style:

> **Reset 3 strings to the original?**
> They go back to the text in the code, not to what you typed before. This cannot be undone from
> here.

On confirm: one `removeKeys` call, then `invalidateQueries` on each key's `editQueryKey`, so the
page re-reads `null` and renders `defaultMessage` without a reload.

⚠ **One row needs a different warning: a key with no `defaultMessage`.** A collection item's field
has no dictionary entry behind it, so resetting does not restore anything — it makes the page
render the key. The modal must mark those rows and the confirm must count them separately:
*"2 of these have no original in the code and will show their key instead."*

## What this costs

- **~5 KB of admin bundle** — one store, one modal, one button, all inside `@palimp/core/admin` and
  so behind `next/dynamic`. Nothing reaches a visitor.
- **A query per mounted editor is already paid** — `EditComponent` fetches every key it renders
  today, so the stored-value column is free.
- **An authorization model palimp does not have.** Any signed-in user can already overwrite any key;
  now any signed-in user can delete one. `docs/setup.md` already carries that caveat for writes —
  extend the sentence rather than add a second one.
- **`1.9.0`.** Additive: an optional interface member and new admin UI.

## Rejected: a Reset button beside each editor on the page

The obvious affordance, and wrong here. `EditComponent` renders a bare `<input>`/`<textarea>` styled
to inherit everything from the host's own element — that is what lets it sit inside an `<h1>`
without disturbing it. Any adjacent button is extra layout inside host markup the library does not
control, in a position it cannot know is safe. The interaction guard exists precisely because
palimp's rule is *add no boxes to the host's page*.

## Rejected: a `reset: true` sentinel through `setKeys`

Writing a magic value and having the server adapter translate it into a delete keeps the interface
at one method. Rejected: it makes the sentinel unrepresentable as content — the exact mistake this
plan's §What this is not refuses to make with `""`.

## Verification

`pnpm check-types` catches the adapters not satisfying the widened interface, which is the failure
mode that matters most here; `pnpm build` confirms the `exports` maps. Neither sees the behaviour.

In an example with real Supabase credentials:

1. **Before the grant**: press Reset, expect a visible error naming the missing `grant delete`, and
   the row still present in the table.
2. **After the grant**: press Reset on a key with a `defaultMessage`. Expect the row to disappear
   from `inline`, and the page to show the dictionary text **without a reload**.
3. **Reload and rebuild.** The static render must now carry the original too — this is what proves
   the delete reached the server's `loadMessages()`, not just the client's cache.
4. **Reset a key cleared to `""`.** This is the reported case: an emptied heading comes back.
5. **Reset a collection item's field** with no `defaultMessage`. Expect the key on the page and the
   separate count in the confirm — the warning being correct is the point of the row, not an edge.
6. **Firestore**: the same five, with no rules change, to prove `allow write` covers it.
