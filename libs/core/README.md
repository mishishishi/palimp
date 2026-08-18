# @palimp/core

The contracts every other Palimp package is written against, plus the admin UI they drive. No
backend, no framework binding — `core` imports nothing from `@palimp/be-*`, `@palimp/fe-*`, or
`@palimp/publish-*`.

Most integrators never import this package directly; they get it through
[`@palimp/fe-next`](../fe-next/README.md) and a backend adapter. You import it when you are
writing an adapter of your own.

## Entry points

Two, and the split matters — see [Quirks](#quirks).

- `@palimp/core` — types, adapter interfaces, and the three React contexts. Cheap; no UI deps
  pulled in.
- `@palimp/core/admin` — `EditComponent`, `Devtools`, `LoginPageCore`, `PalimpFields`. Pulls in
  antd, `@tanstack/react-query`, and lucide.

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
```

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
} from "@palimp/core";
```

The first two are `createContext<T>(null!)` — non-nullable type, null default. They are mandatory,
so rendering an admin component outside their providers throws rather than degrading.

`PalimpPublishContext` is `createContext<PalimpPublishAdapter | null>(null)`. Publishing is
optional, so `null` is a real state consumers check: `usePublishButton` reports
`available: !!adapter`, `usePublishRun` passes `skipToken`, and the drawer disables Publish with
"No publish provider".

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

**Shared `QueryClient`.** [src/Admin/queryClient.ts](src/Admin/queryClient.ts) exports a module
singleton, and every hook passes it explicitly, so Palimp works without a `QueryClientProvider`
in the host app and never touches the host's own client. The cost: `logout()` calls
`invalidateQueries()` with no key, invalidating everything in that client.

**`react` is a peer dependency; `@types/react` is a real one.** The package targets React 19 —
it uses `use()` for context reads and the React 19 `<Context value={…}>` provider shorthand
throughout, neither of which works on 18.

**No tests.** The root `test` script exits 1. `check-types` is the gate.
