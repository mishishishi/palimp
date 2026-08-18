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

`PalimpGithubPublishProvider` is optional — leave it out and there is no Publish capability. But
see [Quirks](#quirks): omitting it while a user has a publish token leaves the button enabled and
inert.

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

Two asymmetries come with it, both permanent — see [Quirks](#quirks): `asString` has to be a
literal `true`, and an `asString` value changes only on publish.

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

**An `asString` key renders no editor.** There is no element to put one in, so the key is editable
only by someone who already knows it exists.

**Admin code is loaded through `next/dynamic`, and must stay that way.** Both
[ClientComponent.tsx](src/ClientComponent.tsx) and [PalimpProvider.tsx](src/PalimpProvider.tsx)
reach `@palimp/core/admin` dynamically, which is the only reason antd and react-query stay out of
the visitor bundle. A static import anywhere in a render path undoes it.

**`XcoreClientComponent`.** The client component in the render path still carries a previous
project's name, and `index.ts` also exports `palimp as xcore`. Both are in the public surface,
so renaming is a breaking change rather than a tidy-up.

**Silent no-op without a publish provider.** `PalimpPublishContext` holds `null` under a
non-nullable type. If the signed-in user has a `publishToken` but no publish provider is mounted,
the Publish button renders enabled and clicking does nothing.

**Peers.** `next ^16`, `react >=18`, `@palimp/core`. React 18 satisfies the declared range, but
`core` uses React 19 APIs (`use()`, the `<Context value>` shorthand), so 19 is the real floor.
