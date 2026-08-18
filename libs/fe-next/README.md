# @palimp/fe-next

Binds Palimp to Next.js App Router. Gives you `palimp()` for server components, a provider that
decides whether the visitor is an admin, and a drop-in login page.

This is the package a host app imports. It carries the framework-specific parts —
`next/dynamic`, `next/navigation` — that [`@palimp/core`](../core/README.md) deliberately doesn't.

## Entry points

- `@palimp/fe-next` — `palimp()`, `setBackendAdapter()`, `PalimpProvider`
- `@palimp/fe-next/login` — `LoginPage`

## Usage

### 1. Register the server adapter

Module-level, in `app/layout.tsx`, before anything renders:

```tsx
import { setBackendAdapter } from "@palimp/fe-next";
import { createServerAdapter } from "@palimp/be-supabase/server";

setBackendAdapter(
  createServerAdapter(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
  ),
);
```

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
import { palimp } from "@palimp/fe-next";

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

`p()` returns a React element, not a string — it cannot go in an attribute, a `title`, or a
`metadata` export.

The value resolves as `loaded ?? defaultMessage ?? key`. A key with neither a stored row nor a
`defaultMessage` renders as its own key — missing content is visible rather than blank.

### 4. Add the login route

```tsx
// app/login/page.tsx
"use client";

import { LoginPage } from "@palimp/fe-next/login";

export default LoginPage;
```

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

- Calling `palimp()` before `setBackendAdapter()` throws on `undefined`. Keep the call at module
  scope in the root layout, not inside a component body.
- One server backend per process. Two backends in one app is not expressible.
- Under `next dev` HMR the module can be re-evaluated; adapters guard against duplicate SDK
  initialisation for exactly this reason (see the comment in
  [be-firebase/src/server.ts](../be-firebase/src/server.ts)).

**`palimp()` loads every message, on every render.** `loadMessages()` has no key filter and no
cache. Fine for the dozens of strings the examples carry; a full table read per page render at
larger scale.

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
