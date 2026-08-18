# @palimp/be-supabase

Supabase backend adapter for Palimp. Implements the `PalimpClientBackendAdapter` /
`PalimpServerBackendAdapter` shapes from [`@palimp/core`](../core/README.md), backed by Supabase
Auth and two Postgres tables. Sibling of [`@palimp/be-firebase`](../be-firebase/README.md), which
implements the identical shapes against Firestore.

## Entry points

- `@palimp/be-supabase/client` — `createClientAdapter(url, publishableKey)`
- `@palimp/be-supabase/server` — `createServerAdapter(url, secretKey)` (server-side only — the
  secret key bypasses RLS)
- `@palimp/be-supabase/react` — `<PalimpSupabaseProvider url publishableKey>`

## Usage

```tsx
import { PalimpSupabaseProvider } from "@palimp/be-supabase/react";
import { createServerAdapter } from "@palimp/be-supabase/server";
import { setBackendAdapter } from "@palimp/fe-next";

setBackendAdapter(
  createServerAdapter(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
  ),
);

// …then wrap the tree:
<PalimpSupabaseProvider
  url={process.env.NEXT_PUBLIC_SUPABASE_URL!}
  publishableKey={process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!}
>
  {children}
</PalimpSupabaseProvider>
```

Two different keys, and the difference is the whole security model: the **publishable** key goes
to the browser and is subject to RLS; the **secret** key stays on the server and isn't.

## Postgres schema

> Reconstructed from the adapter source ([src/client.ts](src/client.ts),
> [src/server.ts](src/server.ts)) — this repo carries no migration files, so what follows is what
> the adapter requires, not a transcript of an existing database. Column types are inferred:
> everything the adapter reads or writes is a string, and `user_id` is matched against
> `auth.users.id`.

### `inline` — message values

```sql
create table public.inline (
  key   text primary key,
  value text
);
```

`key` must carry a primary key or unique constraint: `setKeys` upserts with
`{ onConflict: "key" }`, which needs one to resolve against. Document ids in the Firebase
adapter's `inline/{key}` collection are the same keys.

Read three ways:

| caller | how |
| --- | --- |
| `createServerAdapter().loadMessages()` | raw PostgREST `GET /rest/v1/inline?select=key,value` with the secret key — RLS bypassed |
| `createClientAdapter().getKey(k)` | `supabase.from("inline").select("value").eq("key", k).maybeSingle()` |
| `createClientAdapter().setKeys(entries)` | `.upsert(rows, { onConflict: "key" })` — one statement for the whole batch |

### `profiles` — per-user settings

```sql
create table public.profiles (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid unique not null references auth.users (id) on delete cascade,
  name          text,
  publish_token text
);
```

Read once per Devtools mount, as `.select("name, publish_token").eq("user_id", user.id)
.maybeSingle()`. `maybeSingle()` means at most one row per user — hence the unique constraint on
`user_id`. A missing row is not an error; `name` and `publishToken` simply come back `undefined`.

The adapter never reads `id`; it exists because the table carries its own surrogate primary key
and joins to the auth user through `user_id`. Only the uniqueness of `user_id` is load-bearing.

`publish_token` is a live GitHub PAT. It is handed to the publish adapter and used from the
browser, so its RLS policy has to be owner-only, and the token itself should be fine-grained and
scoped to `actions: write` on the one repo. See
[Security posture](../../docs/architecture.md#security-posture).

Column naming is snake_case here and camelCase in Firestore (`publishToken`). The adapters map
to the same `User` shape; the divergence is local to each and deliberate.

### Suggested RLS policies

Not enforced by this package — the adapter assumes you have set them up.

```sql
alter table public.inline   enable row level security;
alter table public.profiles enable row level security;

-- Message values are public content; the editor reads them back per key.
create policy "inline readable"      on public.inline
  for select using (true);

-- Only signed-in users may edit. upsert needs both insert and update.
create policy "inline insert (auth)" on public.inline
  for insert to authenticated with check (true);
create policy "inline update (auth)" on public.inline
  for update to authenticated using (true) with check (true);

-- A profile carries a live PAT: owner only, and read-only from the client.
create policy "own profile" on public.profiles
  for select to authenticated using (auth.uid() = user_id);
```

`loadMessages()` is unaffected by any of this — the secret key bypasses RLS entirely.

Note what the `inline` policies do *not* do: any authenticated user can write any key. If your
Supabase project has non-admin users, scope those policies to an admin role or an allowlist,
because Palimp has no notion of authorization beyond "is signed in".

## Session detection

`hasSession()` must be synchronous ([why](../core/README.md#writing-an-adapter)), so it does no
network call — it looks for the Supabase auth cookie in `document.cookie`:

```ts
const ref = url.match(/^https?:\/\/([^.]+)\./)?.[1];   // https://<ref>.supabase.co
const prefix = `sb-${ref}-auth-token`;
// matches `sb-<ref>-auth-token=` and the chunked `sb-<ref>-auth-token.0=`
```

Two consequences:

- **False positives.** The cookie can outlive the session it describes, in which case `admin` goes
  true and `getUser()` then rejects. The drawer reports that and offers a **Sign out** button that
  clears the cookie. `getUser()` also corrects the hint itself: finding no user, it calls
  `signOut()` — which is what removes the cookie, since the cookie is chunked and deleting it by
  hand is unreliable. It skips that on `AuthRetryableFetchError`, because a failed fetch is not
  evidence the session is gone and an offline reload should not sign the admin out. See
  [Sessions and false positives](../../docs/architecture.md#sessions-and-false-positives).
- **Custom domains break it.** The regex takes the first hostname label as the project ref, so it
  only works for `https://<ref>.supabase.co`. Point `url` at a custom domain and `hasSession()`
  always returns `false` — editing never activates, with no error anywhere.

Returns `false` during SSR (`typeof document === "undefined"`).

## Quirks

**`@supabase/supabase-js` is types-only.** [src/client.ts](src/client.ts) imports
`SupabaseClient` with `import type`, so the reference is erased at build time and never reaches
`dist/`. That is why the package can list it as a devDependency: it is needed to typecheck, not
to run. `verbatimModuleSyntax` is on, so dropping the `type` modifier would silently turn it into
a real runtime dependency that nothing declares.

**The server adapter uses raw `fetch`, not the SDK.** `loadMessages()` hits PostgREST directly
with `apikey` and `Authorization` headers. No SDK to initialise, which keeps the server entry
point dependency-free. It also means no query builder: the URL is hand-written and errors come
back as `Unlucky: <status> <statusText>`.

**Only email/password login.** `LoginValue` in `core` has one member. OAuth would be a `core`
change first, then an adapter change.
