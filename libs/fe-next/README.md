# @palimp/fe-next

Binds Palimp to Next.js App Router. Gives you `palimp()` for server components, a provider that
decides whether the visitor is an admin, and a drop-in login page.

This is the package a host app imports. It carries the framework-specific parts —
`next/dynamic`, `next/navigation` — that [`@palimp/core`](../core/README.md) deliberately doesn't.

## Entry points

- `@palimp/fe-next` — `palimp()`, `collection()`, `setBackendAdapter()`, `PalimpProvider`,
  `PalimpCollections`, `PalimpCollectionList`, `PalimpText`, `PalimpBackendAdapterUnsetError`,
  the `PalimpP` type, and `defineCollection` / `collectionKey` / `collectionItemKey` re-exported
  from `@palimp/core/collections`
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
    <PalimpSupabaseProvider url={…} publishableKey={…} media={{ bucket: "palimp" }}>
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

The backend provider's `media` prop is optional in the same way — leave it out and the image
widget's upload is disabled; the widget says so. It is a prop rather than a fourth provider
because media lives in the same project, key and session as the rows, and the bucket it names
has to exist first (see the backend package's README). It is implemented for Supabase today;
`PalimpFirebaseProvider` takes no `media` prop yet.

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

### Collections — typed, repeatable entities

Where `PalimpFields` places editors for flat keys, collections model *lists of things* the owner
grows and shrinks unaided: declare a schema in code, read the items in the page, register the
schema so the Devtools **Collections** modal can edit them. One collection is one storage key
whose value is a JSON document — add, delete and reorder are all "save the new document" on the
ordinary batched save. Design record:
[docs/plans/collections/01-core.md](../../docs/plans/collections/01-core.md).

```ts
// app/collections.ts
import { defineCollection } from "@palimp/fe-next";

export const varieties = defineCollection({
  name: "varieties",
  idField: "id",
  fields: [
    { name: "id", widget: "string", required: true, pattern: "^[a-z0-9-]+$", label: "Id (slug)" },
    { name: "name", widget: "string", required: true, label: "Name" },
    { name: "featured", widget: "boolean", label: "Featured" },
    { name: "photo", widget: "image", label: "Photo" },
  ],
  defaultItems: [{ id: "gros-michel", name: "Gros Michel", featured: true }],
});
```

Eight widgets (`string`, `text`, `number`, `boolean`, `select`, `object`, `list`, `image`)
with `required` / `pattern` / `min` / `max` / `unique`. A field feeding `generateStaticParams` wants
`unique: true`: two items with one slug would otherwise be one route for two items, and a
duplicate is dropped at build instead. The item type is inferred — `defineCollection`'s `const`
type parameter means `options: ["a", "b"]` narrows to `"a" | "b"` with no `as const` — and
`defaultItems` is checked against it, so a bad seed fails `check-types`, not the build. An
optional field's absence is meaningful and preserved: under `exactOptionalPropertyTypes` an
explicit `undefined` is a compile error, clearing a control in the modal deletes the key, and
`JSON.stringify` cannot express the difference anyway.

```tsx
// app/page.tsx — read in a server component, register beside <PalimpFields>
const items = await collection(varieties);   // ReadonlyArray<{ id: string; name: string; featured?: boolean }>
…
{items.map((v) => (
  <div key={v.id}>
    {v.photo ? <img src={v.photo} alt={v.name} /> : null}
    <h3>{v.name}</h3>
    <p>{p(`varieties.${v.id}.body`)}</p>      {/* prose stays a flat palimp key */}
  </div>
))}
…
<PalimpCollections collections={[varieties]} />
```

`collection()` rides the same `cache()`d read as `palimp()` and is usable in
`generateStaticParams` — an owner-added item mints its per-slug routes at the next Publish.
Invalid items are dropped with a `console.warn` carrying the greppable
`palimp: collection "<name>"` prefix; the build never throws on data, and `defaultItems` is the
fallback only when the document is missing or unreadable — never when the owner emptied it.

An `image` field stores the file's **public URL**, so rendering one is `<img src>` and nothing
else — no resolution step on the server, in the live map or for a visitor, and no palimp code in
that render path at all. A plain `<img>`, not `next/image`: on a static export `next/image`
needs `unoptimized` or a custom loader and buys nothing for a URL the build cannot process. The
owner produces the URL by uploading from the collections modal when the backend provider was
given a media adapter — and by typing it when it was not, which is what keeps a repo path a
working value.

**Item prose stays flat keys**, derived from the item's id (`varieties.<id>.body`, locale prefix
in front where the host has one). `collectionItemKey(collection, id, suffix)` computes the key —
pass the schema on the server, the bare *name* in a client card (see the quirks) — so the two
sides cannot drift into template literals that happen to agree. Derived keys need no
registration — the upsert creates rows on first save — and a fresh item's prose renders as its
own key, with an inline editor already attached, until it is typed into.

A collection rendered this way is a plain server map: a structural change reaches the page at the
next Publish. For the admin to see it immediately, wrap the map in
[`<PalimpCollectionList>`](#palimpcollectionlist--live-rendering-for-the-admin).

### `<PalimpCollectionList>` — live rendering for the admin

Wrap the baked map in the list wrapper and hand it the item renderer, and a structural change —
add, remove, reorder, a fact edited in the modal — appears on the admin's page immediately,
drafts included, the way string edits always have. A fresh item's card arrives with its prose
editor already inline, so add-item-with-prose is **one** Save and **one** Publish. Visitors keep
the baked fragment the build produced. Design record:
[docs/plans/collections/02-live-rendering.md](../../docs/plans/collections/02-live-rendering.md).

The host writes its card once, as a **client** component, and it renders both sides — the baked
children on the server, the live map in the admin's browser. `PalimpText` is the text primitive
prose inside a card needs: the same admin-gated editor `p()` renders, importable from a
`"use client"` module.

```tsx
// app/VarietyCard.tsx — the card, a client component, written once
"use client";

import { collectionItemKey, PalimpText } from "@palimp/fe-next";

export const VarietyCard = ({ item, staleBody }: {
  item: { id: string; name: string; featured?: boolean };
  staleBody?: string;
}) => (
  <div>
    <h3>{item.name}{item.featured ? " ★" : ""}</h3>
    <p>
      <PalimpText
        messageKey={collectionItemKey("varieties", item.id, "body")}
        {...(staleBody !== undefined ? { staleValue: staleBody } : {})}
      />
    </p>
  </div>
);
```

```tsx
// app/page.tsx — the server side
const items = await collection(varieties);
…
<PalimpCollectionList collection={varieties} itemComponent={VarietyCard}>
  {items.map((v) => (
    <VarietyCard key={v.id} item={v}
      staleBody={p(collectionItemKey(varieties, v.id, "body"), { asString: true })} />
  ))}
</PalimpCollectionList>
```

The division of labour: **children are the baked fragment** — mapped on the server, so the cards
can carry anything only the server knows (row-resolved prose as an ordinary string prop,
`defaultMessage` dictionaries, locale prefixes). **`itemComponent` is the live map** — called
with `{ item }` and nothing else, so every prop beyond `item` must be optional, and the compiler
rejects a card that requires more: a card needing a server-supplied prop is a card that would
render wrongly in the live map.

The wrapper is also the collection's registrar — do **not** add a separate `<PalimpCollections>`
for a collection it renders (a page that accidentally has both is harmless; first registration
wins). The live list parses like the build, not like the modal: invalid items are dropped
silently — the modal already marks them — so the admin's page equals the next Publish. An
unreadable document falls back to the baked children; an emptied one renders an empty list.

Preview mode composes with no special casing: an admin in preview sees the pending structure as
plain cards — the first time "how the page will look" is answerable for a structural change
before a Publish. One divergence to know: a fresh item whose prose was never typed previews as an
*empty* body, where the published page would render the derived key.

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

**A photo is baked like every other value.** An `image` URL reaches the visitor's HTML at build
time, so a photo used in `generateMetadata` (`og:image`) behaves exactly like an `asString`
key: it changes on Publish, not on Save. The URL also ships in the flight payload once per item
that has one — roughly 100–150 bytes each, and unlike the schema declaration it grows with the
content.

**`image` needs no code in the render path, and that is the whole design.** The field stores a
URL rather than a storage path precisely so that neither `palimp()`, `collection()`,
`<PalimpCollectionList>` nor a visitor's browser has to resolve anything. The corollary: moving
a bucket rewrites documents, because the URLs are in them.

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

**`<PalimpCollections>` and `<PalimpCollectionList>` are server components and cannot be
rendered inside a `"use client"` subtree.** The failure is Next's "async/await is not yet
supported in Client Components", which does not obviously point back here. They are server
components deliberately — the `PalimpFields` shape would serialise `defaultItems`, the whole
in-repo seed, into the flight payload on top of content already in the HTML. Resolving on the
server ships a lean declaration plus exactly one copy of the item data: the stored row if there
is one, the serialized seed if there is not. Both await the same read as `palimp()`, so
`setBackendAdapter()` must have run even on a page that never calls `palimp()` — same rule, same
registration module.

**Liveness of structural collection changes is opt-in per list.** A collection rendered as a
plain `collection()` map reaches the page at the next Publish; only a map wrapped in
`<PalimpCollectionList>` re-reads for the admin. Nothing retrofits. Either way, visitors see a
change only after Publish — and a new item's **per-slug route** always needs one:
`generateStaticParams` runs at build, and no client wrapper can mint a route on a static export.
The item's card is live; its standalone page appears at the next Publish.

**`itemComponent` must be a component exported from a `"use client"` module.** A server
component or an inline arrow fails Next's serialization with "Functions cannot be passed
directly to Client Components" — an error that names neither palimp nor the prop.

**A `"use client"` card must not import the schema module.** Importing `app/collections.ts` for
the sake of `collectionItemKey(varieties, …)` ships the schema — `defaultItems` included, the
whole in-repo seed — in the visitor's JS. The card passes the bare collection *name*
(`collectionItemKey("varieties", …)`); the server side, already holding the schema, passes the
schema.

**A client component referenced in the flight payload ships its chunk eagerly even if nothing
renders it.** This is why the card renders for visitors rather than being kept server-only with
the client card reserved for the live map: the measured alternative paid the same eager-JS cost
*and* a larger payload. The honest cost of a live list is the card's chunk plus one hydrated
card instance per item — measured on the example: ~1.5 KB of eager JS, and a *smaller*
`out/index.html`, since a client card's markup leaves the payload while its props enter it.

**Preview renders an untyped fresh prose key as empty, where publish would render the key.**
`EditComponent`'s preview chain ends `?? ""` and `PalimpText` has nothing to pass for a key with
no row. Arguably the better render — preview is a lie-detector for layout, and a long raw key is
a worse stand-in for absent copy than whitespace — but it is a preview/publish divergence, and
it will be noticed.

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
so renaming is a breaking change rather than a tidy-up. `PalimpText` is the same component under
the name documentation teaches — an index alias, not a rename.

**Peers.** `next ^16`, `react >=18`, `@palimp/core`. React 18 satisfies the declared range, but
`core` uses React 19 APIs (`use()`, the `<Context value>` shorthand), so 19 is the real floor.
