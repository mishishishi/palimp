# Setting up credentials

A followable checklist for standing up a backend and getting either example running. Follow one
track — [Supabase](#track-a--supabase) or [Firebase](#track-b--firebase) — then the shared
[publish token](#publish-token-optional) and [verification](#verify-it-works) steps.

At the end you will have a filled `.env.local` in one example directory and a working login.

Budget 20–30 minutes for a track you've done before, an hour for your first.

## Before you start

```sh
pnpm install
pnpm build      # required — examples resolve @palimp/* through dist/, not src/
```

**On secrets.** `.env.local` is gitignored in both example directories (verified), so filling it
in is safe. Two of the values are real credentials — the Supabase **secret key** and the Firebase
**service account** — and the GitHub token is a live PAT. None of them should reach a commit, a
screenshot, or a chat message.

If you want me to run the example for you: fill in `.env.local` and say so, and I'll read it from
disk rather than having you paste values. Be aware that either way the values land in this
conversation's context. Use a throwaway project and a short-expiry token, and rotate them
afterwards.

---

## Track A — Supabase

### A1. Create the project

[supabase.com/dashboard](https://supabase.com/dashboard) → **New project**. Note the database
password somewhere; you won't need it here, but you can't retrieve it later.

Wait for provisioning to finish before continuing.

### A2. Collect three values

**Project Settings** (gear) → **API**:

| dashboard label | env var | notes |
| --- | --- | --- |
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` — see the warning below |
| Publishable / `anon` key | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | goes to the browser; RLS applies |
| Secret / `service_role` key | `SUPABASE_SECRET_KEY` | server only; **bypasses RLS entirely** |

> **Use the `supabase.co` URL, not a custom domain.** `hasSession()` extracts the project ref
> from the first hostname label to find the auth cookie. Point it at a custom domain and the
> match fails silently — login appears to succeed and the page stays plain text with no error
> anywhere. ([why](../libs/be-supabase/README.md#session-detection))

### A3. Create the tables

**SQL Editor** → **New query** → paste and run:

```sql
create table public.inline (
  key   text primary key,
  value text
);

create table public.profiles (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid unique not null references auth.users (id) on delete cascade,
  name          text,
  publish_token text
);
```

Leave `inline` empty. Every string in the example page ships with a `defaultMessage`, so the page
renders fine with no rows — they get created on your first save.

### A4. Grant table access

Still in the SQL editor. **Do not skip this** — a new Supabase project grants nothing on your
tables to the API roles, so without it every request fails before RLS is even consulted:

```sql
grant select         on public.inline   to anon, authenticated, service_role;
grant insert, update on public.inline   to authenticated;
grant select         on public.profiles to authenticated, service_role;
```

Each line is something the app does: `service_role` selecting `inline` is the server's
`loadMessages()` at build and render time; `authenticated` inserting *and* updating `inline` is
Save, which is an upsert and needs both; `authenticated` selecting `profiles` is `getUser()`
reading your name and publish token.

Older Supabase projects granted this automatically through default privileges on `public`, which
is why this step did not always exist. If yours already has the grants, running the block again is
harmless.

The symptom when it is missing is a **`42501`** from PostgREST — `permission denied for table
inline`, with a hint naming the exact `GRANT` to run. `/` returns 500 and the terminal shows
`Unlucky: 403`; `/login` still loads, because it touches no table.

### A5. Turn on RLS

Grants say which roles may touch a table at all; RLS says which *rows*. You need both. Without
this, `profiles` (which will hold a live GitHub token) is readable by anyone with the publishable
key:

```sql
alter table public.inline   enable row level security;
alter table public.profiles enable row level security;

create policy "inline readable"      on public.inline
  for select using (true);
create policy "inline insert (auth)" on public.inline
  for insert to authenticated with check (true);
create policy "inline update (auth)" on public.inline
  for update to authenticated using (true) with check (true);

create policy "own profile" on public.profiles
  for select to authenticated using (auth.uid() = user_id);
```

Both `insert` and `update` are needed on `inline` — saving is an upsert.

Note that any authenticated user can write any message key. If this project has users who
shouldn't be editors, scope those policies to a role or an allowlist; Palimp has no authorization
model beyond "is signed in".

### A6. Create your editor account

**Authentication** → **Users** → **Add user** → **Create new user**. Enter an email and password,
and tick **Auto Confirm User** — otherwise login fails until the address is confirmed.

### A7. Give that user a profile row

Back in the SQL editor, with your address substituted:

```sql
insert into public.profiles (user_id, name)
select id, 'Your Name' from auth.users where email = 'you@example.com';
```

**Don't skip this.** The adapter reads the profile with `.maybeSingle()`, so no row is not an
error — `getUser()` succeeds with `name` and `publishToken` undefined. The drawer opens showing
your email alone, Publish stays disabled on "Missing publish token", and step **P2** below has no
row to write the token into: its `update` matches nothing and reports no failure.

Confirm it worked — this should return exactly one row:

```sql
select p.name, p.publish_token, u.email
from public.profiles p join auth.users u on u.id = p.user_id;
```

### A8. Write `.env.local`

Create `examples/supabase-next/.env.local`:

```sh
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key>
SUPABASE_SECRET_KEY=<secret key>

# Optional — see "Publish token" below. Leave unset to skip publishing.
NEXT_PUBLIC_GITHUB_OWNER=
NEXT_PUBLIC_GITHUB_REPO=
NEXT_PUBLIC_GITHUB_WORKFLOW=
```

Then jump to [Verify it works](#verify-it-works).

---

## Track B — Firebase

### B1. Create the project

[console.firebase.google.com](https://console.firebase.google.com) → **Add project**. Analytics is
not needed.

### B2. Enable email/password auth

**Build** → **Authentication** → **Get started** → **Email/Password** → toggle **Enable** → Save.

Only this provider works. `LoginValue` in `core` has exactly one member, so Google, GitHub, and
magic-link sign-in are not wired up.

### B3. Create the Firestore database

**Build** → **Firestore Database** → **Create database**. Pick a region; choose **production
mode** (locked), since you're about to paste rules anyway.

### B4. Publish the security rules

**Rules** tab → replace the contents → **Publish**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    match /inline/{key} {
      allow read: if true;
      allow write: if request.auth != null;
    }
    match /profiles/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

Same caveat as Supabase: any signed-in user can write any message key.

### B5. Register a web app and copy the config

**Project settings** (gear) → **General** → scroll to **Your apps** → the **`</>`** icon →
register with any nickname → **don't** set up hosting here.

You get a `firebaseConfig` object. Four of its fields matter:

| config field | env var |
| --- | --- |
| `apiKey` | `NEXT_PUBLIC_FIREBASE_API_KEY` |
| `authDomain` | `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` |
| `projectId` | `NEXT_PUBLIC_FIREBASE_PROJECT_ID` |
| `appId` | `NEXT_PUBLIC_FIREBASE_APP_ID` |

These are public by design — a Firebase `apiKey` identifies the project, it doesn't authorize
anything. Your security rules are what protect the data.

### B6. Generate a service account key

**Project settings** → **Service accounts** → **Generate new private key** → confirm. A JSON file
downloads.

**This one is a real credential.** It bypasses your security rules completely.

It has to become a single-line env value:

```sh
jq -c . ~/Downloads/<your-project>-firebase-adminsdk-*.json
```

> Wrap the result in **single** quotes in `.env.local`. Double quotes make dotenv expand the `\n`
> escapes inside `private_key` into real newlines, which corrupts the JSON and produces a
> `JSON.parse` error at first page render.

### B7. Create your editor account and profile doc

**Authentication** → **Users** → **Add user**. Enter email and password, then **copy the UID** of
the created user.

**Firestore Database** → **Start collection** → collection ID `profiles` → document ID = **that
UID** (not auto-ID) → add one field, `name`, type string, any value → Save.

Leave `inline` alone; Firestore creates collections implicitly, so it appears on your first save.

Getting the document ID wrong is the most common failure here, and it is a quiet one: a missing
doc is not an error, so `getUser()` succeeds with `name` and `publishToken` undefined. The drawer
opens showing your email alone and Publish stays disabled on "Missing publish token".

### B8. Write `.env.local`

Create `examples/firebase-next/.env.local`:

```sh
NEXT_PUBLIC_FIREBASE_API_KEY=<apiKey>
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=<authDomain>
NEXT_PUBLIC_FIREBASE_PROJECT_ID=<projectId>
NEXT_PUBLIC_FIREBASE_APP_ID=<appId>
FIREBASE_SERVICE_ACCOUNT='<the jq -c output, single-quoted>'

# Optional — see "Publish token" below. Leave unset to skip publishing.
NEXT_PUBLIC_GITHUB_OWNER=
NEXT_PUBLIC_GITHUB_REPO=
NEXT_PUBLIC_GITHUB_WORKFLOW=
```

---

## Publish token (optional)

Skip this and everything except the Publish button works — it renders disabled and reads
"Missing publish token".

### P1. Create a fine-grained PAT

[github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new)

| field | value |
| --- | --- |
| Token name | anything |
| Expiration | as short as you can tolerate |
| Resource owner | the account or org that owns the target repo |
| Repository access | **Only select repositories** → the one repo |
| Repository permissions | **Actions: Read and write** — nothing else |

Write is needed to dispatch; read is needed to poll the run.

**This token reaches the browser.** It is loaded from the profile row and passed straight to
`fetch`, so anyone who can open devtools while signed in as that user can read it. That is why
the scope above is so narrow. ([full rationale](../libs/publish-github/README.md#the-token))

### P2. Store it on the profile

Supabase — SQL editor:

```sql
update public.profiles set publish_token = 'github_pat_...'
where user_id = (select id from auth.users where email = 'you@example.com');
```

Firebase — Firestore → `profiles/<uid>` → add field `publishToken`, type string. Note the
camelCase; Firestore uses `publishToken`, Postgres uses `publish_token`.

### P3. Point at a workflow

Fill in the three `NEXT_PUBLIC_GITHUB_*` vars. `NEXT_PUBLIC_GITHUB_WORKFLOW` is a filename, like
`deploy.yml`.

The target workflow **must** declare `workflow_dispatch:` in its `on:` block or the dispatch
404s. It also needs to exist on the branch being dispatched — `main` unless you override `ref`.

---

## Verify it works

```sh
pnpm --filter @example/supabase-next dev     # or @example/firebase-next
```

Walk these in order; each isolates a different layer.

1. **`http://localhost:3000`** — the banana farm page, plain text, no drawer handle.
   *A 500 here* means the server adapter reached your database and was refused. Read the terminal,
   not the browser: `Unlucky: 403` is missing grants ([A4](#a4-grant-table-access)), `404` is a
   missing table, `401` is a bad key. Supabase's own reply names the fix — curl it directly with
   `apikey` and `Authorization: Bearer` headers to see the `hint` field.
2. **`/login`** — a sign-in card appears after a brief spinner. Enter your credentials.
   *A permanent spinner* means `hasSession()` returned `undefined`-ish forever; check the browser
   console.
3. **Back on `/`** — every string is now an input with a dashed outline, and there's a handle on
   the left edge.
   *Still plain text after a successful login* is the session-detection failure — for Supabase,
   check you used the `supabase.co` URL.
4. **Open the drawer** — Save, preview toggle, Publish, and your name and email at the bottom.
   *"Session expired" here* means `getUser()` rejected — most often a stale cookie or flag. Use
   the **Sign out** button, then sign in again; the underlying error is printed beneath it.
5. **Edit a heading.** It gets a cyan glow, and the handle shows a badge count.
6. **Save**, then reload. Your text survives. Check the `inline` table or collection — there's now
   a row keyed `hero.title` or similar.
7. **Preview mode** — inputs become plain text. Toggle back.
8. **Publish** (if configured) — the label goes "Dispatching…" then "Publishing…", the icon
   spins, and the status modal links to the run in GitHub Actions.

## Troubleshooting

| symptom | cause |
| --- | --- |
| `Module not found: @palimp/...` | libs not built — run `pnpm build` at the root |
| `/` is a 500, terminal says `Unlucky: 403`, `/login` is fine | Supabase table grants missing — [step A4](#a4-grant-table-access). Confirm with the PostgREST body: `42501`, `permission denied for table inline` |
| `Unlucky: 404` | the `inline` table doesn't exist, or the URL is wrong — [A3](#a3-create-the-tables) |
| `Unlucky: 401` | the secret key is wrong or truncated in `.env.local` |
| Login succeeds, page stays plain text | Supabase: URL is a custom domain, so the auth-cookie sniff can't find the project ref |
| Drawer says "Session expired" | `getUser()` rejected — usually a dead session the cookie/flag still claims is live. **Sign out** in the drawer clears the hint; the raw error is printed under the button |
| Bounced off `/login` with "Already logged in" | same stale cookie/flag; go to `/`, open the drawer and use **Sign out**, or clear the cookie / `localStorage.removeItem("palimp:firebase:hasSession")` by hand |
| Save fails silently, edits stay pending | RLS or security rules reject the write — check the `insert` **and** `update` policies exist |
| Page renders keys like `hero.title` | reaching the database worked but returned nothing usable; expected only if a row exists with an empty value |
| `JSON.parse` error on first render | Firebase service account is double-quoted in `.env.local` — use single quotes |
| Publish disabled, "Missing publish token" | no `publish_token` / `publishToken` on the profile — or no profile row/doc at all, which is not an error and shows up only here and as a missing name |
| Publish disabled, "No publish provider" | `PalimpGithubPublishProvider` isn't mounted; the layout has the backend and `PalimpProvider` but not the publish provider |
| `GitHub dispatch failed: 404` | workflow filename wrong, missing `workflow_dispatch:`, or the token can't see the repo |
| `could not locate dispatched run` | the run didn't appear within ~6 s; it probably still started — check the Actions tab |

Deeper background on any of these: [architecture.md](architecture.md#sharp-edges).
