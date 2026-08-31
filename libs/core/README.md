# @palimp/core

The contracts every other Palimp package is written against, plus the admin UI they drive. No
backend, no framework binding — `core` imports nothing from `@palimp/be-*`, `@palimp/fe-*`, or
`@palimp/publish-*`.

Most integrators never import this package directly; they get it through
[`@palimp/fe-next`](../fe-next/README.md) and a backend adapter. You import it when you are
writing an adapter of your own.

## Entry points

Three, and the split matters — see [Quirks](#quirks).

- `@palimp/core` — types, adapter interfaces, the four React contexts, and the collections
  module re-exported. Cheap; no UI deps pulled in.
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

`PalimpMediaAsset` is `{ path, url, size?, contentType? }`. The `image` widget stores the
**`url`** on the item, not the path — see [Writing a media adapter](#writing-a-media-adapter).

`User` is `{ id, email, name?, publishToken? }`. `publishToken` is what the publish adapter is
handed — it comes from the signed-in user's profile, not from adapter config, which is why
`publish()` takes it as an argument instead of closing over it.

`LoginValue` is a single-member discriminated union
(`{ type: "email-password"; email; password }`). Adding OAuth means widening it here, in `core`.

## Contexts

```tsx
import {
  PalimpGeneralContext,        // admin | preview | togglePreview | reset
  PalimpClientBackendContext,  // PalimpClientBackendAdapter
  PalimpPublishContext,        // PalimpPublishAdapter | null
  PalimpMediaContext,          // PalimpMediaAdapter | null
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
a logout button. Mounted by `PalimpProvider` when `admin` is true.

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
and items and never blocks a keystroke. The build side is stricter — `parseCollectionDocument`
drops invalid items with a warning and never throws on data.

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

Being a singleton means one edit buffer per page, shared by every `EditComponent` regardless of
which provider tree it sits in.

## Quirks

**Bundle split.** antd, react-query, antd-style, and lucide-react are hard runtime dependencies
of `@palimp/core/admin` — the drawer is an antd `Drawer` with antd `Button`s, and every data path
is a react-query hook. They are `dependencies`, not peers, so consumers get them whether or not
they use antd themselves. The mitigation is the entry-point split: `fe-next` reaches `./admin`
only through `next/dynamic`, so visitors never download any of it. Keep it that way — a static
`import … from "@palimp/core/admin"` anywhere in a render path undoes the whole arrangement.

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

**An uploaded file is public the moment it is chosen — before Save, before Publish.** The widget
uploads on selection, so between choosing a file and publishing the page there is a window in
which the bytes are reachable by anyone holding the URL while the item referencing them is still
a draft. Unlisted is not private. The alternative — hold the file and upload at Save — needs a
draft layer that is not a string, a save path that knows about media, and a live card that cannot
show the image it is about to get.

**Nothing deletes media, and orphans arrive four ways.** Deleting an item whose photo was
uploaded; **Discard changes** after an upload; re-uploading a file (a new timestamp, a new
object); and Duplicate, which copies the URL verbatim so two items share one file — which is the
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
