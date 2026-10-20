# Editor flow — mode and drafts across navigation, publishing unsaved edits

Written 2026-10-20 against `@palimp/core` 1.10.0 (`5d3e2fe`). **Not built.** All five decisions
settled the same day — see [§Settled by the owner](#settled-by-the-owner-2026-10-20).

## Settled by the owner, 2026-10-20

Both releases agreed as ordered, and every decision taken as recommended:

| | answer |
| --- | --- |
| D1 | per tab — `sessionStorage` |
| D2 | `localStorage` + `storage`-event sync, cleared on logout |
| D3 | the reading below is the right one |
| D4 | Save and publish is the default |
| D5 | drawer actions are guarded too, via the flag `extraTargets` sets |

The owner's own diagnosis of ask 1: *"the cause might be that the nextjs site I'm building is
static build from nextjs"* — consistent with F1's document-load reading. Step 0 still records which
navigation it is.

## The asks

From the owner, 2026-10-20, verbatim:

1. *"keep preview/edit mode when changing the route"*
2. *"when no changes, prompt the user that there are unsaved changes that need to be save in
   order to publish them"*
3. *"think about other way on how to improve the user flow"*

Ask 2 is read as: **pressing Publish while the drawer holds unsaved edits should say that those
edits will not be published, and offer to save them first.** Publish rebuilds the site from the
database; an unsaved edit lives only in the browser, so today it is silently left out. A second
reading — "Publish when nothing has changed since the last publish should say so" — is noted under
[§What this plan does not do](#what-this-plan-does-not-do), because it needs data palimp does not
have yet. D3 confirms the reading.

## What the code does today

Six findings. The first two are ask 1, the third is ask 2, the rest came out of reading the flow.

**F1 — The mode is React state with the lifetime of the document.**
`PalimpProvider` ([fe-next/src/PalimpProvider.tsx](../../libs/fe-next/src/PalimpProvider.tsx))
holds `preview` in `useState(false)`. A soft navigation — `next/link`, which is what the host's
header, footer and jump nav use — keeps the layout and therefore the provider mounted, so the mode
*should* survive it. It does not survive a **document load**, and in the host several routes are
document loads by design: a reload, the locale switch (`LocaleSwitcher` says so in its own
comment: "Switching locale is a document load, and that is correct"), and any navigation where the
App Router falls back to a hard load — which a static export does whenever the route's RSC payload
(`index.txt` under `trailingSlash: true`) fails to fetch. Which of these the owner hit is not yet
known; step 0 of [§Verification](#verification) finds out before anything is built.

**F2 — Unsaved edits have the same lifetime, and their loss is silent.**
`editsStore` ([core/src/Admin/editsStore.ts](../../libs/core/src/Admin/editsStore.ts)) is a
module singleton. On a soft navigation the drafts survive — and stay in `Save (N)` even though
their editors are no longer on screen. On a document load they vanish with no prompt: there is no
`beforeunload` anywhere in palimp. This is the bigger half of ask 1. Keeping the *mode* across a
reload while dropping the *work* would make the loss more surprising, not less.

**F3 — Publish does not look at `editsStore`.**
`usePublishButton` dispatches without checking for pending edits. The same holds for every drawer action, including
the host's production dispatch built by `extraTargets` — which is worse, because that one puts the
site live without the edits the editor can still see on screen.

**F4 — A failed Save is silent.** `useSaveButton` returns neither `isError` nor `error`. On a
rejected `setKeys` the label goes from `Saving...` back to `Save (N)`, the edits stay (by design),
and nothing says the save did not happen. It is the same defect class editor-safety 01 fixed for
Publish, on the button pressed more often.

**F5 — Answering any confirm closes the drawer.** Known since 1.10.0
([drawer-actions.md](drawer-actions.md)): `closeOnClickOutside` in
[Devtools/index.tsx](../../libs/core/src/Admin/Devtools/index.tsx) is a `document` click listener
testing `drawerRef.current.contains(target)`, and antd portals a modal to `<body>`, outside the
ref. Ask 2 adds a confirm to the hottest path in the drawer, so this stops being a quirk: the editor
presses *Save and publish* and loses sight of `Saving...` and `Dispatching...` at the moment they
matter. It is a prerequisite here, not a separate nicety.

**F6 — Preview mode has no indicator outside the drawer.** Under preview every editor renders as
text; the drawer button reads `Edit mode`, but with the drawer closed nothing on the page says the
editors are off. Today that is mild because preview never outlives a reload. Once A1 lands it
will — and an editor who reloads a page into preview and sees no textareas will read it as palimp
being broken.

## Design

Four parts. A and B are the asks; B0 is B's prerequisite; C is the rest, ranked.

### A1 — The mode survives a document load

Persist `preview` in **`sessionStorage`** under `palimp:preview` (D1). Per tab, survives reload and
same-tab navigation, gone when the tab closes — "the mode of this editing session", which is what
the ask describes. `localStorage` would also open every *new* tab in preview, weeks later.

All in `fe-next`; zero files in `core`:

```tsx
const PREVIEW_KEY = "palimp:preview";

useEffect(() => {
  if (admin === undefined) {
    const session = backend.hasSession();
    // Same effect, same commit: the first admin paint already has the right
    // mode, so there is no flash of editors before the stored preview applies.
    setPreview(session && sessionStorage.getItem(PREVIEW_KEY) === "1");
    setAdmin(session);
  }
}, [admin]);

togglePreview: () =>
  setPreview((s) => {
    sessionStorage.setItem(PREVIEW_KEY, s ? "0" : "1");
    return !s;
  }),

reset: () => {
  sessionStorage.removeItem(PREVIEW_KEY);
  setAdmin(undefined);
  setPreview(false);
},
```

(Writing storage inside an updater is impure; the build will move it to an effect on `preview`, or
compute `next` outside the updater. The sketch shows *where*, not the final shape.)

No hydration concern: `preview` only matters once `admin` is `true`, and `admin` is only ever set
from this effect, never on the server.

The drawer's open/closed state is **not** persisted. Clicking a nav link is a click outside the
drawer and closes it today; that is fine and stays.

### A2 — Unsaved edits survive a document load

Persist `editsStore` to **`localStorage`** under `palimp:drafts`, and sync between tabs on the
`storage` event (D2).

- **Why `localStorage` and not `sessionStorage`:** `sessionStorage` dies with the tab, so a closed
  tab would still lose work silently, and the only backstop is `beforeunload` — which cannot tell a
  tab close from the locale switch, so it would also prompt "changes may not be saved" on a
  navigation where they *would* be restored. That is a dialog that lies. `localStorage` makes the
  drafts outlive everything short of logout, and needs no unload prompt at all.
- **Why the sync:** with shared storage, two tabs writing their own `Map` would overwrite each
  other's drafts. A `storage` listener that replaces the in-memory map from the new value keeps
  them one set — and makes a Save in tab A clear tab B's badge, which is correct, since it was one
  batch.
- **Where:** a small `draftsPersistence.ts` beside `editsStore`, started from an effect in
  `Devtools` (admin-only, client-only, so SSR and the visitor bundle never reach it). It hydrates
  the map once, subscribes to write on change, and listens for `storage`. `editsStore` gains one
  method, `replaceAll(entries)`, that swaps the map and emits once. The existing `set` / `delete` /
  `clear` keep their shape.
- **Logout clears drafts.** A shared browser must not hand one admin's drafts to the next.
- **Restore notice.** When hydration finds drafts, the drawer says so once — *"Restored 3 unsaved
  changes"* with **Review** (opens C2's list) and **Discard**. A restored draft can be older than
  the stored value it shadows; the notice is how the editor finds out it exists before saving it.
- **Version the blob** — `{ "v": 1, "entries": [...] }`, like collection documents. An unreadable
  blob is dropped, never thrown.

`core`-only change; no adapter is touched. A2 is the larger half of ask 1 and the riskier one, so
it ships second (see [§Order](#order)).

### B0 — Answering a confirm no longer closes the drawer

React synthetic events bubble through portals to their **React** parent, not their DOM parent. A
modal rendered from inside the drawer (every `contextHolder`, `FieldsModal`, `CollectionsModal`) is
a React descendant of the drawer wrapper even though antd mounts it under `<body>`. So:

```tsx
const insideRef = useRef(false);
// on the wrapper div that today carries `ref={drawerRef}`:
onClickCapture={() => { insideRef.current = true; }}

// the document listener:
const h = () => {
  if (!insideRef.current) setExpanded(false);
  insideRef.current = false;
};
```

React 19 attaches its listeners at the root container, below `document`, so the React handler has
run by the time the `document` listener does. This covers every portalled overlay — confirms,
selects, image pickers — without naming an antd class, and retires the `contains` test (which also
fails on a click whose target antd has already removed from the DOM, e.g. the OK button of a
closing confirm). It also fixes the same quirk for Save's collections confirm and every drawer
action's confirm.

### B — Publishing with unsaved edits

When `Save (N)` is non-zero and the editor presses **Publish**, a modal instead of a dispatch:

> **3 unsaved changes won't be published**
> Publish builds the site from saved content. Save them first to include them.
>
> [ Cancel ]  [ Publish without them ]  [ **Save and publish** ]

- **Save and publish** is the primary, focused button (D4). It runs the full Save path —
  including Save's own collections confirm when an item would be dropped — and dispatches only if
  the save succeeded. A failed save stops there and shows F4's error, so a press can never publish
  half of what the editor meant.
- **Publish without them** dispatches as today and leaves the drafts in place.
- With `Save (0)`, Publish behaves exactly as now. No dialog on the happy path.

Three buttons rather than `Modal.confirm`'s two, so this is a controlled `<Modal>` with its own
footer, rendered inside the drawer (which B0 then keeps open).

To chain Save from Publish, `useSaveButton` grows one function and keeps its current return:

```ts
/** Resolves true when the batch was written, false when the editor cancelled
 *  the collections confirm or `setKeys` threw. */
requestSave: () => Promise<boolean>;
```

— the existing `onClick` becomes `() => void requestSave()`, the collections confirm's `onOk` /
`onCancel` resolve the promise, and `mutation.mutate` becomes `mutateAsync`. `DevtoolsContent`
already holds both hooks, so it composes them; `usePublishButton` does not learn about `editsStore`.

**The same guard on drawer actions that publish.** `PalimpDrawerAction` gets one optional flag:

```ts
/** Ask before `run` when the drawer holds unsaved edits, offering to save
 *  them first — for an action that builds the site from saved content. */
publishesSavedContent?: boolean;
```

`extraTargets` in `@palimp/publish-github` sets it on every target it builds — that is the host's
production dispatch, the case where skipping a draft costs most (D5). The guard runs **before** the
action's own `confirm`, so production still asks its "are you sure" after the drafts are dealt with.
A host-written action that is not a build leaves the flag off and is unaffected.

Button label: unchanged. A `title` tooltip — *"3 unsaved changes won't be included"* — on Publish
while `Save (N)` is non-zero, so the information is there before the press, not only after.

### C — Other improvements, ranked

**C1 — Save failure is visible.** *(Bug; ship with B.)* `useSaveButton` returns `error` and
`reset`; the label reads `Save failed` and the error message renders under the button, cleared on
the next press — the shape 01 gave Publish. B depends on it: *Save and publish* that fails must say
why.

**C2 — A list of pending changes.** *(Ship with A2.)* A `Changes (N)` button above Save opens a
modal listing every pending entry: the key (or the field's label when `<PalimpFields>` registered
one), the new text truncated, and a per-row **Discard** (`editsStore.delete` already exists) plus
**Discard all**. It answers the question A2 creates — once drafts survive navigation and reloads,
`Save (N)` routinely counts edits the editor cannot see on the current page. It is also A2's
**Review** target and B's natural "what exactly am I about to save?". No backend change: discarding
a *draft* is local. Discarding *saved* changes stays editor-safety 02/03.

**C3 — A preview indicator.** *(Ship with A1 — it is A1's other half, per F6.)* While preview is
on, the drawer's float button swaps `PencilRuler` for `Eye` and carries a `Preview` tooltip, so a
reloaded page in preview reads as a mode, not a fault. One click on it still opens the drawer, where
`Edit mode` is.

**C4 — "Saved, not yet published."** After a successful Save, a short antd `message`: *"Saved.
Publish to put it on the site."* Beyond that, Publish could switch to `type="primary"` while a save
is newer than the latest run's `dispatchedAt` — recorded per browser in `localStorage` on each
successful save. It is a heuristic (another admin's save, or a push-triggered deploy, is invisible
to it), which is why it is ranked here rather than built with B. The exact answer — "what is saved
but not live" — is editor-safety 03's published snapshot; C4 should be built on top of that once it
exists, not instead of it.

**C5 — `Ctrl/⌘+S` saves.** Cheap in principle, but every `keydown` inside an editor is stopped at
window capture by the interaction guard ([interactionGuard.ts](../../libs/core/src/Admin/interactionGuard.ts))
before any other listener of ours sees it. The shortcut therefore has to live *in* the guard, as a
pass-through for exactly that chord — a change to the guard, which has a constraint list of its own
in architecture.md. Worth doing, as its own small commit, not bundled.

**C6 — The drawer stops scrolling.** Known since 1.10.0: the fixed `40vh` body scrolls once any
action exists, and B's tooltip and C1's error line add height. `height: "40vh"` → `max-height`
with content sizing. Small, and it lands where B0 is already editing.

## What this plan does not do

- **"Nothing to publish."** Detecting that Publish would rebuild an identical site needs to know
  what the live build read. That is editor-safety 03's `palimp-published.json` route; until it
  exists, palimp cannot tell. Once it does, the same B modal can say *"Nothing has changed since
  the last publish"*.
- **Discard saved changes / reset / undo.** Editor-safety 02–04. C2 only discards drafts.
- **A route-aware Save.** Save stays all-or-nothing across every page's drafts, which is the
  premise of `setKeys` and the reason `setKey` is commented out.

## Order

| release | parts | touches |
| --- | --- | --- |
| **1.11.0** | B0, A1 + C3, B + C1, C6 | `fe-next/PalimpProvider`; `core` Devtools `index.tsx`, `DevtoolsContent`, `useSaveButton`, new unsaved-changes modal, `PalimpDrawerAction`, `useDrawerAction`; `publish-github/react.tsx` (`extraTargets` sets the flag) |
| **1.12.0** | A2 + C2 | `core` `editsStore`, new `draftsPersistence.ts`, Devtools (hydrate, restore notice, Changes modal), logout path |
| later | C4 (after editor-safety 03), C5 | — |

A1 before A2 because it is small, `fe-next`-only and answers the literal ask; A2 changes where
the editor's work lives and deserves its own release and its own verification. Versions move in
lockstep across all five packages, as always.

Docs per release: `core` and `fe-next` READMEs (quirks: "preview persists per tab"; for A2,
"drafts persist per browser until saved, discarded or logged out"), `publish-github` README for the
flag, and architecture.md's *Render, edit, save* bullets — the "Preview mode short-circuits the
input" and "`editsStore` is a plain module singleton" entries both change meaning.

## Verification

Client-side admin UI throughout, so `check-types` and `build` prove only that it compiles. The
real checks run against `examples/supabase-next` with real credentials over the CDP rig. **The
example has one content route**; add a second (`app/about/page.tsx`, a few `p()` keys and a
`next/link` both ways) for steps 1–4. Firebase unrun unless brought into scope.

0. **Before building — which navigation loses the mode?** In the host's preview deploy: enter
   preview, set `window.__probe = 1` in the console, click a header link. Probe survives → soft
   navigation, and the loss is somewhere else (look for a remount: a `key` on a layout, a provider
   below a changing segment). Probe gone → document load, and A1 + A2 are the fix. Record the
   answer here as a divergence note either way.
1. Preview on → soft-navigate → still preview. Reload → still preview, and **no editor flashes**
   before the text renders. New tab → edit mode. Logout + login → edit mode.
2. Preview on, drawer closed → float button shows `Eye`.
3. *(1.12.0)* Type on page 1, navigate to page 2, reload → `Save (1)`, restore notice shown.
   Second tab shows the same count; Save in one clears both. Logout → `palimp:drafts` gone.
4. *(1.12.0)* `Changes (2)` lists both pages' edits; per-row Discard drops one and the inline
   editor on its page loses the cyan outline.
5. Edit, press Publish → modal. Cancel → nothing dispatched, drawer still open (B0). *Publish
   without them* → dispatches, `Save (1)` remains. *Save and publish* → `Saving...` then
   `Dispatching...`, drawer open throughout, `Save (0)`.
6. Make Save fail (revoke the update policy, or point the example at a wrong key) → `Save failed`
   with the message; *Save and publish* does **not** dispatch.
7. Pending collection item that the build would drop → *Save and publish* shows the collections
   confirm first; *Keep editing* → neither saved nor dispatched.
8. An `extraTargets` action with drafts pending → unsaved-changes modal, then the action's own
   confirm with Cancel focused.
9. `Save (0)` → Publish dispatches with no dialog, as in 1.10.0.

## Decisions

| | question | recommended | alternatives |
| --- | --- | --- | --- |
| D1 | Where the mode persists | **`sessionStorage`** — per tab | `localStorage` (new tabs open in preview); URL param (leaks into shared links) |
| D2 | How drafts survive | **`localStorage` + `storage`-event sync, cleared on logout** | `sessionStorage` + `beforeunload` (prompts falsely on locale switch, loses on tab close); `beforeunload` only (prompts on every document-load navigation) |
| D3 | What ask 2 means | **Publish with unsaved edits → explain and offer Save and publish** | also "nothing to publish" — deferred to editor-safety 03 |
| D4 | Default button in the B modal | **Save and publish** | Cancel (safer, but the common intent is to include the edits) |
| D5 | Guard drawer actions too | **Yes, via `publishesSavedContent`, set by `extraTargets`** | Publish only (leaves the production dispatch, the costlier case, unguarded) |

## Divergence notes — 1.11.0

Added 2026-10-20, after building 1.11.0 (B0, A1 + C3, B + C1, C6). The plan above is kept as
written; these record what step 0 found, and where the code went somewhere the plan did not say.

**1. Step 0: a document load, as F1 guessed.** On the example served as a static export with
clean URLs, a `window.__probe` survived a `next/link` click and died on a plain `<a>`. On the
host's preview deploy, the header link from `/en/` to `/en/projects/` kept the probe — a soft
navigation. So the host's provider does survive its ordinary links; the mode is lost on document
loads: a reload, the `LocaleSwitcher` (a document load by design), and any plain `<a>`. A1 covers
all three for the mode; drafts wait for A2.

**2. B0 listens on `window`, and clears the flag on the way down.** The plan's sketch reset
`insideRef` after reading it in a `document` listener. A click whose propagation a handler stops
before that listener — a React `stopPropagation` inside the drawer — would then leave the flag set
and swallow the next genuine outside click. So a `window` capture listener clears it, the
wrapper's `onClickCapture` sets it, and a `window` bubble listener reads it. Clicking an **inline
editor** still never closes the drawer: the interaction guard stops that click at `window`
capture, before the bubble listener. That was true of the `contains` handler as well, and it is
now a documented quirk in core's README.

**3. The B modal is a controlled `Modal`, not `modal.confirm`.** Three buttons — Cancel, Publish
without them, Save and publish — do not fit confirm's two. It is one `useUnsavedChangesGuard`
per drawer, in `DevtoolsContent`, whose `guard` is passed to every `DrawerActionButton`, so
there is one dialog and one Save in flight. `useDrawerAction(action, guardUnsaved)` runs the
guard before the action's own `confirm`. The `title` hint (`N unsaved changes won't be
included`) on every guarded button was not in the plan; it puts the warning before the press.

**4. `requestSave()` resolves a boolean.** `useSaveButton` now returns `requestSave():
Promise<boolean>` — `true` once the batch is written, `false` on `Keep editing` at the
collections confirm or a rejected `setKeys` — and the Save button's own press is
`void requestSave()`. Save and publish publishes only on `true`.

**5. C6 needed more than `max-height`.** The `40vh` box went, and the drawer's root and wrapper
became `position: relative`, so it sizes to its content and the fixed column centres it; the cap
(`calc(100vh - 32px)`) sits on the section. But in a flex column a short viewport *squashed*
every button instead of scrolling, so the body is now a one-column grid
(`minmax(0, 1fr)`, so the scrollbar does not push the column wider than the drawer). The spacer
above Publish is an empty grid row, kept for its gap. Found while measuring: a long email in the
user row overflowed the 192 px body sideways by 20 px — the horizontal scrollbar visible in every
1.10.0 screenshot — so the name and email now ellipsise, with the address as a `title`.

**6. The version bump is inside the feature commit**, as every release before it.

### Verification, 2026-10-20

Run against the Supabase example as a static export (`next build`, served with clean URLs) in
Chrome over CDP, signed in as the owner. Every GitHub dispatch was **intercepted and failed in
the browser** (CDP `Fetch` on `*/dispatches*`), so nothing deployed: "dispatched" below means the
request was made, which ends the code path this release changed. Firebase was not run.

| step | result |
| --- | --- |
| 0 | as divergence 1 |
| 1 | preview on → soft navigation to `/about` keeps it (probe intact) → reload of `/about` and `/` keeps it, **0 editors at any DOM mutation** (control in edit mode: 33) → new tab opens in edit mode → logout clears `palimp:preview`, login lands in edit mode |
| 2 | float button `lucide-eye` in preview, `lucide-pencil-ruler` in edit |
| 5 | modal on Publish with `Save (1)`; Cancel → no request, drawer open; Publish without them → dispatched, `Save (1)` kept, drawer open; Save and publish → saved (`Save (0)`, value persisted across a reload) then dispatched |
| 6 | Supabase writes failed via CDP (`POST /rest/v1/inline`) → `Save failed` + `TypeError: Failed to fetch`, **no dispatch**; retry with writes restored → `Save (0)` |
| 7 | blank collection item → Save and publish → collections confirm → Keep editing → neither saved nor dispatched, `Save (1)` kept; Discard's popconfirm no longer closes the drawer |
| 8 | temporary `extraTargets` entry in the example (reverted) → title hint, unsaved-changes modal, then the target's own confirm with Cancel focused → OK → dispatched; drawer open throughout |
| 9 | not run separately; the `Save (0)` branch is the same `guard` call, taken by every press after a save above |
| C6 | 820 px viewport: drawer 354 px, no scroll either axis, with an action present; 300 px: capped at 268 px, body scrolls, buttons keep 32 px |

The edit used for steps 5–6 (`nav.brand`) was saved back to its original value.

