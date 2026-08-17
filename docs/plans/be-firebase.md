## Plan: `@palimp/be-firebase` (Firebase backend)

> **Historical design record — not current API.** Written before this feature was built and kept
> as written. For how the code behaves today see [../architecture.md](../architecture.md) and
> [libs/be-firebase/README.md](../../libs/be-firebase/README.md). Context:
> [README.md](README.md).
>
> This one landed essentially as proposed, including the "Files modified: **None**" claim below —
> which is the evidence the architecture doc cites for the adapter design.

### Context

Today the only data backend is `@palimp/be-supabase` (`libs/be-supabase/`). It exposes three entry points — `./client`, `./server`, `./react` — backed by:

- **Auth**: Supabase Auth (`signInWithPassword`)
- **`inline` table**: `(key text pk, value text)` — message values, read on server and read/written on client
- **`profiles` table**: `(user_id fk, name, publish_token)` — joined to the current user on `getUser()`
- **Server reads**: PostgREST hit with the Supabase secret key (`apikey` + `Authorization` headers)
- **Session sniff**: `hasSession()` looks for the `sb-<ref>-auth-token` cookie synchronously

We want a sibling package `@palimp/be-firebase` that implements the same two adapter shapes (`PalimpClientBackendAdapter`, `PalimpServerBackendAdapter`) backed by Firebase Auth + Firestore, plus a `PalimpFirebaseProvider`. No changes to `@palimp/core` should be needed — the adapter interfaces are already backend-agnostic.

### Decisions (confirmed)

- **Data store**: Firestore.
- **Server reads**: `firebase-admin` (service-account credentials). Direct analog of Supabase's service key — bypasses security rules, no PII/rules tightrope to walk.
- **Example app**: new `examples/firebase-next` alongside `examples/supabase-next`. Identical UI, different provider wiring.

### Data model in Firestore

Two top-level collections, chosen to keep the adapter mapping trivial:

- **`inline/{key}`** — document id is the message key, single field `value: string`. Direct rename of the `inline` Postgres table (`getKey` becomes `getDoc("inline", key)`, `setKeys` becomes a batched set with `{ merge: true }`).
- **`profiles/{uid}`** — document id is the Firebase Auth uid, fields `name: string | null`, `publishToken: string | null`. Direct rename of `profiles.user_id` → doc id.

Field-name choice — `publishToken` (camelCase) rather than `publish_token`. Firestore has no Postgres-style convention pulling us toward snake_case, and using camelCase saves the `(profile?.publish_token as string | null)` cast in the adapter.

This mapping has to be documented somewhere because Firestore has no schema. A short `libs/be-firebase/README.md` will list the two collections + rules sketch — same level of detail as a SQL migration would carry for Supabase.

### Auth session detection

Supabase exposes a cookie (`sb-<ref>-auth-token`) that's readable synchronously from `document.cookie`. Firebase Auth doesn't use cookies — it persists in IndexedDB with a key like `firebase:authUser:<apiKey>:[DEFAULT]`, and IndexedDB is async-only.

`hasSession()` is declared synchronous (`() => boolean`) — its only caller in the codebase is `LoginPageCore` deciding whether to mount the login form. We have two viable strategies:

1. **Sniff `localStorage`**: Firebase JS SDK mirrors the IndexedDB user record into `localStorage` under the same key whenever IndexedDB is unavailable, but does NOT do so when both are available. Unreliable.
2. **Sniff IndexedDB indirectly via a one-shot flag we set ourselves**: on every successful `login()` / `logout()` / `getUser()`, write a boolean to `localStorage` under `palimp:firebase:hasSession`. `hasSession()` returns that flag synchronously.

Going with **(2)** — explicit and synchronous, with one trade-off: a session that expired between page loads will report `true` until the next `getUser()` fixes it. The Supabase cookie sniff has the same false-positive class (cookie may still be present after server-side revocation), so we're not regressing the contract.

### New package `libs/be-firebase/`

Mirror `libs/be-supabase/` exactly. Files:

- **`package.json`**
  - `"name": "@palimp/be-firebase"`, `"type": "module"`, `"version": "1.0.0"`
  - `exports`: `./client`, `./server`, `./react` — same shape as `libs/be-supabase/package.json:6`
  - `scripts`: `build`, `dev`, `check-types` — copy verbatim
  - `peerDependencies`: `@palimp/core: workspace:*`, `react: *`
  - `dependencies`: `firebase` (client SDK)
  - `optionalDependencies`: `firebase-admin` — only the server entry point imports it (dynamic import), so client-side bundles in `examples/firebase-next` don't pull it in.
  - `devDependencies`: `@types/react`, `firebase-admin`
- **`tsconfig.json`** — copy verbatim from `libs/be-supabase/tsconfig.json:1` (extends `../tsconfig.base.json`).
- **`src/client.ts`** — `createClientAdapter(config: FirebaseOptions): PalimpClientBackendAdapter`. Takes the standard Firebase web config object (apiKey, authDomain, projectId, …). Internally:
  - `ensureFirebase()` dynamic-imports `firebase/app`, `firebase/auth`, `firebase/firestore` and initializes a singleton app (named via `config.projectId` to avoid collisions if multiple providers ever co-exist).
  - `login({ type: "email-password", email, password })` → `signInWithEmailAndPassword`, then set the `palimp:firebase:hasSession` flag.
  - `logout()` → `signOut`, then clear the flag.
  - `hasSession()` → synchronous `localStorage.getItem("palimp:firebase:hasSession") === "1"`. Returns `false` in SSR.
  - `getUser()` → `auth.currentUser` (await `authStateReady()` first). Throws `"Not authenticated"` if absent. Then `getDoc(doc(db, "profiles", user.uid))` for the profile fields. Set the session flag on success (covers reload-mounting).
  - `getKey(key)` → `getDoc(doc(db, "inline", key))`, return `snap.exists() ? snap.data().value : null`.
  - `setKeys(entries)` → `writeBatch`, `batch.set(doc(db, "inline", key), { value }, { merge: true })` per entry, then `batch.commit()`. No-op when empty (mirrors `be-supabase/src/client.ts:87`).
- **`src/server.ts`** — `createServerAdapter(config: { projectId: string; serviceAccount: ServiceAccount | string }): PalimpServerBackendAdapter`. `serviceAccount` accepts either a parsed object or a JSON string (so consumers can pass `process.env.FIREBASE_SERVICE_ACCOUNT` directly).
  - `ensureAdmin()` dynamic-imports `firebase-admin/app` + `firebase-admin/firestore`, calls `initializeApp({ credential: cert(parsed), projectId }, "palimp")` once (named app, so we don't clobber a host app's default admin instance).
  - `loadMessages()` → `db.collection("inline").get()`, map docs to `{ key: doc.id, value: doc.data().value }[]`. Matches `Message[]` from `libs/core/src/types.ts:1`.
- **`src/react.tsx`** — `PalimpFirebaseProvider({ config, children })`. `config` is the full Firebase web config object (passing apiKey + authDomain + projectId separately would be six props; one object stays readable). Builds the adapter via `useMemo(() => createClientAdapter(config), [])` and wraps children in `<PalimpClientBackendContext value={client}>`. Pattern copied from `libs/be-supabase/src/react.tsx:13`.

### New example app `examples/firebase-next/`

Mirror `examples/supabase-next/` exactly — same `app/page.tsx`, same `app/login/page.tsx`. Only `app/layout.tsx` differs:

```tsx
import { PalimpFirebaseProvider } from "@palimp/be-firebase/react";
import { createServerAdapter } from "@palimp/be-firebase/server";
import { PalimpProvider, setBackendAdapter } from "@palimp/fe-next";
import { PalimpGithubPublishProvider } from "@palimp/publish-github/react";
import { type ReactNode } from "react";

setBackendAdapter(
  createServerAdapter({
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
    serviceAccount: process.env.FIREBASE_SERVICE_ACCOUNT!, // JSON string
  }),
);

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <PalimpFirebaseProvider config={firebaseConfig}>
      <PalimpGithubPublishProvider
        owner={process.env.NEXT_PUBLIC_GITHUB_OWNER!}
        repo={process.env.NEXT_PUBLIC_GITHUB_REPO!}
        workflow={process.env.NEXT_PUBLIC_GITHUB_WORKFLOW!}
      >
        <PalimpProvider>
          <html lang="en">
            <body>{children}</body>
          </html>
        </PalimpProvider>
      </PalimpGithubPublishProvider>
    </PalimpFirebaseProvider>
  );
}
```

`examples/firebase-next/.env.local` placeholders (user fills in values):

```
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

FIREBASE_SERVICE_ACCOUNT=

NEXT_PUBLIC_GITHUB_OWNER=
NEXT_PUBLIC_GITHUB_REPO=
NEXT_PUBLIC_GITHUB_WORKFLOW=
```

`examples/firebase-next/package.json` — copy `examples/supabase-next/package.json`, swap `@palimp/be-supabase` → `@palimp/be-firebase`, change `name` to `@example/firebase-next`. Other deps identical.

`app/page.tsx`, `app/login/page.tsx`, `next.config.ts`, `next-env.d.ts`, `tsconfig.json` — copy verbatim from `supabase-next`.

### Firestore security rules (in the README)

Not enforced by code, but documented in `libs/be-firebase/README.md` so consumers know what to set:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    match /inline/{key} {
      // Public read of message values (SSR clients hit server adapter instead;
      // this is for the in-browser editor + future logged-out reads).
      allow read: if true;
      // Only authenticated users can edit.
      allow write: if request.auth != null;
    }
    match /profiles/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

### Workspace plumbing

- `pnpm-workspace.yaml` already globs `libs/*` and `examples/*` (`pnpm-workspace.yaml:1`), so both new packages register automatically.
- After files land: `pnpm install` to link the workspace package and pull `firebase` + `firebase-admin` into the lockfile, then `pnpm -r build`.

### Files modified vs. created

**Created**

- `libs/be-firebase/package.json`
- `libs/be-firebase/tsconfig.json`
- `libs/be-firebase/src/client.ts`
- `libs/be-firebase/src/server.ts`
- `libs/be-firebase/src/react.tsx`
- `libs/be-firebase/README.md` (collections + rules sketch — Firestore has no schema file, so this is the only place these decisions live)
- `examples/firebase-next/package.json`
- `examples/firebase-next/tsconfig.json`
- `examples/firebase-next/next.config.ts`
- `examples/firebase-next/next-env.d.ts`
- `examples/firebase-next/.env.local`
- `examples/firebase-next/app/layout.tsx`
- `examples/firebase-next/app/page.tsx` (copy of supabase-next equivalent)
- `examples/firebase-next/app/login/page.tsx` (copy)

**Modified**

- None. The core capability seam already fits — no `@palimp/core` change needed.

### Verification

1. `pnpm install` — confirm `@palimp/be-firebase` and `@example/firebase-next` link, `firebase` + `firebase-admin` land in the lockfile.
2. `pnpm -r check-types` — must pass. Catches a wrong adapter shape (the interfaces in `libs/core/src/PalimpClientBackendAdapter.ts:3` and `libs/core/src/types.ts:6` are the contract).
3. `pnpm -r build` — confirms `libs/be-firebase/dist/` has `client.js`, `server.js`, `react.js` matching the `exports` map.
4. Standing up Firebase to actually exercise the example needs a real project (out of band — user supplies api key + service account + creates the two collections). Once wired:
   - `pnpm --filter @example/firebase-next dev`, visit `/login`, sign in with a test user that exists in Firebase Auth and has a matching `profiles/{uid}` doc. Expect: redirect to `/`, Devtools drawer mountable, the user's `name` + `publishToken` visible to `useDevtools()`.
   - Inline edit any message → check the corresponding `inline/{key}` doc updates in the Firestore console.
   - Hard reload → server-rendered page uses `loadMessages()`, edited values appear without a client round-trip.
   - Sign out → `hasSession()` returns false on next mount, login page renders immediately (no spinner stall).

### Out of scope (deliberate)

- A Firebase Functions / Cloud Run server adapter variant (we use `firebase-admin` directly from the Next server).
- Anonymous auth, OAuth providers, magic links — `LoginValue` is only `email-password` today (`libs/core/src/PalimpClientBackendAdapter.ts:14`). Extending it is a core change, separate plan.
- Firestore offline persistence — irrelevant for the admin/editor use case.
- Migrating `examples/supabase-next` to share scaffolding with `examples/firebase-next` (no DRY pass; both stay self-contained for clarity).
- A Firebase-flavoured publish adapter — `@palimp/publish-github` is reused as-is since "publish" is orthogonal to the data backend (see `docs/plans/publish-github.md:9`).
- Renaming `publish_token` in the Supabase backend to match Firebase's camelCase `publishToken` — divergence is local to each adapter; the core `User.publishToken` shape is the contract.
