/**
 * A capture-phase guard that makes an inline editor inert to whatever
 * interactive markup a host has wrapped around it — an `<a>`, a `<summary>`, a
 * dropdown that opens on `mousedown`, a document-level hotkey.
 *
 * It listens on `window` rather than `document` on purpose: against a host
 * capture listener on `document` we would win only by registration order, while
 * on `window` we are above it outright.
 */

const EDITOR_SELECTOR = "[data-palimp-editor]";

/**
 * Stopping propagation at window-capture also kills the editor's OWN React
 * handlers — React 19 attaches its listeners at the root container, which is
 * below us. That is survivable only because the editor's single live handler is
 * `onChange`, which maps to the native `input` event.
 *
 * So never add `input`, `beforeinput`, `compositionstart`, `compositionend`,
 * `focus` or `blur` to this list. Any of them would stop typing from reaching
 * `editsStore` at all, and it would fail silently.
 */
const GUARDED_EVENTS = [
  "pointerdown",
  "mousedown",
  "mouseup",
  "pointerup",
  "touchstart",
  "click",
  "auxclick",
  "dblclick",
  "contextmenu",
  "keydown",
  "keyup",
  "keypress",
  "dragstart",
] as const;

const editorOf = (target: EventTarget | null): HTMLElement | null =>
  target instanceof Element
    ? target.closest<HTMLElement>(EDITOR_SELECTOR)
    : null;

/**
 * A drag-select that starts inside the editor and ends outside dispatches its
 * `click` at the nearest common ancestor of the two — the interactive ancestor
 * itself, with the editor nowhere on the propagation path. Inspecting the
 * target cannot see that, so remember where the press landed.
 */
let pressedInsideEditor = false;

const onGuardedEvent = (event: Event) => {
  const editor = editorOf(event.target);

  if (event.type === "pointerdown" || event.type === "mousedown") {
    pressedInsideEditor = editor !== null;
  }

  if (event.type === "click" || event.type === "auxclick") {
    const suppress = editor !== null || pressedInsideEditor;
    pressedInsideEditor = false;
    if (!suppress) return;
    // Anchor navigation, <summary>, implicit submission and the middle-click
    // new tab are all default actions of this event, cancellable from anywhere
    // on its path.
    event.stopPropagation();
    event.preventDefault();
    return;
  }

  if (editor === null) return;

  event.stopPropagation();

  switch (event.type) {
    case "mousedown":
      // Never preventDefault here: focus and caret placement *are* the default
      // action. Asserting focus is instead how we recover from an ancestor that
      // cancelled that default from its own capture listener to keep focus for
      // itself — by the time we see the event it cannot be undone.
      if (document.activeElement !== editor) {
        editor.focus({ preventScroll: true });
      }
      break;
    case "keydown":
    case "keypress":
      // A textarea absorbs Enter as a newline; a single-line input would submit
      // an enclosing form. The `form` attribute detaches it from that form too,
      // so this is the second of two locks on the same door.
      if (
        editor instanceof HTMLInputElement &&
        event instanceof KeyboardEvent &&
        event.key === "Enter"
      ) {
        event.preventDefault();
      }
      break;
    case "dragstart":
      // Selecting text inside an enclosing <a> or <img> otherwise starts a
      // native link drag.
      event.preventDefault();
      break;
  }
};

let refcount = 0;

const install = () => {
  for (const type of GUARDED_EVENTS) {
    window.addEventListener(type, onGuardedEvent, { capture: true });
  }
};

const uninstall = () => {
  for (const type of GUARDED_EVENTS) {
    window.removeEventListener(type, onGuardedEvent, { capture: true });
  }
  pressedInsideEditor = false;
};

/**
 * Installs the guard for as long as the caller holds it, and returns the
 * release. Call it from an effect — the refcount is what keeps the listeners
 * off `window` when no editor is mounted, and what keeps SSR from touching
 * `window` at all.
 */
export const retainInteractionGuard = (): (() => void) => {
  if (refcount++ === 0) install();

  return () => {
    if (--refcount === 0) uninstall();
  };
};
