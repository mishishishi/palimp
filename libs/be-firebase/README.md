# @palimp/be-firebase

Firebase backend adapter for Palimp. Implements the same `PalimpClientBackendAdapter` /
`PalimpServerBackendAdapter` shapes as [`@palimp/be-supabase`](../be-supabase/README.md), backed
by Firebase Auth and Firestore. Landing it required no changes to
[`@palimp/core`](../core/README.md) — see
[Why the design is adapter-shaped](../../docs/architecture.md#why-the-design-is-adapter-shaped).

## Entry points

- `@palimp/be-firebase/client` — `createClientAdapter(config: FirebaseOptions)`
- `@palimp/be-firebase/server` — `createServerAdapter({ projectId, serviceAccount })` (uses
  `firebase-admin`, server-side only — it bypasses security rules)
- `@palimp/be-firebase/react` — `<PalimpFirebaseProvider config={…}>`

## Usage

```tsx
import { PalimpFirebaseProvider } from "@palimp/be-firebase/react";
import { createServerAdapter } from "@palimp/be-firebase/server";
import { setBackendAdapter } from "@palimp/fe-next";

setBackendAdapter(
  createServerAdapter({
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
    serviceAccount: process.env.FIREBASE_SERVICE_ACCOUNT!, // JSON string or parsed object
  }),
);

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
};

// …then wrap the tree:
<PalimpFirebaseProvider config={firebaseConfig}>{children}</PalimpFirebaseProvider>
```

The web config is public by design — an `apiKey` here identifies the project, it does not
authorize anything. The **service account** is the real credential and must stay server-side.

## Firestore data model

Firestore has no schema file, so this is the canonical reference for what the adapter expects.

### `inline/{key}`

| field | type     | notes                                        |
| ----- | -------- | -------------------------------------------- |
| value | `string` | message body for the given key (the doc id). |

Document id is the message key (matches the `key` column of the Supabase `inline` table).
`getKey` returns `null` for a missing doc *and* for a `value` that isn't a string;
`loadMessages` substitutes `""`. Writes go through a `writeBatch` with `{ merge: true }`, so a
save touches only `value` and leaves any other fields on the doc alone.

### `profiles/{uid}`

| field        | type             | notes                              |
| ------------ | ---------------- | ---------------------------------- |
| name         | `string \| null` | display name shown in devtools.    |
| publishToken | `string \| null` | GitHub token used by publish flow. |

Document id is the Firebase Auth `uid`. Field names are camelCase (Firestore convention) — no
Postgres-style snake_case. A missing doc is not an error; both fields come back `undefined`.

`publishToken` is a live GitHub PAT that is used from the browser, so its rule must be
owner-only and the token itself should be fine-grained and scoped to `actions: write` on one
repo. See [Security posture](../../docs/architecture.md#security-posture).

### Suggested security rules

Not enforced by this package — the adapter assumes you have set them up.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    match /inline/{key} {
      // Public read of message values (SSR clients use the server adapter,
      // but logged-out browser reads also hit Firestore directly).
      allow read: if true;
      // Only authenticated users can edit messages.
      allow write: if request.auth != null;
    }
    match /profiles/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

Note what the `inline` rule does *not* do: any authenticated user can write any key. If your
Firebase project has non-admin users, gate writes on a custom claim or an allowlist — Palimp has
no notion of authorization beyond "is signed in".

`loadMessages()` is unaffected either way; the service account bypasses rules entirely.

## Session detection

Firebase Auth persists to IndexedDB, which is async-only. To keep `hasSession()` synchronous
(required by `PalimpProvider`, which decides on first paint whether to mount editing UI), the
client adapter mirrors a `palimp:firebase:hasSession` flag into `localStorage` on every
successful `login()` / `logout()` / `getUser()`.

The flag may briefly report `true` for a session that expired between page loads — corrected on
the next `getUser()` call, which clears it when no user is present. Same false-positive class as
the Supabase cookie sniff, but self-correcting where that one isn't. While it is wrong, the
Devtools drawer shows a spinner rather than an error; see
[Sessions and false positives](../../docs/architecture.md#sessions-and-false-positives).

Returns `false` during SSR (`typeof localStorage === "undefined"`).

## Quirks

**Everything is dynamically imported.** Both entry points defer their SDK imports —
`ensureFirebase()` pulls `firebase/app`, `firebase/auth`, and `firebase/firestore` on first use;
`ensureAdmin()` pulls `firebase-admin/*`. That keeps `firebase-admin` out of client bundles,
which is why it is an `optionalDependency` rather than a hard one. Type-only imports at the top
of each file carry no runtime cost.

**Both SDKs are initialised as named apps.** The client uses `config.projectId ?? "palimp"`, the
server uses `"palimp"`, and both look for an existing app of that name before initialising. Two
reasons: a host app's own default Firebase instance is never clobbered, and `firebase-admin`'s
`initializeApp` throws on a duplicate name, which `next dev` HMR would otherwise trigger on every
edit.

**`serviceAccount` accepts a string or an object.** A JSON string is `JSON.parse`d, so
`process.env.FIREBASE_SERVICE_ACCOUNT` can be passed through as-is. A malformed string throws
from `JSON.parse` at first render rather than at construction time — `createServerAdapter` does
no work until `loadMessages()` is called.

**Only email/password login.** `LoginValue` in `core` has one member. Anonymous auth, OAuth
providers, and magic links would be a `core` change first, then an adapter change.
