# Editable text inside interactive ancestors

**Status:** proposed · **Date:** 2026-08-18

Raised during the host integration on a real site: when a `p()` call sits inside an `<a>`, a
`<button>`, a `<summary>`, or anything else that acts on a click, the click that focuses the
editor also activates the ancestor. The page navigates or submits out from under the admin, who
came to type.

This plan covers what has to change in `libs/core/src/Admin/` and `libs/fe-next/src/` so that an
editor nested in interactive markup is inert to its surroundings, and what stays a host-side
authoring decision because no library change can reach it.

Scope: the inline editor only. Nothing here touches the four contracts, the backends, or the save
path — the whole fix lives behind `@palimp/core/admin`, so the visitor bundle is unaffected.

## What the code does today

[EditComponent.tsx:54-57](../../libs/core/src/Admin/EditComponent.tsx#L54-L57) is the entire
defence, on the `textarea` branch only:

```tsx
onClick={(e) => {
  e.stopPropagation();
  e.preventDefault();
}}
```

`preventDefault()` genuinely works for the simplest case. Anchor navigation, `<summary>` toggling
and implicit form submission are all *default actions of the `click` event*, and a listener
anywhere on the propagation path can cancel them — a descendant counts. So a bare
`<a href="/x">{p("nav.x")}</a>` does not navigate. That is why the problem reads as intermittent
rather than total, and why it took a real host to surface it.

`stopPropagation()` is the part that does not hold. It is a **React synthetic** call. React 19
attaches its listeners at the root container, so a synthetic `stopPropagation()` suppresses React
handlers on ancestors — `next/link`'s `onClick` among them — but the native event has already
propagated through every intermediate DOM node on its way to the root. Any listener the host
attached with `addEventListener` directly, or that a non-React library attached, runs regardless.

And it is one event. Everything below is untouched.

## The failure taxonomy

Each row is a distinct mechanism, not a variation.

| # | Trigger | Why the current handler misses it |
| --- | --- | --- |
| 1 | Ancestor `mousedown` / `pointerdown` handler — menus, dropdowns, drag handles, carousels | Fires *before* `click`. Focus itself is the mousedown default action, so this is the click that opens the editor. |
| 2 | Ancestor listener attached natively rather than through React | Synthetic `stopPropagation()` does not stop the native path. |
| 3 | Middle click | Dispatches `auxclick`, not `click`. Anchors act on it; nothing intercepts it. |
| 4 | Drag-select that ends outside the editor | `click` is dispatched at the nearest common ancestor of the mousedown and mouseup targets — the anchor. The editor's handler is not on the path at all, so the anchor navigates while the admin is selecting a word. |
| 5 | Document-level hotkeys — `/` to search, `j`/`k` to move, Escape to close | Every keystroke typed into the editor reaches them. On a host with shortcuts this is the loudest symptom of the set. |
| 6 | `keydown` on a `role="button"` ancestor, or Enter inside a `<form>` on the `<input>` branch | Space and Enter bubble. A textarea absorbs Enter as a newline; a single-line input triggers implicit submission. |
| 7 | Ancestor that calls `preventDefault()` on mousedown to keep focus | The inverse failure: the editor never gets focus, so it cannot be typed into at all. |
| 8 | Native drag of an enclosing `<a>` or `<img>` | Selecting text can start a link drag instead. |
| 9 | Form participation | The injected control is a member of any enclosing `<form>`: `form.reset()` clears it, `form.elements` grows, host validation sees an unnamed field. |
| 10 | The `next/dynamic` loading placeholder, [`<span>...</span>`](../../libs/fe-next/src/ClientComponent.tsx#L10) | A plain span with no handler. A click landing in that window goes straight to the anchor. |

Two non-problems, checked rather than assumed, so they are not "fixed" by mistake:

- **`<label>` is fine.** The HTML label activation behaviour explicitly does not run when the event
  target is interactive content — which a `textarea` is. This is why
  [FieldsModal.tsx:36-56](../../libs/core/src/Admin/Devtools/FieldsModal.tsx#L36-L56) nests an
  editor in a `<label>` and behaves.
- **`disabled` is fine.** Browsers do not dispatch mouse events on disabled form controls, so the
  `isLoading` window does not leak clicks to the ancestor. It is row 10 that leaks, not this.

## §A — one capture-phase guard, above every host listener

The only place that beats an arbitrary host listener is the capture phase at the top of the tree,
before the event has descended anywhere. New module
`libs/core/src/Admin/interactionGuard.ts`, installed on `window` with `capture: true`.

For each guarded event: if `event.target.closest("[data-palimp-editor]")` matches, call
`stopPropagation()`, and `preventDefault()` only where the row below says so.

| event | stop | prevent | note |
| --- | --- | --- | --- |
| `pointerdown` `mousedown` `mouseup` `pointerup` `touchstart` | ✓ | — | Never prevent: focus and caret placement *are* the default action. |
| `click` `auxclick` | ✓ | ✓ | Cancels anchor navigation, `<summary>`, submit buttons, and the middle-click new tab. |
| `dblclick` `contextmenu` | ✓ | — | Word selection and the context menu belong to the admin. |
| `keydown` `keyup` `keypress` | ✓ | Enter on `<input>` only | Stopping is what shields host hotkeys (row 5). |
| `dragstart` | ✓ | ✓ | Row 8. |

Three details that decide whether this works:

- **`window`, not `document`.** A host capture listener on `document` runs before a `document`
  listener of ours only by registration order; on `window` we are above it outright.
- **Stopping at window-capture kills the editor's own React handlers too** — React's root
  container is below us. That is acceptable *only because* the editor's one live handler is
  `onChange`, which maps to the native `input` event, and `input` is not in the table. Never add
  `input`, `beforeinput`, `compositionstart/end`, `focus` or `blur` to it. The existing `onClick`
  on the textarea must be **deleted** in the same change: once the guard is installed it can never
  fire again, and leaving it reads as the live defence when it isn't.
- **Row 4 needs state.** Record whether the last `pointerdown` was inside an editor; on
  `click`/`auxclick` whose target is *not* inside an editor, suppress anyway if that flag is set,
  then clear it. This is the drag-select case and it cannot be solved by target inspection alone.

Install with a module-level refcount driven by a `useEffect` in `EditComponent`, so the listeners
exist only while an editor is mounted and SSR never touches `window`.

**§A2 — mark the editors.** `data-palimp-editor=""` on both the `textarea` and the `input` in
`EditComponent`. It is the guard's selector, and it gives hosts a CSS hook and e2e tests an anchor.

**§A3 — assert focus.** In the `mousedown` branch, after stopping propagation, call
`focus({ preventScroll: true })` on the editor if it is not already the active element. Redundant
in the normal case; it is the only answer to row 7, where an ancestor's capture-phase
`preventDefault()` has already suppressed the focus default and cannot be undone.

**§A4 — an escape hatch, optional.** With the guard in place a nested link is unclickable in edit
mode, by design. The sanctioned way out already exists: **preview mode** short-circuits
`EditComponent` to plain text ([EditComponent.tsx:34](../../libs/core/src/Admin/EditComponent.tsx#L34)),
so the page behaves normally and the drawer toggle is one click away. If that proves too coarse in
practice, add a single condition — `if (event.altKey) return;` — letting Alt+click through to the
host. Cheap, but it is a new interaction to document, so it is proposed separately rather than
bundled.

## §B — the two gaps outside the guard

1. **The `<input>` branch.** It has no defence at all today. It is unreachable through `fe-next`
   (`p()` always passes `textarea` — recorded as a sharp edge in
   [architecture.md](../architecture.md#sharp-edges)), so this is not a live bug, but the branch is
   exported and the divergence is exactly the kind that gets noticed the day someone uses it. The
   `data-` attribute plus the Enter rule in §A closes it.
2. **The loading placeholder.** Give `ClientComponent`'s `loading` element the same
   `data-palimp-editor` attribute so the guard covers the dynamic-import window (row 10).

## §C — form detachment

Row 9 has a precise fix that costs one attribute. Per the HTML form-owner algorithm, a control
carrying a `form` attribute whose value is not the id of a form element **has no form owner** —
not the nearest ancestor form, none. So `form="palimp-detached"` on the editor removes it from
`form.elements`, from `form.reset()`, from constraint validation, and from implicit submission.

Worth having on its own merits: a host `form.reset()` currently wipes a pending edit while leaving
it in `editsStore`, which is a silent divergence between what the admin sees and what Save writes.

## §D — what stays an authoring decision

The guard makes the editor inert; it cannot make a nested editor *appropriate*. Two cases stay
with the host, and both want documenting rather than coding:

- **A control whose entire content is the editable string** — `<button>{p("cta.label")}</button>`.
  Suppressing the click makes the button unusable in edit mode, and a form control inside a
  `<button>` is invalid HTML besides. The existing answer is better than anything new:
  `p(key, { asString: true })` for the label, plus `<PalimpFields>` to give the key an editor in
  the Fields modal. No nesting, no suppression, and the save path is identical. The cost is the
  documented `asString` quirk — the button's own text changes only on publish.
- **An ancestor that calls `preventDefault()` on mousedown from a `window`-capture listener
  registered before ours.** §A3 recovers focus, but if that listener also relocates or unmounts
  the subtree there is nothing to recover into. Same answer: `asString` + `PalimpFields`.

## §E — verification

1. `pnpm check-types`.
2. `pnpm build`.
3. Manual, in an example, with a fixture section added to `examples/*/app/page.tsx`: `p()` inside
   an `<a href>`, a `next/link` `<Link>`, a `<summary>`, a `<button type="submit">` in a `<form>`,
   and a `<div>` carrying a native `mousedown` listener that logs. Check for each: click focuses
   and types, drag-select across the boundary does not navigate, middle click does not open a tab,
   `/` and Escape do not reach a document hotkey, the native listener stays silent, and preview
   mode restores every one of them.

Step 3 needs real Supabase or Firebase credentials — the admin path only mounts behind
`hasSession()`, so no build gates any of this. Ask for credentials rather than reporting the
change verified on types alone.

## Documentation to update when it lands

- [architecture.md](../architecture.md) — a bullet under **Render, edit, save** on why the guard is
  at window-capture and why `input` is excluded from it; the **Dead input branch** sharp edge
  amended if §B lands with it.
- [libs/core/README.md](../../libs/core/README.md) — quirks: the guard's blast radius, i.e. that a
  host handler will not see any pointer or key event originating in an editor.
- [libs/fe-next/README.md](../../libs/fe-next/README.md) — quirks: nested-interactive guidance and
  the `asString` + `PalimpFields` route from §D, which is the part a host author needs before they
  write the markup rather than after.
