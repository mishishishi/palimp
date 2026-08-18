# @palimp/fe-next

Binds Palimp to Next.js App Router. Gives you `palimp()` for server components, a provider that
decides whether the visitor is an admin, and a drop-in login page.

This is the package a host app imports. It carries the framework-specific parts —
`next/dynamic`, `next/navigation` — that [`@palimp/core`](../core/README.md) deliberately doesn't.

## Entry points

- `@palimp/fe-next` — `palimp()`, `setBackendAdapter()`, `PalimpProvider`,
  `PalimpBackendAdapterUnsetError`, and the `PalimpP` type
- `@palimp/fe-next/login` — `LoginPage`

## Usage

### 1. Register the server adapter

Module-level, in a module of your own that re-exports `palimp` — not in the layout body:

```tsx
// app/palimp.ts
import { palimp, setBackendAdapter } from "@palimp/fe-next";
import { createServerAdapter } from "@palimp/be-supabase/server";

setBackendAdapter(
  createServerAdapter(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
  ),
);

export { palimp };
```

Everything then imports `palimp` from `./palimp` rather than from the package, and the layout adds
`import "./palimp";` for its own side effect. The registration is a module singleton, so whichever
module runs first has to be the one that sets it — and **Next does not guarantee the layout is
evaluated before a page's `generateMetadata`**. Nothing called the backend from metadata until
[`asString`](#asstring--a-string-instead-of-an-element) existed; now it can, and a layout-body
registration is a race. Registering in the module that hands out `palimp` removes the ordering
question instead of documenting it.

Calling `palimp()` with no adapter registered throws `PalimpBackendAdapterUnsetError` with that
advice in the message.

### 2. Mount the providers

Backend outside, publish next, `PalimpProvider` innermost — it reads
`PalimpClientBackendContext`, so it has to be inside the backend provider:

```tsx
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <PalimpSupabaseProvider url={…} publishableKey={…}>
      <PalimpGithubPublishProvider owner={…} repo={…} workflow={…}>
        <PalimpProvider>
          <html lang="en"><body>{children}</body></html>
        </PalimpProvider>
      </PalimpGithubPublishProvider>
    </PalimpSupabaseProvider>
  );
}
```

`PalimpGithubPublishProvider` is optional — leave it out and there is no Publish capability. The
drawer says so: the Publish button is disabled and reads "No publish provider", the same way it
reads "Missing publish token" when the signed-in user has no token.

### 3. Wrap strings in a server component

```tsx
import { palimp } from "./palimp";

export default async function Page() {
  const { p } = await palimp();

  return (
    <main>
      <h1>{p("hero.title", { defaultMessage: "Bananas grown slowly." })}</h1>
      <p>{p("hero.lead", { defaultMessage: "A small independent farm…" })}</p>
    </main>
  );
}
```

`p()` returns a React element by default — it cannot go in an attribute, a `title`, or a
`metadata` export. Pass `asString: true` when you need the string itself.

The value resolves as `loaded ?? defaultMessage ?? key`, identically in both branches. A key with
neither a stored row nor a `defaultMessage` renders as its own key — missing content is visible
rather than blank.

### 4. Add the login route

```tsx
// app/login/page.tsx
"use client";

import { LoginPage } from "@palimp/fe-next/login";

export default LoginPage;
```

### `asString` — a string instead of an element

```tsx
p("hero.title", { defaultMessage: "Bananas grown slowly." });                   // ReactNode
p("hero.title", { defaultMessage: "Bananas grown slowly.", asString: true });   // string
```

One function, one key namespace. `p` is typed as `PalimpP`, an interface with two call signatures,
so the return type follows the flag with no annotation at the call site. The obvious use is
metadata:

```tsx
export const generateMetadata = async (): Promise<Metadata> => {
  const { p } = await palimp();

  return {
    title: p("meta.title", { defaultMessage: "Sunny Grove", asString: true }),
  };
};
```

`generateMetadata` and the page body each call `palimp()`, but `loadMessages()` is wrapped in
React's `cache()`, so the two share a single read per page render.

One asymmetry comes with it, and it is permanent — see [Quirks](#quirks): an `asString` value
changes only on publish, including for the admin. `asString` also has to be a literal `true`.

An `asString` key has no element on the page, so there is nowhere to put an inline editor.
[`PalimpFields`](#palimpfields--editing-keys-that-are-not-on-the-page) is how it gets one.

### `PalimpFields` — editing keys that are not on the page

Declare the keys, and they get editors in the Devtools **Fields** modal. The component renders
`null`: nothing is added to the page's layout.

```tsx
// app/seo.ts — one declaration, two consumers
import type { PalimpField, PalimpP } from "@palimp/fe-next";

export const seoFields = [
  { key: "meta.title", label: "Page title", defaultMessage: "Sunny Grove" },
  { key: "meta.description", label: "Meta description", defaultMessage: "…" },
] as const satisfies ReadonlyArray<PalimpField>;

export const asString = (p: PalimpP, field: PalimpField): string =>
  p(field.key, {
    ...(field.defaultMessage ? { defaultMessage: field.defaultMessage } : {}),
    asString: true,
  });
```

```tsx
// app/page.tsx
export const generateMetadata = async (): Promise<Metadata> => {
  const { p } = await palimp();
  const [title, description] = seoFields;

  return { title: asString(p, title), description: asString(p, description) };
};

export default async function Page() {
  return (
    <main>
      …
      <PalimpFields group="SEO" fields={seoFields} />
    </main>
  );
}
```

**Declare the array once and consume it twice** — through `p` in `generateMetadata`, and whole in
the body. That is the point of the shape: the two cannot drift. `PalimpP` is exported so the
helper that takes `p` has a name.

Registration is explicit. There is no auto-registration from `asString` calls, and there cannot
be: `generateMetadata` and the page body each call `palimp()` and get **separate closures**, so a
registry inside `palimp()` would never see the metadata keys — the entire motivating case.

`group` is a display heading in the modal. Two `<PalimpFields>` may share a group; their fields
merge, and a key declared twice appears once. A key that is *also* on the page is allowed — both
editors bind to the same pending edit and save together.

Editing in the modal is the same `EditComponent` the page uses, feeding the same `editsStore`: the
drawer's badge counts modal edits, and Save writes them in one batch with the inline ones.

### Adopting palimp in an app that already has a dictionary

Most real hosts already have typed i18n dictionaries. **Keep them.** Pass the dictionary value as
`defaultMessage` and let palimp rows act as *overrides*:

```tsx
{p(`${locale}.pages.home.hero.lead`, { defaultMessage: dict.pages.home.hero.lead })}
```

The dictionary stays the source of truth; the database holds only what someone has actually
edited. That buys three things: a build-time type gate that still fails when a locale misses a
key, an empty database that changes nothing, and a way out — delete the `p()` calls and the app is
exactly as it was.

**Do not migrate the dictionary into the database.** It is the obvious alternative and it is
irreversible: the type gate goes, every string becomes a network round trip at build, and a
database outage becomes a broken page rather than a stale one.

**Locales are a key prefix, not a field.** `Message` is `{ key, value }` with no locale, so a host
with more than one locale prefixes: `cs.pages.home.hero.lead`. Spell the prefix once, in a wrapper
that takes `locale` as an argument, rather than at each call site. The cost to accept is that
`loadMessages()` returns every locale's rows on every page render — it has no filter. At dictionary
scale that is fine; it is the same trade as the whole-table read, doubled.

A locale *field* would push locale awareness into `PalimpServerBackendAdapter`, both backends,
`getKey`/`setKeys` and the editor's query keys — for something string concatenation already does.
The case that would justify it is side-by-side locale editing, which prefixing genuinely cannot do.

## What `PalimpProvider` does

On mount it calls `backend.hasSession()` — synchronously, which is why that method is declared
`() => boolean` — and holds the answer in `admin: boolean | undefined`:

| `admin` | rendering |
| --- | --- |
| `undefined` | session check hasn't run; no editing UI, `LoginPageCore` shows a spinner |
| `false` | plain text, no Devtools, no admin bundle downloaded |
| `true` | inputs in place of text, Devtools drawer mounted |

It also owns `preview` (the toggle that renders edits as text) and `reset()`, which sets `admin`
back to `undefined` and thereby re-arms the session check. Login and logout both call it.

## Quirks

**`setBackendAdapter` is a module-level singleton.** A server component can't read React context,
so the server adapter is stashed in a module variable that `palimp()` reads. Consequences:

- Calling `palimp()` before `setBackendAdapter()` throws `PalimpBackendAdapterUnsetError`. Keep the
  call at module scope in a module both the layout and every page reach — never inside a component
  body. See [Register the server adapter](#1-register-the-server-adapter).
- One server backend per process. Two backends in one app is not expressible.
- Under `next dev` HMR the module can be re-evaluated; adapters guard against duplicate SDK
  initialisation for exactly this reason (see the comment in
  [be-firebase/src/server.ts](../be-firebase/src/server.ts)).

**`palimp()` loads every message, once per render.** `loadMessages()` has no key filter, so the
whole table is read; `cache()` caps that at one read per page render however many times `palimp()`
is called. Fine for the dozens of strings the examples carry; a full table read per page render at
larger scale.

**`asString` must be a literal `true`.** A computed boolean —
`p(key, { asString: someCondition })` — matches neither call signature. The error is TS2769 "No
overload matches this call" listing both, and its last line — `Type 'boolean' is not assignable to
type 'false'` — reads as if `false` were what was wanted. It isn't; a literal is. There is no use
for a runtime-varying flag: pick the branch at the call site. `asString: false` is the same as
omitting it.

**`asString` values change only on publish — including for the admin.** They are resolved at build
time and, unlike `p()`'s element branch, never re-read in the browser: a string has no component to
hold a query. So an admin editing a page title sees the drawer count the edit and Save write it,
while the `<title>` keeps the old value until the site is rebuilt. Inherent to the static-export
premise, not fixable here.

**`<PalimpFields>` declarations ship to visitors in the RSC payload.** The component renders `null`
for a visitor and loads no admin code — verified in a static export — but it is a client component
taking props from a server one, so its `group`, keys, labels and `defaultMessage`s are serialised
into the flight payload regardless. The `admin` check runs in the browser, after the server has
already rendered; there is no earlier point to make it. Nothing new in kind — every `p()` call
already ships its `messageKey` and `staleValue` the same way — but don't put anything in a `label`
you wouldn't publish.

**`p()` inside interactive markup: inert, but decide which shape you want first.** An editor
nested in an `<a>`, a `<Link>`, a `<summary>` or anything with a `mousedown` handler used to
activate that ancestor on the click that focused it. `core`'s interaction guard now suppresses
every pointer, key and drag event originating in an editor at window-capture, so
`<a href="/x">{p("nav.x")}</a>` is safe: it focuses, types, drag-selects, and does not navigate —
including on middle click, and including for host listeners attached natively. The loading
placeholder for the dynamic import carries the same marker, so the import window does not leak
either. The cost is that the link is **not clickable in edit mode**; toggle preview in the drawer
to get the page's real behaviour back.

That leaves one case the guard cannot fix, and it is a markup decision, not a bug:

- **A control whose entire content is the string** — `<button>{p("cta.label")}</button>`.
  Suppressing the click makes the button unusable while editing, and a form control inside a
  `<button>` is invalid HTML anyway. Write it as `p("cta.label", { asString: true })` and give
  the key an editor in the Fields modal with
  [`<PalimpFields>`](#palimpfields--editing-keys-that-are-not-on-the-page) instead. No
  nesting, no suppression, and the save path is identical — the trade is the `asString` quirk
  above: the button's own label changes only on publish.
- Same answer for an ancestor that cancels the `mousedown` default from its own `window`-capture
  listener registered before ours. The guard re-asserts focus, but if that listener also moves or
  unmounts the subtree there is nothing left to focus into.

**Admin code is loaded through `next/dynamic`, and must stay that way.**
[ClientComponent.tsx](src/ClientComponent.tsx), [PalimpProvider.tsx](src/PalimpProvider.tsx) and
[PalimpFields.tsx](src/PalimpFields.tsx) all reach `@palimp/core/admin` dynamically, which is the
only reason antd and react-query stay out of the visitor bundle. A static import anywhere in a
render path undoes it.

**`XcoreClientComponent`.** The client component in the render path still carries a previous
project's name, and `index.ts` also exports `palimp as xcore`. Both are in the public surface,
so renaming is a breaking change rather than a tidy-up.

**Peers.** `next ^16`, `react >=18`, `@palimp/core`. React 18 satisfies the declared range, but
`core` uses React 19 APIs (`use()`, the `<Context value>` shorthand), so 19 is the real floor.
