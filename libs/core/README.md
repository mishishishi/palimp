# @palimp/core

The contracts every other Palimp package is written against, plus the admin UI they drive. No
backend, no framework binding — `core` imports nothing from `@palimp/be-*`, `@palimp/fe-*`, or
`@palimp/publish-*`.

Most integrators never import this package directly; they get it through
[`@palimp/fe-next`](../fe-next/README.md) and a backend adapter. You import it when you are
writing an adapter of your own.

## Entry points

Three, and the split matters — see [Quirks](#quirks).

- `@palimp/core` — types, adapter interfaces, the five React contexts,
  `PalimpPublishAuthError`, and the collections module re-exported. Cheap; no UI deps pulled in.
- `@palimp/core/collections` — the collections module alone: `defineCollection`,
  `collectionKey`, `parseCollectionDocument`, `serializeCollectionDocument` and their types.
  Pure — no React at all — which is the point: the root entry re-exports the contexts, whose
  `createContext` a server component may not import, so server-side code (`fe-next`'s
  `collection()` and `<PalimpCollections>`) imports this subpath instead.
- `@palimp/core/admin` — `EditComponent`, `Devtools`, `LoginPageCore`, `PalimpFields`,
  `PalimpCollections`, `LiveCollectionList`. Pulls in antd, `@tanstack/react-query`, and lucide.

## The contracts

Implement one of these and Palimp works against your backend. Full commentary on why each is
shaped the way it is: [docs/architecture.md](../../docs/architecture.md#the-contracts).

```ts
// server: one bulk load, called once per page render
interface PalimpServerBackendAdapter {
  loadMessages: () => Promise<Message[]>;
}

// client: auth + per-key read + batched write
interface PalimpClientBackendAdapter {
  login: (value: LoginValue) => Promise<void>;
  logout: () => Promise<void>;
  hasSession: () => boolean;          // synchronous — see below
  getUser: () => Promise<User>;
  getKey: (key: string) => Promise<string | null>;
  setKeys: (entries: ReadonlyArray<readonly [string, string]>) => Promise<void>;
}

// publish: dispatch a rebuild, then follow it
interface PalimpPublishAdapter {
  publish: (token: string) => Promise<PalimpPublishRun>;
  getLatestRun: (token: string) => Promise<PalimpPublishRun | null>;
}

// media: optional. Upload a file, list a folder, name a public URL
interface PalimpMediaAdapter {
  upload: (path: string, file: File) => Promise<PalimpMediaAsset>;
  list: (prefix: string) => Promise<ReadonlyArray<PalimpMediaAsset>>;
  url: (path: string) => string;                 // pure and synchronous
}
```

`PalimpPublishAuthError extends Error` is the one **class** on the publish seam, exported as a
value. A publish adapter throws it (or a subclass) when the provider refuses the token — GitHub's
`401`/`403` — and leaves every other failure a plain `Error`. It is generic rather than GitHub's
own for the same reason the six conclusions are: the drawer narrows on it with `instanceof`, so a
second publish adapter can report a dead token without any consumer learning what GitHub is. It
lives in `core` rather than in the adapter because dependencies point inward — `core` cannot
import a class from a package that imports `core`.

`PalimpMediaAsset` is `{ path, url, size?, contentType? }`. The `image` widget stores the
**`url`** on the item, not the path — see [Writing a media adapter](#writing-a-media-adapter).

`User` is `{ id, email, name?, publishToken? }`. `publishToken` is what the publish adapter is
handed — it comes from the signed-in user's profile, not from adapter config, which is why
`publish()` takes it as an argument instead of closing over it.

A **drawer action** is not an adapter but sits on the same footing — optional, host-supplied,
read by the drawer through a context:

```ts
interface PalimpDrawerAction {
  id: string;                      // React key, and the mutation key suffix
  label: string;
  confirm?: { title: string; content: string; okText?: string };
  needsPublishToken?: boolean;     // disabled + "Missing publish token" without one
  publishesSavedContent?: boolean; // ask about unsaved drafts first, as Publish does
  run: (user: User) => Promise<{ message: string; href?: string } | void>;
}
```

`run` is a function, so a Server Component cannot hand one over. A host configuring palimp from
its layout uses a serializable form that builds these inside a client provider —
[`extraTargets`](../publish-github/README.md#extra-targets) on `PalimpGithubPublishProvider` is
the first-party one.

`LoginValue` is a single-member discriminated union
(`{ type: "email-password"; email; password }`). Adding OAuth means widening it here, in `core`.

## Contexts

```tsx
import {
  PalimpGeneralContext,        // admin | preview | togglePreview | reset
  PalimpClientBackendContext,  // PalimpClientBackendAdapter
  PalimpPublishContext,        // PalimpPublishAdapter | null
  PalimpMediaContext,          // PalimpMediaAdapter | null
  PalimpDrawerActionsContext,  // ReadonlyArray<PalimpDrawerAction>, default []
} from "@palimp/core";
```

The first two are `createContext<T>(null!)` — non-nullable type, null default. They are mandatory,
so rendering an admin component outside their providers throws rather than degrading.

`PalimpPublishContext` and `PalimpMediaContext` are the two nullable ones —
`createContext<T | null>(null)`. Both capabilities are optional, so `null` is a real state
consumers check rather than a default that never survives to a read: `usePublishButton` reports
`available: !!adapter`, `usePublishRun` passes `skipToken`, and the drawer disables Publish with
"No publish provider"; the `image` widget disables Upload and Choose existing with
"No media provider" and leaves its URL input working.

`PalimpDrawerActionsContext` is optional too, but its empty state is an empty array rather than
`null`: no actions needs no message of its own, the drawer just renders none. A provider of it
should **concatenate** with the value above it — `[...use(PalimpDrawerActionsContext), ...mine]`
— so that nesting adds actions rather than hiding a parent's.

`PalimpGeneralContext.admin` is `boolean | undefined`, and all three states are used:
`undefined` means the session check hasn't run yet, so `LoginPageCore` shows a spinner instead
of flashing a login form at someone who is already signed in. `reset()` puts it back to
`undefined`, which is how the tree re-checks the session after a login or logout.

## Writing an adapter

```ts
import type { PalimpClientBackendAdapter } from "@palimp/core";

export const createClientAdapter = (/* your config */): PalimpClientBackendAdapter => ({
  login: async ({ email, password }) => { /* … */ },
  logout: async () => { /* … */ },
  hasSession: () => /* synchronous! */ false,
  getUser: async () => ({ id, email, name, publishToken }),
  getKey: async (key) => null,
  setKeys: async (entries) => { /* batch write */ },
});
```

Then ship a `"use client"` provider that puts it on `PalimpClientBackendContext`, following
[be-supabase/src/react.tsx](../be-supabase/src/react.tsx). `pnpm check-types` catches a wrong
shape — the interfaces are the only test this repo has.

Two constraints to design around:

**`hasSession()` must be synchronous.** Its caller is `PalimpProvider`, deciding on first paint
whether to mount editing UI at all — there is nowhere to await. If your auth SDK only answers
asynchronously you have to mirror a flag somewhere readable: the Supabase adapter sniffs a
cookie, the Firebase adapter writes to `localStorage`. Both can be wrong; see
[Sessions and false positives](../../docs/architecture.md#sessions-and-false-positives) for what
that costs.

**`setKeys` is all-or-nothing.** A single-key `setKey` sits commented out at
[PalimpClientBackendAdapter.ts:10](src/PalimpClientBackendAdapter.ts) on purpose: the Save button
commits everything at once, and a partial failure should not leave half the drawer committed.
Use a real batch write (Firestore `writeBatch`, Postgres upsert) rather than a loop.

## Writing a media adapter

Optional and separate from storage, like publishing — but unlike publishing it is not separate
from the *backend*: media lives in the same project, under the same key and the same signed-in
session as the rows. So the first-party implementations ride their backend provider's `media`
prop rather than getting a provider of their own, and anyone else mounts the context directly.

```tsx
import { PalimpMediaContext, type PalimpMediaAdapter } from "@palimp/core";

const media: PalimpMediaAdapter = {
  upload: async (path, file) => ({ path, url: publicUrlOf(path) }),
  list: async (prefix) => [],           // an adapter that cannot enumerate returns []
  url: (path) => publicUrlOf(path),     // pure: no network, no SDK
};

// inside your backend provider, outside PalimpProvider
<PalimpMediaContext value={media}>{children}</PalimpMediaContext>
```

Three rules the widget and the render path assume:

**Never overwrite.** `upload` is handed a path that already carries a UTC timestamp and a random
suffix, so collisions do not happen by accident — reject them anyway (`upsert: false`, and a
backend rule that permits create only). That is what makes a stored URL point at bytes that
cannot change, which is what makes a static export's baked `<img src>` correct for the life of
the deploy and a year-long cache header honest.

**Public read.** A static export bakes the URL into HTML for months; a signed URL expires in
hours, so signed access is not a hardening option here but a conflict with the premise. Palimp
content is site content — the message rows are public-read on both backends too.

**`url()` is synchronous and pure.** No network, no SDK initialised. Both first-party backends
have a deterministic public-URL format, which is what lets `upload` and `list` return URLs
without extra round trips and lets a host compute one on the server for an `og:image`.

Nothing in the contract deletes. That is not an omission: a safe delete needs a reference check
across items, collections and prose rows, and palimp indexes none of the last. See the quirks.

## The admin UI

### `EditComponent`

One editable string. Renders an `<input>`, or a `<textarea>` with `textarea`. Reads the current
value with `useQuery` keyed on `["palimp:edit", messageKey]` and resolves what to display as
`pending ?? data ?? staleValue ?? ""` — pending edit first, then the fetched value, then the
build-time snapshot the caller passed in. Under `preview` it renders as plain text.

### `Devtools`

The left-edge drawer: Save (with a pending count), preview toggle, a **Fields** button opening the
modal of off-page fields, Publish plus a status icon and detail modal, and the signed-in user with
a logout button. Mounted by `PalimpProvider` when `admin` is true. Between Publish and the
divider sits one button per **drawer action** in `PalimpDrawerActionsContext` — none by default,
so a host that configures none sees the drawer unchanged.

The Publish button's label is the whole of its error reporting, and it has six states:
`No publish provider` and `Missing publish token` (no adapter / no token on the profile, both
disabled), `Publish token expired` (the 60 s status poll got a `PalimpPublishAuthError`, disabled
**without a press** — see [Quirks](#quirks)), `Publish failed` (the dispatch rejected; the button
stays **enabled**, because the same button is the retry), then `Dispatching...`, `Publishing...`
and `Publish`. `usePublishButton` returns `error` and `reset` alongside `available` and
`hasToken`; `onClick` calls `reset()` before `mutate()` so a retry does not leave a stale message
beside a running dispatch. `PublishStatusModal` takes the dispatch rejection as a
`dispatchError` prop and renders it above the run rows, with a plain-language cause — separate
wording from its `Couldn't load run status.`, because that one means the run cannot be *seen* and
this one means there is *no run*.

A drawer action's button borrows that vocabulary rather than inventing one. `Missing publish
token` (disabled) when `needsPublishToken` is set and the profile has none; `Running...` while
`run` is pending; then either the result — `message`, as a link when `href` is set, or `Done`
when `run` returned nothing — or `<label> failed`, with the button **enabled** as the retry. The
result or the error stays in a small line under the button until the next press, which calls
`reset()` first exactly as Publish does. The error line is the message plus the same
plain-language cause the status modal uses, narrowed on `PalimpPublishAuthError`, with the
action's own label named as the retry. With `confirm` set, the press opens `modal.confirm` from
`Modal.useModal()` — the host's antd theme, as with Save — with **Cancel focused**, so Enter is
the harmless choice. An action is a sibling of Publish, not a mode of it: nothing polls it, and
its run never appears in the status icon unless it happens to dispatch Publish's own workflow.

**Unsaved drafts are asked about before anything publishes.** Publish builds from saved content,
so pressing it with `Save (N)` pending used to leave those drafts out without a word. Since
1.11.0 Publish — and every action with `publishesSavedContent` set, which `extraTargets` does —
goes through one shared guard
([useUnsavedChangesGuard.tsx](src/Admin/Devtools/useUnsavedChangesGuard.tsx)): with nothing
pending it runs at once; otherwise a modal titled `N unsaved changes won't be published` offers
**Cancel**, **Publish without them** and **Save and publish** (primary, focused). Save and
publish runs the same `requestSave()` the Save button does — including the collections confirm —
and publishes only when that resolves `true`: a failed save, or `Keep editing` at the confirm,
publishes nothing. The guard runs before an action's own `confirm`, so the editor answers the
drafts question first. While drafts are pending the guarded buttons also carry a `title`,
`N unsaved changes won't be included`, so the warning is there before the press.

**Save says when it fails.** Until 1.11.0 a rejected `setKeys` read exactly like a finished save
— the label went back to `Save (N)`. Now it reads `Save failed`, with the error message under it,
and the button stays enabled as the retry; the drafts are kept, as they always were.

**The float button shows the mode.** It is a pencil in edit mode and an eye, with a `Preview
mode` tooltip, in preview — preview outlives a reload since 1.11.0 (see
[`fe-next`](../fe-next/README.md#quirks)), so a page with no editors on it says why while the
drawer is closed. The drawer itself is sized by its content and centred on the left edge, and
scrolls only past `100vh - 32px`.

`DevtoolsProvider` calls `getUser()` to fill the drawer. When that rejects — `hasSession()` reads
an unvalidated cookie or flag, so it can report a session the server has already dropped — the
drawer renders `DevtoolsSessionError` instead: the reason, the underlying message, and a **Sign
out** button that calls `logout()` and then `reset()`. `logout()` is the recovery because it is
the only adapter method that clears the hint `hasSession()` reads.

### `LoginPageCore`

An antd email/password form. Takes one prop, `onLogin` — the framework binding supplies the
navigation ([`fe-next`](../fe-next/README.md) pushes `/` and refreshes).

### `PalimpFields`

Registers a group of keys that are editable but not on the page — metadata read through
`p(key, { asString: true })` is the motivating case, since it renders no element and so has
nowhere to hold an inline editor. Takes `group` and `fields`, registers on mount, unregisters on
unmount, and **renders `null`**.

### `fieldsStore`

The registry behind it, and a near-copy of `editsStore`: a `Map`, a `Set` of listeners, and a
cached snapshot read through `useSyncExternalStore`. Keyed by registration id rather than by group,
so two components declaring one group can each withdraw only their own fields. Groups are merged
and keys deduped in `refresh()` — on write, not on read, because `useSyncExternalStore` needs a
referentially stable snapshot and grouping during render would allocate a new array every time.

This is a **placement** feature, not a second editor. The Devtools modal renders the ordinary
`EditComponent` per field, so modal edits land in the same `editsStore`, the same badge count and
the same `setKeys` batch as inline ones. The save path needed no changes.

### Collections

The **Collections** button in the drawer opens a modal for editing registered collections —
typed, repeatable entities whose schema the developer declares with `defineCollection` and whose
items the owner adds, edits, duplicates, reorders and deletes. One collection is one storage key
whose string value is a JSON document `{ "v": 1, "items": [...] }`; every change in the modal —
a keystroke, a toggle, an add, a delete, a move — re-serializes the document into `editsStore`
under that one key, riding the existing batched save. Design record:
[docs/plans/collections/01-core.md](../../docs/plans/collections/01-core.md).

The modal has **no Save button**, deliberately: there is exactly one save in palimp and it lives
in the drawer. Drafting is per keystroke, so what the owner typed is what Save writes, and a
failed save keeps it. The one escape hatch is **Discard changes** per collection — a single
`editsStore.delete(key)` behind a confirm, because it discards every item's changes at once.

Validation (the same `validateCollectionItems` the build uses) is display-only: it marks fields
and items and never blocks a keystroke — and Save asks before committing items the build will
drop. The build side is stricter — `parseCollectionDocument` drops invalid items with a warning
and never throws on data.

Beside `required`, `pattern`, `min` and `max`, a field can be **`unique`**: no two values equal
among the items of the nearest enclosing array — every item of the collection for a top-level or
`object` field, the entries of one list for a field inside a `list`. Exact match, first occurrence
wins, the later item invalid — the id rule, generalised. It means something on `string`, `text`,
`number`, `select` and `image`; on `boolean`, `object` or `list` it compiles, is reported once as
a schema problem, and is ignored. Design record:
[docs/plans/collections/04-save-integrity.md](../../docs/plans/collections/04-save-integrity.md).

**Save confirms, it does not block.** When a pending draft of a registered collection holds items
the next build would drop — the same `readCollectionDocument` and `validateCollectionItems` calls
the build makes, on the same string — the drawer's Save opens "Some items won't appear on the
site", one line per item with its first problem, and **Save anyway** / **Keep editing**. Save is
one all-or-nothing batch, so a disabled button would hold every other pending edit hostage to one
bad item; a saved invalid item stays in the document, marked, and publishes once fixed. Stored
invalid items with no pending draft, schema problems, and prose edits never trigger it. The
dialog comes from `Modal.useModal()`, so it renders inside the host's antd theme.

**Duplicate makes a valid copy.** The id field and every `unique` `string`/`text` field outside a
`list` get the first free `-copy`, `-copy-2`, … suffix on the value's stem (duplicating
`gros-michel-copy` yields `gros-michel-copy-2` or later, never `gros-michel-copy-copy`). `unique`
`number`, `select` and `image` fields are left out of the copy — no suffix is safe for them.
Lists are copied whole.

Unlike the Fields modal, nothing in here is an `EditComponent`: the controls are ordinary antd
inputs, nothing carries `[data-palimp-editor]`, and the interaction guard never sees their
events — **Escape closes this modal normally**, where it does not close the Fields modal with
the caret in a field. The `image` widget's native file dialog opens for the same reason.

#### The `image` widget

The eighth widget, and the only one whose value the owner cannot type from memory. It is a
preview, a URL input, **Upload**, **Choose existing** and **Clear**, and what it stores is the
file's **public URL** — so a card renders `<img src={item.photo}>` and no palimp code is in the
render path, on the server or in the browser.

The URL input is the whole widget when no `PalimpMediaAdapter` is mounted, and that is a
supported mode rather than a broken one: a repo path (`/images/hero.jpg`) or an externally
managed file typed in by hand is a working value. Upload and Choose existing are what an adapter
adds; with none they render disabled saying "No media provider", the Publish button's idiom.

Upload happens **on selection**, not at Save: the draft stays a string, the live card can show
the image immediately, and the save path stays a save path. What that costs is in the quirks.
Choose existing expands an inline grid of `adapter.list(<collection>)`, newest first — a dozen
thumbnails of that collection's folder, not a media library, and the only view palimp offers of
what the bucket holds. Because `FieldControl` recurses, an image inside a `list` — a gallery —
works the day the top-level one does, with no gallery-specific code.

Alt text is not part of the widget: an image is a file, and its description is a sibling
`string` field the developer declares.

### `LiveCollectionList`

The live half of `fe-next`'s `<PalimpCollectionList>`: renders the *working* collection document
— `pending ?? fetched ?? staleDocument`, the modal's own chain on the same query key
`useSaveButton` invalidates — mapped through a host-supplied item component, so structural
changes appear on the admin's page as they are drafted and the list refreshes after a save with
no save-path change. Loaded only through `next/dynamic`, and it registers the collection into
`collectionsStore` itself, so the page needs no separate `PalimpCollections` for it.

It parses like the **build**, not like the modal: `readCollectionDocument`, then
`validateCollectionItems`, and invalid items are **dropped** — silently, because the modal
already marks the same items via the same validator on the surface where the owner can act. The
admin's page therefore equals the next Publish. An unreadable document renders the `children`
(the baked fragment, the last known-good render); an empty *valid* document renders an empty
list, not the children — the owner deleted the items. Elements are keyed by item id, so a
reorder moves DOM nodes and a focused inline editor survives it.

One asymmetry inherited from phase 1, now with a second half: the live cards' prose editors are
real `EditComponent`s, so the **interaction guard covers them** — a live card inside a host
`<a>` or click-handling ancestor is exactly the case the guard exists for — while the *modal's*
controls remain plain antd inputs outside the guard's reach.

### `collectionsStore`

The registry behind `PalimpCollections` (and `LiveCollectionList`, which registers the same
way), a near-copy of `fieldsStore`: a `Map` keyed by
registration id, a listener `Set`, and a cached snapshot read through `useSyncExternalStore`,
merged on write. One difference — deduplication is by **resolved storage key**, not by collection
name, because `key` can be overridden on the schema and two names mapping to one key is the
collision that actually matters. First registration wins, as with fields.

### `editsStore`

A module-level singleton, not context: a `Map`, a `Set` of listeners, and a cached array
snapshot, read through `useSyncExternalStore`. The snapshot is cached because
`useSyncExternalStore` demands a referentially stable `getSnapshot` result — rebuilding
`Array.from(map.entries())` per call would loop forever. Server snapshots are `undefined` and a
shared empty array, so SSR is safe.

Being a singleton means one edit buffer per document, shared by every `EditComponent`
regardless of which provider tree it sits in.

**Drafts persist per browser since 1.12.0.**
[draftsPersistence.ts](src/Admin/draftsPersistence.ts), started by an effect in `Devtools` (so
admin-only and client-only), mirrors the buffer to `localStorage` under `palimp:drafts` as
`{ "v": 1, "entries": [[key, value], …] }`, hydrates it once through
`editsStore.replaceAll(entries)`, and follows other tabs' writes on the `storage` event — every
tab holds the same set, and a Save or a discard in one clears the others. A key that leaves the
set that way is refetched, since the value under it may have been saved over there. An
unreadable blob is removed, never thrown. A deliberate **sign-out discards** the drafts (asking
first when there are any); nothing else does — not a closed tab, not an expired session.

When hydration brings drafts back, a notice says so once per tab — *Restored N unsaved changes*,
with **Review** and **Discard** — because a restored draft can be older than the stored value it
shadows. **Review** opens the **Changes** list, which the icon button beside Save opens too:
every pending draft with its field label (when this page registered one), the new text, the
fetched value struck through when it is cached, a per-row **Discard** and a **Discard all**.
Discarding is local — `editsStore.delete` / `clear` — and never touches saved content.

## Quirks

**Bundle split.** antd, react-query, antd-style, and lucide-react are hard runtime dependencies
of `@palimp/core/admin` — the drawer is an antd `Drawer` with antd `Button`s, and every data path
is a react-query hook. They are `dependencies`, not peers, so consumers get them whether or not
they use antd themselves. The mitigation is the entry-point split: `fe-next` reaches `./admin`
only through `next/dynamic`, so visitors never download any of it. Keep it that way — a static
`import … from "@palimp/core/admin"` anywhere in a render path undoes the whole arrangement.

**A dispatch failure is in React state, so a reload forgets it.** `Publish failed` and the
modal's `Dispatch failed` block both come off the `useMutation` on `usePublishButton`, which is
gone on remount. Nothing persists it, because the failed dispatch left nothing on GitHub to
re-read — unlike a run's status, which `getLatestRun` recovers precisely because the CI provider
is the store. After a reload the only surviving evidence is `Publish token expired`, and only
while the cause is a refused token. The plan that added these states weighed and rejected an
`onError` toast for being *more* transient than this
([docs/plans/editor-safety/01-publish-failure-is-silent.md](../../docs/plans/editor-safety/01-publish-failure-is-silent.md));
persisting the failure itself would need somewhere to put it, which is a different plan.

**A drawer action's result is React state too, and it does not read the status poll.** A reload
forgets the last result line and the last failure, for the reason above. And the action does not
share Publish's `Publish token expired` pre-check: that poll proves Publish's *workflow* readable,
not the action's, so a dead token on an action surfaces only after a press, as `<label> failed`
with the auth cause. An action that dispatches and then fails to locate its run (the GitHub form's
`could not locate dispatched run`) reads as failed, with the generic cause saying nothing was
rebuilt — which is wrong in that one case, and is the same wrong Publish has.

**"Outside the drawer" means outside its React tree, not its DOM.** The click-outside handler
([Devtools/index.tsx](src/Admin/Devtools/index.tsx)) closes the drawer unless a capture handler
on the drawer's wrapper saw the click first — and React events bubble through portals to their
React parent, so a click in any modal, confirm, popconfirm or select opened from the drawer
counts as inside. Until 1.11.0 it was a DOM `contains` test, and answering any confirm closed the
drawer. The other side of the same rule: a click in an **inline editor** never closes the drawer,
because the interaction guard below stops it at `window` capture before the handler sees it.
That was true of the old handler too. Click page text that is not an editor, or the close button.

**The unsaved-changes guard counts every draft in this document, not this page's.**
`editsStore` is one buffer for the whole document, so drafts typed on another route — reached by
soft navigation — are in the count, and Save and publish saves them too. That is the same batch
Save would write, so nothing is published that Save would not. Since 1.12.0 that is also true
across document loads, because the drafts are.

**A restored draft overwrites whatever was saved since it was typed.** Drafts are values, not
diffs: a draft typed last week, restored today, replaces the stored text on the next Save even
if another admin changed it in between. The restore notice and the Changes list (with the fetched
value struck through under the draft) are how the editor finds out; nothing compares them.

**The Changes list labels only what this page registered.** A field's label comes from a
`<PalimpFields>` mounted here, a collection's from a `<PalimpCollections>` here. A draft typed on
another page shows as its raw key — a collection draft still reads as `N items`, because its
value parses as a document wherever it is.

**Signing out from the session-error state keeps the drafts.** Only the drawer's own logout
discards them. The error state's **Sign out** is how an editor whose session expired gets back
in to save, so discarding there would lose exactly the work the expiry stranded. The other side:
whoever signs in next in that browser gets the restore notice for them.

**Drawer action ids must be unique across the whole tree.** The id is the React key, so two
actions sharing one — easy with nested providers, which concatenate — collide and React warns.
Nothing dedupes them.

**`PublishStatusModal` is handed the dispatch error rather than reading it.** Calling
`usePublishButton()` a second time inside the modal looks equivalent and is not: react-query's
`mutationKey` does not share state between observers, so a second `useMutation` has its own, and
the modal would always see `null`. Hence the `dispatchError` prop from `DevtoolsContent`. The
status *query* is the opposite — `usePublishRun()` is called in three places and they all share,
because queries do key on `queryKey`.

**`instanceof PalimpPublishAuthError` needs exactly one copy of `@palimp/core`.** The drawer's
`Publish token expired` branch compares against the class identity, so two resolved copies of
`core` — a host that vendors tarballs into more than one place, a mismatched version between
`core` and the publish adapter — silently fail the check and the label falls back to
`Publish failed`. It degrades rather than throws, which also means it will not announce itself.
The lockstep version across all five packages is what keeps this honest.

**The interaction guard swallows events, page-wide.** While any `EditComponent` is mounted,
[src/Admin/interactionGuard.ts](src/Admin/interactionGuard.ts) holds capture-phase listeners on
`window` for `pointerdown`, `mousedown`, `mouseup`, `pointerup`, `touchstart`, `click`,
`auxclick`, `dblclick`, `contextmenu`, `keydown`, `keyup`, `keypress` and `dragstart`. Any of
those originating inside `[data-palimp-editor]` is stopped there and **never reaches a host
listener** — not one attached with `addEventListener`, not a React one, not a document-level
hotkey. That is the point (a nested `<a>` must not navigate when the admin clicks to type), but
the blast radius is the whole document, not the ancestor chain: a global "Escape closes the
modal" handler goes quiet whenever the caret is in an editor. Preview mode removes the editors
and with them the guard's targets, which makes it the escape hatch. Palimp's own Devtools are
subject to it: in the **Fields** modal, Escape with the caret in a field no longer closes the
modal, because antd's key handler sits below `window` like every other one. Click outside, or
the close button.

Two consequences worth knowing before touching it. A click that *starts* in an editor and ends
outside is suppressed too — that is a drag-select, and its `click` is dispatched at the common
ancestor. And because window-capture is above React's root container, the guard would stop the
editor's own handlers as well; it works only because the sole live one is `onChange` → the
native `input` event, which is deliberately not guarded. Same for `beforeinput`,
`compositionstart/end`, `focus` and `blur`.

**Editors have no form owner.** Both branches carry `form="palimp-detached"`, which names no
element, and per the HTML form-owner algorithm that leaves the control owned by *no* form rather
than by the nearest ancestor one. So a host `form.reset()` cannot wipe a pending edit behind
`editsStore`'s back, `form.elements` does not grow, and constraint validation does not see an
unnamed field.

**Shared `QueryClient`.** [src/Admin/queryClient.ts](src/Admin/queryClient.ts) exports a module
singleton, and every hook passes it explicitly, so Palimp works without a `QueryClientProvider`
in the host app and never touches the host's own client. The cost: `logout()` calls
`invalidateQueries()` with no key, invalidating everything in that client.

**A collection is whole-document last-write-wins between two admins.** Two admins editing
different items of one collection overwrite each other on save — the document is one key, and
`setKeys` has no conditional write to express a version check. Today's per-key model has the
same failure one level finer; recorded, not solved.

**The badge counts a collection as one edit.** However many items changed, the collection is one
`editsStore` entry, so adding three items and deleting a fourth is `Save (1)`. Teaching the badge
about collections would mean teaching `editsStore` about its values, and not knowing them is why
it has survived every feature unchanged. The compensation is local: a dirty dot on the
collection's tab and a dirty mark per changed item.

**A duplicate `unique` value is dropped at build like any other invalid item.** `unique` is not a
warning: a host building routes from a slug-like field is the one that needs it to bite. The
modal marks the later item as it is typed, a live list drops it, Save's confirm lists it, and the
build leaves it out with a `palimp: collection` line. "First" means first **by position**, not
first written: Duplicate inserts the copy right after the original, so renaming that copy onto the
value of an item further down marks — and on the live list and at build, drops — the item further
down, not the copy being typed into. Fixing either one restores it. Two admins can still each add the same
value in separate sessions — the second Save overwrites the first document, as above.

**Empty and absent never collide.** Two items with `""` or no value in a `unique` field are both
valid on uniqueness grounds, so an optional unique field stays optional; a required one says
"required field is missing" instead. Equality is exact — no trimming, no case folding (`pattern`
is the tool for normalising input) — and typed, so `3` and `"3"` do not collide while `0` and
`-0` do.

**Duplicate does not copy prose, and leaves unique non-text fields out.** An item's prose lives in
keys derived from its id, and the copy has a new id, so its prose renders its own keys until
typed into — what an added item does. The modal cannot enumerate which derived keys a host uses,
so copying them is not on offer. A `unique` `number`, `select` or `image` field is absent on the
copy; if it is required, the validity mark says so. A host `pattern` that rejects `-copy` leaves
the copy invalid, with the pattern problem marked — the host's rule wins.

**The Save confirm checks only collections registered on the current page.** A collection draft
left pending after client-side navigation away from the page that registered it has no
declaration to validate against, and saves without the check.

**An uploaded file is public the moment it is chosen — before Save, before Publish.** The widget
uploads on selection, so between choosing a file and publishing the page there is a window in
which the bytes are reachable by anyone holding the URL while the item referencing them is still
a draft. Unlisted is not private. The alternative — hold the file and upload at Save — needs a
draft layer that is not a string, a save path that knows about media, and a live card that cannot
show the image it is about to get.

**Nothing deletes media, and orphans arrive four ways.** Deleting an item whose photo was
uploaded; **Discard changes** after an upload; re-uploading a file (a new timestamp, a new
object); and Duplicate, which copies the URL verbatim so two items share one file (unless the field is
`unique`, which Duplicate leaves out) — which is the
sharpest reason there is no delete-on-item-delete. Orphaned objects are the same category as the
orphaned prose rows both earlier collections phases documented: visible, cleaned up by hand in
the backend console. A "delete this file" affordance would need a reference check across items,
across collections and across prose rows, and palimp has no index for the last; offering it
without the check is offering a broken-image generator.

**`image` clears to absent, never `""`.** It follows the `number` rule rather than the `string`
rule, whether or not the field is required, because `<img src="">` re-requests the page itself —
an empty URL is a broken image, not a blank field. The validator agrees: a present value must be
a non-empty string, and a fresh item's required image starts **absent** with the validity mark
saying so.

**No processing.** No resizing, no variants, no format conversion, no `next/image` loader. A 9 MB
photo is served to every visitor at 9 MB. `maxBytes` on the field rejects it early and the
bucket's own limit is the backstop, but neither shrinks anything.

**`accept="image/*"` admits HEIC** on browsers that report it as an image, and HEIC renders only
in Safari. A host that cares sets `accept` to explicit types.

**An optional boolean cannot be returned to absent through the modal.** A `Switch` has no empty
state, so once touched it is `true` or `false` forever. A field whose absence is meaningful
should be a `number` or a `select`; a boolean that gates rendering wants `required: true` with a
`default`.

**`select` options that reach the schema through a widened variable degrade the inferred type to
`string`.** `defineCollection`'s `const` type parameter keeps inline literals narrow with no
`as const` — but an options array typed `string[]` somewhere upstream has already lost the
literals, and the item type falls back to `string`.

**`react` is a peer dependency; `@types/react` is a real one.** The package targets React 19 —
it uses `use()` for context reads and the React 19 `<Context value={…}>` provider shorthand
throughout, neither of which works on 18.

**No tests.** The root `test` script exits 1. `check-types` is the gate.
