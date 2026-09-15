# Collections, phase 3 — the media seam

**Status:** proposed · **Date:** 2026-08-31 · **Branch:** `pr/08-collections`

Phases 1 and 2 give the owner every kind of field but one. They can add an item, type its facts
in the modal and its prose inline, watch the card appear before any Save, and land the whole thing
in one Save and one Publish — unless the item has a picture. A picture today is a string the owner
cannot produce: the exploration's §E2 left image fields as path strings and assets "landing in the
repo by PR", which is a developer's workflow wearing an owner's label. The one thing the host's
motivating collection needs that no phase has delivered is a gallery whose photos the owner
uploads themselves.

Phase 3 adds that as a **seam**, not a feature bolted onto storage: an optional `PalimpMediaAdapter`
contract in `core` with a nullable context beside the publish one, an `image` widget in the modal
that uploads through whatever adapter is mounted and degrades to a plain URL input when none is,
and **one** first-party implementation — Supabase Storage — riding `be-supabase` as new files. The
Firebase implementation is designed here (§E) and **deferred**: Cloud Storage is not provisioned
on the Firebase side and will not be before this phase ships, and an adapter nobody can run
against a real bucket would be shipped unverified (D14). The item stores the file's **public
URL**; the card renders an `<img>`; nothing in the storage contract, the save path, `editsStore`
or `fe-next`'s code moves.

This is the one phase the README says touches the backend packages, and it does — as new files
implementing a new optional contract, never as a change to `PalimpClientBackendAdapter` or
`PalimpServerBackendAdapter`. It is also the phase the D1 clause was written for: "Sveltia stays
the fallback if media becomes central" is a gate, and §A opens by walking through it rather than
past it.

The grounding exploration is [00-exploration.md](00-exploration.md) §E2 and its "Embedding
Sveltia CMS" entry; the phase map and decision log are in [README.md](README.md). Every claim
below was re-checked against this branch — phases 1 and 2 as they *landed*, divergence notes
included, not as they were planned — and the two divergences that shape this phase are named
where they bite: the `./collections` subpath (phase 1, note 1) and the module-granular bundling
finding behind `sideEffects: false` (phase 2, notes 1–2). Unlike phase 2, nothing here was
prototyped: the two SDK behaviours the design leans on were checked in the installed packages
rather than measured in a build, and §E marks what the implementation must confirm against the
real services.

## The decisions this plan is built on

Six gates, answered 2026-08-31 in this planning session, before the rest of the file was written.
Recorded in the [decision log](README.md#decision-log) as D9–D14; restated here at full length.
The first is the gate on the phase itself; the last is the one the user set.

- **D9 — phase 3 does not cross D1's media gate; build.** D1 said Sveltia stays the fallback "if
  media becomes central". §A says what central would look like — six concrete signs, each of
  which would demand something *structural* of palimp (a processing pipeline, an asset-metadata
  store, a delete primitive, a privacy model) that Sveltia has already — and finds none present
  in what this phase is asked for: one file per field, art-directed and consent-cleared before it
  is uploaded, dozens not thousands, public the moment it is published. The seam costs one
  interface, one context, one widget and a hundred-line adapter per backend, and every existing mechanism
  absorbs it unchanged. The flip condition is written down (two of the six signs, or either of the
  two that contradict the premise outright), and so is the path across when it flips.
- **D10 — the item stores the public URL, not a storage path.** The README's brief says "path
  stored on the item"; reading the code changed the answer, the way phase 1's §E changed the
  registration shape. A path needs resolving to a URL on the server (the baked children and
  `generateMetadata`), on the client (the live map) and for visitors — three new surfaces, a
  `setMediaAdapter()` singleton to mirror `setBackendAdapter()`, and a context read inside every
  visitor card. A URL needs `<img src={item.photo}>` and nothing else: no palimp code in the render
  path, no server registration, and a widget that still works with **no adapter at all**, because
  the same string field accepts a repo path (`/images/hero.jpg`) typed by hand — which is exactly
  the exploration's v1 workflow, now a degraded mode of the real one rather than a separate
  design. The cost is that relocating a bucket rewrites documents; §D says so.
- **D11 — public read, authenticated create-only; no signed URLs.** A static export bakes the URL
  into HTML for the life of the deploy, which may be months; a signature expires in hours. Signed
  access is not a hardening option here, it is incompatible with the premise. Public read also
  matches what the content already is: `inline` rows are public-read on both backends today
  (`for select using (true)`; `allow read: if true`), because palimp content is site content. The
  bucket therefore gets the same posture as the table — anyone reads, a signed-in user adds — and
  one stricter rule the table does not have: **nothing from the client may update or delete an
  object**, so a session can add files but never alter or remove one a published page references.
  The honest consequence is in §F: an uploaded file is public on upload, before any Save or
  Publish. Unpublished is not private.
- **D12 — the seam is the publish seam's shape; the implementations ride the backend
  providers.** `PalimpMediaAdapter` is an interface in `core`, `PalimpMediaContext` is
  `createContext<PalimpMediaAdapter | null>(null)` exactly as
  [PalimpPublishContext.ts:8](../../../libs/core/src/PalimpPublishContext.ts#L8) is, and the
  widget feature-detects it the way `usePublishButton` does
  ([usePublishButton.ts:34-36](../../../libs/core/src/Admin/Devtools/usePublishButton.ts#L34-L36)):
  the Upload button renders disabled with "No media provider", the URL input stays live. Where the
  two seams part is the provider. Publishing is a different *service* with different credentials,
  so it is a different package and a different provider; media lives in the *same* project as the
  rows, under the same key and the same signed-in session. So a backend package exports a
  `createMediaAdapter` from a new file and mounts it through one optional prop on the provider it
  already has — `<PalimpSupabaseProvider … media={{ bucket: "palimp" }}>` — instead of a second
  provider that repeats the URL and key. Anyone else mounts `PalimpMediaContext` directly; that is
  the seam, and it is what makes a third-party or git-backed adapter expressible later.
- **D13 — upload on selection; objects are timestamped, never overwritten, never deleted by
  palimp; orphans are accepted.** The alternative — hold the file in memory and upload at Save so
  a discarded draft leaves nothing behind — needs a second draft layer that is not a string, a
  save path that knows about media, and a live card that cannot show the image it is about to
  get. That is three of the invariants the three previous features survived by *not* touching:
  `editsStore` is `Map<string, string>` and knows nothing about its values, `useSaveButton` drains
  and writes, the live list renders the working document. Uploading immediately keeps the draft a
  URL string and pays with orphans, a class of leftover the repo already carries and documents
  (both landing notes record prose rows that outlive their items — there is no delete primitive
  for those either). Paths carry a timestamp and a random suffix so nothing is ever overwritten,
  which is what lets the URL be stable and the cache header be `immutable`.
- **D14 — the implementation is Supabase only; the Firebase adapter is designed and deferred.**
  Cloud Storage for Firebase is not set up on the demo project and will not be before this
  feature is published. The house rule is that admin behaviour is verified against a real backend
  or recorded as unrun, and a whole adapter recorded as unrun is not a deliverable — it is a
  liability with a version number. So phase 3 ships `be-supabase`'s media adapter, verified; keeps
  the Firebase design in §E as the follow-up's specification (it is a copy of the Supabase layout
  with two SDK calls swapped); and leaves the firebase example **without** a `media` prop, which
  makes it the standing dogfood of the degraded mode — the one place the D12 promise, "hosts
  without an adapter lose only the upload button", is exercised by a real page. The seam is
  backend-agnostic by construction, so the Firebase adapter lands later as new files with no
  change to `core`.

## What is already true

Re-verified against the tree while writing this — phases 1 and 2 as landed.

- **The publish seam is the working precedent for an optional capability, and it has three
  parts.** A nullable context
  ([PalimpPublishContext.ts](../../../libs/core/src/PalimpPublishContext.ts), with the comment
  explaining why nullable — a non-nullable default once rendered an enabled button that did
  nothing); a consumer that reports `available: !!adapter` and narrows with `skipToken` rather
  than asserting ([usePublishRun.ts:17-22](../../../libs/core/src/Admin/Devtools/usePublishRun.ts#L17-L22));
  and a drawer that says *why* it is disabled
  ([DevtoolsContent.tsx:33](../../../libs/core/src/Admin/Devtools/DevtoolsContent.tsx#L33)). The
  architecture doc's own summary — "publishing is orthogonal to storage… the GitHub adapter is
  reused unchanged by both backends" — is also the sentence that says where media differs: it is
  *not* orthogonal to the backend's project, only to its contract.
- **Both client adapters lazily initialise a named SDK instance, and both can be re-obtained from
  a second module.** Supabase: `ensureSupabase()` calls `createBrowserClient(url, key)`
  ([be-supabase/client.ts:10-16](../../../libs/be-supabase/src/client.ts#L10-L16)), and
  `@supabase/ssr` 0.12 returns a **singleton** from that call in a browser unless
  `isSingleton: false` is passed (checked in the installed
  `dist/main/createBrowserClient.js`, lines 12–14) — so a media module calling it again shares the
  auth session without touching `client.ts`. Firebase: `ensureFirebase()` reuses an app by name
  through `getApps().find(…)` ([be-firebase/client.ts:15-27](../../../libs/be-firebase/src/client.ts#L15-L27)),
  which a media module can do identically to reach `getStorage(app)`. Neither existing file needs
  to change for the media adapter to authenticate as the signed-in owner.
- **Both providers build their adapter in a `useMemo` and mount one context**
  ([be-supabase/react.tsx:18](../../../libs/be-supabase/src/react.tsx#L18),
  [be-firebase/react.tsx:14](../../../libs/be-firebase/src/react.tsx#L14)). Adding an optional
  prop that mounts a second, nullable context is a five-line change in a file that is not the
  storage contract.
- **The modal's field controls are recursive and already delete on clear.** `FieldControl`
  ([CollectionsModal.tsx:437](../../../libs/core/src/Admin/Devtools/CollectionsModal.tsx#L437))
  switches on `field.widget`; `set(undefined)` removes the key
  ([CollectionsModal.tsx:403-409](../../../libs/core/src/Admin/Devtools/CollectionsModal.tsx#L403-L409));
  `newItem` decides per widget what a fresh item carries
  ([CollectionsModal.tsx:618](../../../libs/core/src/Admin/Devtools/CollectionsModal.tsx#L618)).
  An `image` case is one arm in each of three switches plus one row in `FieldValue`
  ([collections.ts:55](../../../libs/core/src/collections.ts#L55)) and one in the validator — the
  "extend one and you must extend the other" invariant the source comments at
  [collections.ts:510](../../../libs/core/src/collections.ts#L510). Because the recursion exists,
  an image inside a `list` (the host's gallery) works the day the top-level one does.
- **The live list re-renders on every draft change, and the draft is a string.**
  `LiveCollectionList` resolves `pending ?? data ?? staleDocument`
  ([LiveCollectionList.tsx:87](../../../libs/core/src/Admin/LiveCollectionList.tsx#L87)); a URL
  written into the document by the widget reaches the card on the next render with no media code
  anywhere near it. Liveness of an uploaded image is free — provided the draft holds a URL (D10)
  and the upload has already happened (D13).
- **The modal's controls are outside the interaction guard**, so an antd `Upload` control, its
  hidden file input and its click go where antd sends them — the same fact phase 1 §D established
  for the other controls, now load-bearing for a control that opens a native file picker.
- **`core`'s root entry is cheap and safe to import from client code, and `./admin` is where
  UI code must go.** `sideEffects: false` on `core` and `fe-next`
  ([core/package.json:6](../../../libs/core/package.json#L6)) is what phase 2 needed to keep a
  barrel import from shipping the parse ladder; a context module at the root costs a visitor
  nothing they don't already pay for `PalimpPublishContext`. The widget itself is admin UI and
  lives beside `CollectionsModal` in the lazy chunk.
- **Firestore's client returns `null` for a non-string `value`**
  ([be-firebase/client.ts:91](../../../libs/be-firebase/src/client.ts#L91)) — the constraint that
  made collections encode as a string. A URL is a string. Nothing new for the document format.
- **The firebase example's config has no `storageBucket`**
  ([examples/firebase-next/app/layout.tsx:7-12](../../../examples/firebase-next/app/layout.tsx#L7-L12)),
  and neither deploy workflow sets one — nor is Cloud Storage provisioned on the demo project,
  and it will not be before this phase ships. That is a fact about scope, not only about docs: it
  is why D14 defers the Firebase adapter rather than building it unverified. When it is
  provisioned, the bucket name is read from the console, never inferred (§E).
- **No delete primitive exists anywhere, and its absence is already a documented class of
  leftover.** Phase 1's landing note records six orphaned `varieties.*` rows; phase 2's records
  a prose row that "would outlive any later deletion of the item". Orphaned files are that class
  with a different noun (§F).
- **The credentialed-verification rule holds for this phase more than any before it.** Nothing
  below the widget's disabled state is reachable from a build: uploads need a signed-in session,
  a real bucket and real policies. Supabase is the verification backend and, with D14, the only
  implemented one.

## §A — The gate: what "central" would look like

D1 was decided with a clause attached, and this is the phase that has to honour it rather than
recite it. Sveltia CMS has a real media library today — folders, a picker, drag-and-drop, image
previews, per-asset metadata, deletion — for near-zero engineering, at the cost the exploration
recorded: a second login world, a second editing UI with no in-place story, content forked across
git and the database, and publishes that bypass the drawer. The question is not whether palimp
can grow an upload button; it can, and this plan is the proof. The question is whether the media
requirement has the *shape* that would make owning it a mistake.

**Media is central when the host needs any of these, each of which is additive for Sveltia and
structural for palimp:**

1. **Derivatives.** Responsive variants, thumbnails, format conversion (WebP/AVIF), focal-point
   cropping. Palimp stores one file and one URL. A pipeline means a build step or a paid transform
   endpoint (Supabase image transformations are a Pro feature; Firebase needs an Extension) and a
   URL scheme that varies per size — none of which the document-in-a-key can carry.
2. **The library as a surface.** Search, tags, folders the owner arranges, alt text and captions
   as *asset* metadata rather than item fields, replace-in-place with usage tracking, bulk
   operations. Palimp's `list` (§B) is a flat per-collection grid; asset metadata would need a
   store the seam does not have.
3. **Deletion with reference checks.** "Delete this photo" is safe only if nothing references it.
   Palimp has no delete primitive on any contract and no reference index — the document *is* the
   index, per collection, and prose rows are not indexed at all.
4. **Media outside collections.** A hero image as a *page* asset, images inside prose. `p()` is
   text; `PalimpFields` are strings. An image that is not a field of an item has nowhere to live.
5. **Private-until-published.** Assets that must not be reachable before the site shows them.
   D11 makes every upload public at once; a static export can bake only public URLs. Git-based
   media in a private repository is private until the deploy, and that is not a property palimp's
   storage can offer without signed URLs it cannot bake.
6. **Volume.** Hundreds of files or gigabytes, where a flat listing, console-side cleanup and a
   whole-document draft stop being workable.

**Why this design stays on the build side.** The requirement in front of it — the host's gallery
of `{ id, src?, taken? }` per project — has none of those shapes. The photography is art-directed
and consent-gated *before* it reaches a browser, so the editorial work happens outside any CMS and
the upload is the last step, not the workflow; the count is dozens; the audience is a public site;
alt text is a sibling field the schema already expresses. Against that, the seam is small: one
interface with three methods, one nullable context, one widget, an adapter of roughly a hundred
lines per backend, and — the part that matters — zero changes to the four existing contracts, the save
path, the draft store or the liveness mechanism, all of which absorb an uploaded image as a string
that happens to start with `https://`. Palimp's identity is "your markup, your page, one login";
an upload button that lands the URL in the same draft as the caption keeps that identity. A media
library would not, and would be a worse Sveltia.

**The flip condition, so nobody has to re-derive it.** If a real host needs **two or more** of
the six, or **either of 1 or 5 alone** — the two that contradict the premise rather than extend
it — the recommendation is Sveltia for media, not phase 4 for palimp. The path across is already
paved by this phase's choices: the `image` value is a URL string, so Sveltia's `image` widget (a
path string in a committed file) maps onto it field for field; the widget's URL input accepts a
site-relative path, so **coexistence** is possible without a migration at all — Sveltia manages
`/media/*` in the repo, the owner pastes the path into palimp's field, and the two never share a
write path. That coexistence is the cheapest fallback and it costs this design nothing to keep
open, which is a second reason D10 stores a URL rather than a path only an adapter can resolve.

## §B — The contract

New file `libs/core/src/PalimpMediaAdapter.ts`, at the package root beside the publish adapter:

```ts
export interface PalimpMediaAdapter {
  /**
   * Stores `file` at the relative `path` core computed (§D). The adapter
   * prepends its own location — a bucket, a prefix — and never overwrites.
   */
  upload: (path: string, file: File) => Promise<PalimpMediaAsset>;
  /** Assets under a relative prefix — a collection's folder — newest first. */
  list: (prefix: string) => Promise<ReadonlyArray<PalimpMediaAsset>>;
  /** The public URL of a stored relative path. Pure and synchronous: no network. */
  url: (path: string) => string;
}

export interface PalimpMediaAsset {
  /** The relative path `upload` was given. */
  path: string;
  /** What the item stores (D10). */
  url: string;
  size?: number;
  contentType?: string;
}
```

Three shapes, three reasons:

- **No token argument, unlike `publish(token)`.** The publish adapter takes the token per call
  because it belongs to the user's profile and is unknown at construction. Media authenticates
  with the backend SDK's own session, which the adapter already holds; passing anything would be
  ceremony.
- **`url()` is synchronous and pure.** Both backends have a deterministic public-URL format (§D),
  so no SDK call and no network is needed. That is what lets `upload` and `list` return URLs
  without extra round trips, and lets a host compute a seed's URL on the server from the same
  factory with no SDK initialised.
- **`list` is required, not optional.** Both first-party adapters implement it and the widget's
  picker depends on it (§C). An optional method would make the widget conditional twice over; a
  third-party adapter that cannot enumerate can return `[]`.

`PalimpMediaContext` in `libs/core/src/PalimpMediaContext.ts` is the publish context's twin,
comment included: `createContext<PalimpMediaAdapter | null>(null)`, nullable because media is
optional and `null` is a state the widget renders rather than a default that never survives to a
read. Both are exported from `core`'s root `index.ts` (`PalimpMediaContext`; the two types); the
`./collections` subpath stays pure and gains only the `ImageField` type through `CollectionField`.

The core README's "Writing an adapter" section gets a sibling, **Writing a media adapter**: the
interface, the immutability rule (never overwrite), the public-read expectation, and the one-line
mount — `<PalimpMediaContext value={adapter}>` inside the backend provider and outside
`PalimpProvider`. That paragraph is the seam's promise to anyone who is not Supabase or Firebase.

## §C — The `image` widget

### The field

`collections.ts` gains an eighth member of the vocabulary — Sveltia's name for it, as the other
seven:

```ts
export interface ImageField extends FieldBase {
  readonly widget: "image";
  /** An HTML `accept` string for the picker. Default "image/*". */
  readonly accept?: string;
  /** Client-side size gate, bytes. No default — the bucket's limit is the backstop (§F). */
  readonly maxBytes?: number;
  readonly default?: string;
}
```

`FieldValue` gains the row `image → string`; the item type for `{ name: "photo", widget: "image" }`
is `photo?: string`, and with `required: true` it is `photo: string`. The validator gains a case
beside `string`: a present value must be a string **and non-empty** — `<img src="">` requests the
page itself, so an empty URL is a real bug rather than a blank, and the modal never produces one
(below). `newItem` treats `image` like `number` and `select`, not like `string`: a fresh item's
required image stays **absent** and the validity mark says so. Inventing `""` would be the
coercion §B of phase 1 rejects, and here it would also be a broken image.

One `@ts-expect-error` fixture joins `collections.fixtures.ts`: `photo: 3` in `defaultItems` fails
with TS2322. Compiled during implementation, as the phase-1 rule requires; the row is a one-liner
in a conditional type that already has six, so no prototype was needed to believe it.

Alt text is **not** part of the widget. Sveltia's isn't either; an `image` is a file, and its
description is a sibling `string` field the developer declares (`photoAlt`) or the item's name.
The dogfood uses the name.

### The control

New file `libs/core/src/Admin/Devtools/ImageControl.tsx`, one arm in `FieldControl`'s switch,
loaded with the rest of the modal in the admin chunk. Top to bottom:

- **A preview** — a plain `<img>` with `maxHeight: 120`, `objectFit: "contain"`, shown when the
  value is a non-empty string; a broken URL shows the browser's broken-image glyph, which is the
  honest render.
- **The URL input** — an antd `Input`, per keystroke into the draft like `string`, cleared →
  key deleted (never `""`, whether or not the field is required — the `number` rule, for the
  reason above). This input is the whole widget when no adapter is mounted, and it is how a repo
  path or an external URL gets in.
- **Upload** — an antd `Upload` with `showUploadList={false}`, `accept={field.accept ?? "image/*"}`
  and a `customRequest` that calls `adapter.upload(mediaPath(collectionName, file), file)`, then
  `set(asset.url)`. `beforeUpload` rejects a file over `maxBytes` or outside `accept` (checked
  against `file.type` when the browser supplies one) with the reason under the field. While the
  upload is in flight the button shows antd's loading state and the input is read-only; a failure
  renders the adapter's error message under the field through `Form.Item`'s `help`, the same
  place validation messages live, and leaves the previous value alone.
- **Choose existing** — a toggle that expands a thumbnail grid from
  `adapter.list(collectionName)`, newest first, click to set. Inline, not a nested modal: the
  Collections modal is already a `Modal`, and the picker is a dozen thumbnails, not a library
  (§A item 2 is the line it does not cross). It is also the only view palimp offers of what the
  bucket holds — including the orphans §F describes — and that visibility is half of why `list`
  is in the contract.
- **Clear** — deletes the key. Same as clearing the input.

**Feature detection.** `use(PalimpMediaContext)`; when `null`, Upload and Choose existing render
disabled with the tooltip **"No media provider"**, the publish button's idiom verbatim: a missing
provider is a host wiring decision or mistake, and the button that says so is the only thing that
distinguishes the two from a broken one. The URL input is unaffected. Hiding the buttons instead
was considered and rejected in the alternatives.

**What the widget does not check.** It does not verify that the URL points at an image, or at
anything. A typed path is the host's business — the degraded mode exists so that repo assets and
Sveltia-managed files can be referenced (§A), and a fetch-to-validate would fail on a relative path
before the site is built.

### Behaviour that falls out of composition

- The uploaded image appears on the admin's page **before any Save** wherever the collection is
  rendered through `<PalimpCollectionList>`, because the URL enters the draft and the live list
  re-renders the card (phase 2). Preview mode shows it as a plain card (D7). Save writes the URL
  inside the document in the same `setKeys` batch as everything else; the badge counts it as part
  of the collection's one entry.
- **Duplicate** copies the URL verbatim, so two items share one file. Nothing tracks that, which
  is one of the reasons nothing deletes (§F).
- Inside a `list` widget — the host's gallery — the same control renders per entry through the
  existing recursion. No gallery-specific code.
- The interaction guard is not involved: the modal's controls are plain antd, as phase 1
  established, and the native file dialog opens normally.

## §D — Paths, URLs and caching

### The relative path, computed in core

New file `libs/core/src/Admin/mediaPath.ts` — admin-side, since only the widget calls it; a
third-party adapter receives the path and does not compute one:

```
<collectionName>/<yyyymmddThhmmss>-<4 random base36 chars>-<sanitised filename>
varieties/20260831T101500-k9pq-gros-michel.jpg
```

The filename is lowercased, reduced to `[a-z0-9._-]` (anything else becomes `-`, runs collapsed),
capped at 64 characters with the extension kept. The timestamp is UTC, and it is there for two
things at once: it makes the path unique without a lookup, and it makes `list` sort by name equal
sort by time — on both backends, with no metadata calls. The random suffix covers two uploads in
one second. The collection name is the folder, so a console browses the bucket the way the modal
groups it.

Content-addressed paths (a hash of the file) were the other candidate and lost: they buy
idempotent re-uploads and lose ordering, and they need an exists-check or a 409 handler in both
adapters. Re-uploading the same file therefore creates a second object; that is an orphan of the
kind §F accepts, and simpler adapters were worth it.

### Never overwritten

Nothing palimp writes is ever written again. The adapters pass `upsert: false` (Supabase) and the
policies and rules in §E permit `insert`/`create` only — so even a deliberate overwrite from a
signed-in session is refused by the backend, not just avoided by the client. Two consequences:

- **URL stability across rebuilds — the README's first question — is answered by construction.**
  A URL, once stored in a document, points at bytes that do not change and are not removed by
  anything palimp does. A rebuild re-emits the same string into the same `<img>`. The only thing
  that invalidates a stored URL is the host moving the bucket or the project, which rewrites
  documents (D10's accepted cost); a host that does that has a data migration on its hands
  regardless, because the profile rows and `inline` rows moved too.
- **Long caching is safe.** The adapter uploads (and the deferred Firebase design uploads) with `Cache-Control: public, max-age=31536000,
  immutable` (Supabase's `cacheControl: "31536000"`, which it prefixes; Firebase's metadata field
  verbatim). A CDN or a browser may hold the bytes for a year, correctly, because the path will
  never mean anything else.

### The URL formats

Both are deterministic from configuration, which is what makes `url()` pure:

| backend | `url(path)` |
| --- | --- |
| Supabase | `${projectUrl}/storage/v1/object/public/${bucket}/${path}` — the format `getPublicUrl()` produces, written out so no SDK is initialised for a string |
| Firebase | `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(fullPath)}?alt=media` — the **tokenless** form, valid because the rules make reads public |

Firebase's `getDownloadURL()` was rejected: it is a network call, and it appends a per-object
`token` that is revocable from the console — a URL that can be silently invalidated is the one
kind D13 exists to rule out. With public read rules the token adds nothing.

Both URLs ship in `staleDocument` and in the visitor HTML like any other fact — roughly 100–150
bytes per image, and, unlike the declaration, growing with content. Phase 1 §E's caveat about
`staleDocument` applies and the dogfood's payload delta is a verification item, not a guess.

## §E — The implementation, and the one deferred

`be-supabase` gains **two new files** and **two one-line additions** — the layout the Firebase
adapter copies when it arrives (D14): `src/media.ts`
(the factory, pure of React), `src/MediaProvider.tsx` (`"use client"`; a tiny component that puts
an adapter on `PalimpMediaContext`), a re-export of `createMediaAdapter` from `./client`, and the
`media` prop on the existing provider in `react.tsx`. No new `exports` entries — the three entry
points stay the three entry points — and `server.ts` is untouched, because the build never needs
the media adapter: it renders URLs that are already strings.

```tsx
// the shape the provider takes (the Firebase provider gets the same prop with its own options type, later)
interface Props {
  …existing props…
  /** Mount a media adapter beside the backend one. Omit it and the image widget's upload is disabled. */
  media?: SupabaseMediaOptions;
  children: ReactNode;
}
```

The provider builds the media adapter in the same `useMemo` discipline as the backend one and
renders `<PalimpMediaContext value={media ?? null}>` inside its own context. The factory is also
public through `./client`, for a host that wants the pure `url()` on the server — for a seed, or
for an `og:image` in `generateMetadata` — without a provider.

### Supabase — `@palimp/be-supabase`

```ts
export interface SupabaseMediaOptions { bucket?: string }  // default "palimp"

export const createMediaAdapter = (
  url: string,
  publishableKey: string,
  options: SupabaseMediaOptions = {},
): PalimpMediaAdapter
```

`ensureSupabase()` calls `createBrowserClient(url, publishableKey)` and receives the singleton the
backend adapter already created — the session comes with it, so uploads run as the `authenticated`
role under the owner's JWT. `upload` is `supabase.storage.from(bucket).upload(path, file,
{ cacheControl: "31536000", contentType: file.type, upsert: false })`; `list` is
`.list(prefix, { limit: 1000, sortBy: { column: "name", order: "desc" } })` with folder
placeholders and dot-files filtered out and the returned `metadata.size` / `metadata.mimetype`
mapped through the `...(x ? { x } : {})` house pattern; `url` is the template from §D.

**Setup, in the shape of the table grants** — a new `## Storage bucket` section in the README,
between the Postgres schema and session detection, with the same three parts the tables have
(what the adapter requires, how it is read and written, suggested policies), and the same
caveat about "any authenticated user":

```sql
-- One public bucket. Reads through /object/public/ need no policy; the limits are backstops
-- for the widget's own `maxBytes` / `accept` (which a bucket cannot see).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('palimp', 'palimp', true, 10485760, array['image/*']);

-- Signed-in users may add objects. There is deliberately no update and no delete policy:
-- a session can add files but never alter or remove one a published page references.
create policy "palimp media insert (auth)" on storage.objects
  for insert to authenticated with check (bucket_id = 'palimp');

-- list() in the widget's picker goes through the storage API and does need select.
create policy "palimp media list (auth)" on storage.objects
  for select to authenticated using (bucket_id = 'palimp');
```

Plus the wiring line: `media={{ bucket: "palimp" }}` on `PalimpSupabaseProvider`. Quirks the
README records: the public URL embeds the project ref and bucket (relocation rewrites documents);
the free tier's global upload ceiling (50 MB at the time of writing) sits above the bucket limit
and is the one limit the SQL does not set; a bucket-limit or MIME rejection arrives as a storage
error whose message the widget shows verbatim; `allowed_mime_types` wildcards are accepted by the
dashboard field and should be confirmed against the API at implementation.

### Firebase — `@palimp/be-firebase`, designed and deferred (D14)

**Not built in this phase.** Cloud Storage is not provisioned on the Firebase side and will not
be before the feature is published, so nothing below can be verified, and per D14 nothing below
is shipped. It is kept in full because it is the follow-up's specification: the same two files,
the same prop, two SDK calls swapped. When Storage exists, an implementation session builds this
subsection against it, appends to this plan's divergence note, and bumps lockstep.

```ts
export interface FirebaseMediaOptions {
  /** gs:// bucket name. Default: `config.storageBucket`. Throws at first use if neither is set. */
  bucket?: string;
  /** Folder inside the bucket. Default "palimp". */
  prefix?: string;
}

export const createMediaAdapter = (
  config: FirebaseOptions,
  options: FirebaseMediaOptions = {},
): PalimpMediaAdapter
```

`ensureStorage()` dynamic-imports `firebase/storage`, finds the named app the way
`ensureFirebase()` does, and calls `getStorage(app, bucket && \`gs://${bucket}\`)`. `upload` is
`uploadBytes(ref(storage, \`${prefix}/${path}\`), file, { contentType: file.type, cacheControl:
"public, max-age=31536000, immutable" })`; `list` is `listAll(ref(storage, \`${prefix}/${p}\`))`,
mapped to `{ path, url }` **without** `size` — `listAll` returns references, and one `getMetadata`
per item is a round trip per thumbnail that the picker does not need; `exactOptionalPropertyTypes`
is why the field is omitted rather than `undefined`. Sorted by name descending, which §D made
mean newest first. `url` is the tokenless template from §D over the full path.

Firebase differs from Supabase in one thing the setup docs must say first: **the default bucket is
not free to assume.** The web config needs `storageBucket`, the example's does not have one, and
the name (`<project>.firebasestorage.app` for newer projects, `<project>.appspot.com` for older
ones) is read from the console's Storage page, never inferred. Cloud Storage for Firebase also has
to be provisioned in the console before the first upload, and for projects created after October
2024 that requires the pay-as-you-go plan — stated with the date because it is the kind of fact
that changes, and verified against the console at implementation rather than here.

**Setup, in the shape of the Firestore rules block** — a new `## Cloud Storage` section in the
README with the path layout table and:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /palimp/{allPaths=**} {
      // Public read — the published site bakes tokenless URLs, so it has to be.
      // `read` covers `list`, which the widget's picker uses.
      allow read: if true;
      // Signed-in users add; nothing from the client alters or removes. The size and
      // type checks are backstops for the widget's own `maxBytes` / `accept`.
      allow create: if request.auth != null
                    && request.resource.size < 10 * 1024 * 1024
                    && request.resource.contentType.matches('image/.*');
      allow update, delete: if false;
    }
  }
}
```

Plus `storageBucket` in the config, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` in the workflow, and
`media={{}}` on `PalimpFirebaseProvider`. Quirks the README records: no CORS configuration is
needed — SDK uploads and `<img>` rendering are both fine cross-origin, and the one path that would
need it (`getBlob`/`fetch` of object bytes) is nothing phase 3 does; `firebase/storage` is a
dynamic import inside `ensureStorage()` like every other SDK module here, so visitors download
none of it; `allow update: if false` means a second upload to an existing path fails with
`storage/unauthorized` — unreachable through palimp, whose paths are unique, but the error a host
sees if it reuses the prefix from its own code.

### Bundle cost, named

`createMediaAdapter`'s shell is statically imported by `react.tsx` and therefore ships in the
provider's chunk to every visitor, exactly as `createClientAdapter`'s shell does today. The SDK
imports inside it are dynamic. The expected eager-JS delta is a few hundred bytes for the supabase
example and is a verification item; the firebase example ships nothing new; the widget, the path
helper and the picker live in the admin chunk and cost visitors nothing.

## §F — Orphans, limits, and what uploading before Save costs

### Orphans

An object nobody references is created by four things, all of them ordinary use: deleting an item
whose photo was uploaded; **Discard changes** after an upload; re-uploading a file (new timestamp,
new object); and Duplicate-then-change on the copy — no, the reverse: Duplicate keeps a shared
reference, so deleting *one* of the two items must not delete the file, which is the sharpest
reason there is no delete-on-item-delete. Palimp removes nothing (D11 forbids the client from
doing so even if it tried), which puts orphaned files in the same category as orphaned prose rows:
documented, visible, cleaned up by hand in the backend console when anyone cares. Two things keep
the category small and visible — the folder-per-collection layout, which makes the console
navigable, and the picker, which shows every object in that folder including the unreferenced
ones. Timestamps in the names tell a human which are stale.

What is *not* offered, and why: a "delete this file" affordance would need a reference check
across items, across collections and across prose rows to be safe, and palimp has no index for the
last of those. Offering it without the check is offering a broken-image generator. §A item 3.

### Upload before Save

D13's cost, said once more in the owner's terms: an upload lands in the bucket the moment it is
chosen, and is public from that moment; the *item* that references it lands at Save; the *page*
that shows it lands at Publish. Between the first and the third, the file is reachable by anyone
with the URL — unlisted, since the path carries a random suffix, but not private. For a host whose
photographs are consent-gated this is a rule to know rather than a surprise to discover: clear the
photo before it goes near the modal, because the modal is the last step, not a holding area. The
README quirk says exactly that.

### Limits

Three layers, each a backstop for the one above it:

| layer | Supabase | Firebase (deferred design) | who sees the failure |
| --- | --- | --- | --- |
| widget: `maxBytes`, `accept` | — | — | the owner, before any request, in the field's help text |
| bucket / rules | `file_size_limit`, `allowed_mime_types` on the bucket | `request.resource.size`, `contentType.matches` in rules | the owner, as the backend's error message under the field |
| platform | the project's global upload ceiling (plan-dependent) | none per file that matters here | as above |

The widget has no default `maxBytes`. A default would be a guess about every host's images; the
bucket limit in the setup SQL (10 MB) is the effective ceiling for a host that copies it, and a
schema author who wants a friendlier, earlier rejection sets `maxBytes` on the field. What the
plan does not do about size is the honest part: **no processing.** A 9 MB photo is served to every
visitor at 9 MB. That is §A item 1, and the flip condition covers it.

Two more facts for the quirks sections. `accept="image/*"` admits HEIC on browsers that report it
as an image, and HEIC renders only in Safari — a host that cares sets `accept` to explicit types.
And `list` caps at 1,000 objects per folder on Supabase (the request's `limit`) and is unbounded
on Firebase; both are far past §A item 6.

## §G — Where the code lands

| package | new | changed |
| --- | --- | --- |
| `core` (root) | `PalimpMediaAdapter.ts`, `PalimpMediaContext.ts` | `index.ts` (three exports); `collections.ts` (`ImageField`, the `FieldValue` row, the validator case) |
| `core/admin` | `Devtools/ImageControl.tsx`, `mediaPath.ts` | `Devtools/CollectionsModal.tsx` (one `FieldControl` arm, one `newItem` arm) |
| `be-supabase` | `src/media.ts`, `src/MediaProvider.tsx` | `src/client.ts` (re-export), `src/react.tsx` (`media` prop) |
| `be-firebase` | — (deferred, D14) | — (README note; lockstep version bump only) |
| `fe-next` | — | — (README only) |
| `examples/*` | — | `collections.ts` and `VarietyCard.tsx` in both; `layout.tsx` and the fixtures in the supabase example only |

**What does not change, stated so the review can check it:** `PalimpClientBackendAdapter`,
`PalimpServerBackendAdapter`, `PalimpPublishAdapter`, `Message`, both `server.ts` files,
`editsStore`, `useSaveButton`, `EditComponent`, `LiveCollectionList`, `PalimpCollectionList`,
`palimp()`, `collection()`, and every `exports` map. `fe-next` ships **zero code changes** — the
card renders an `<img>` from a string it already receives, and the payload carries a string it
already carries. The lockstep bump is 1.6.0 → 1.7.0, inside the feature commit; `be-firebase`
bumps with the set and ships no code change, exactly as `fe-next` does in this phase.

This is the first feature in the repo that adds files to a backend package, and the
architecture doc's "adapter-shaped" section should say so when it lands, as a third re-test with
an honest result: the *contract* was added as a new seam (like publish, unlike a method on
storage), and the *implementations* landed in the backend packages because the capability lives
in the backend's project. Adding a backend still touches zero files in `core`; adding a media
backend touches zero files in `core` too, and one optional prop in its own provider.

## §H — The dogfood

Both examples, identically:

- `app/collections.ts`: `varieties` gains `{ name: "photo", widget: "image", label: "Photo" }`,
  optional. `defaultItems` gain **no** photos — the empty-database-changes-nothing rule is what
  makes the seed worth having, and a seed that needs a bucket would break it. The cards render
  without an image until the owner adds one, which is also what makes the credentialed pass
  meaningful.
- `app/VarietyCard.tsx`: `{item.photo ? <img src={item.photo} alt={item.name} style={…} /> : null}`
  above the title. A plain `<img>`, not `next/image`: on a static export `next/image` needs
  `unoptimized` or a custom loader and buys nothing for a URL the build cannot process; the loader
  route is §A item 1's territory.
- `app/layout.tsx`, **supabase example only**: `media={{ bucket: "palimp" }}` on the provider.
  The firebase example's layout and workflow are **untouched** — no `media` prop, no
  `storageBucket` (D14). Its Photo field therefore renders the degraded widget: a URL input with
  Upload and Choose existing disabled and "No media provider" on hover. That is deliberate and
  worth more than a second copy of the happy path: it is the only real page on which the D12
  promise is exercised, and it is what the Firebase follow-up flips with one prop.
- `collections.fixtures.ts` (supabase example only, as before): the `photo: 3` fixture.

The supabase demo database and bucket keep whatever the credentialed pass uploads, as the previous
phases kept their test items — the landing note lists it.

## §I — What phase 3 deliberately does not do

1. **No processing.** No resizing, no variants, no format conversion, no `next/image` loader. One
   file, one URL, served as uploaded. (§A item 1.)
2. **No delete.** Not on item deletion, not from the picker, not on Discard. (§A item 3, §F.)
3. **No private assets, no signed URLs.** (D11, §A item 5.)
4. **No media outside collections.** No image `PalimpField`, no images in prose. (§A item 4.)
5. **No asset metadata.** No alt text, captions or tags on the file; alt text is an item field.
   (§A item 2.)
6. **No upload progress, no drag-and-drop onto the page, no multi-file upload.** The `Upload`
   control's own drop target and single-file flow are the whole interaction; a `list` gallery is
   filled one entry at a time through the existing repeater.
7. **No non-image media.** The widget is `image`; a `file` widget with a download link is a
   phase-4 flag on the same seam if a host asks.
8. **No server-side media adapter.** The build renders strings. A host wanting `url()` on the
   server calls the factory, which is pure for that method.
9. **No Firebase media adapter.** Designed in §E, deferred by D14 until Cloud Storage exists to
   verify it against; the firebase example runs the degraded widget meanwhile.
10. **Phase 1 §H items 6–8 and phase 2 §G items 1–6 carry forward untouched.** In particular a
    photo added to a new item is visible to visitors only after Publish, like everything else.

## Alternatives weighed and rejected

- **Store the storage path and resolve it to a URL at render.** Bucket-relocatable, and rejected
  in D10: three resolution surfaces (server, live client, visitor), a `setMediaAdapter()`
  singleton, a context read in every visitor card, and a widget that must vanish without an
  adapter. The URL form keeps `fe-next` at zero changes and keeps repo assets and Sveltia-managed
  files usable through the same field.
- **Signed URLs.** Expire; the HTML does not. (D11.)
- **Defer the upload to Save.** Would spare orphans from discarded drafts at the price of a
  non-string draft layer, a media-aware save path and a live card that cannot show the image —
  three invariants for one class of leftover the repo already documents. (D13.)
- **Content-addressed paths.** Idempotent re-uploads, but unordered listings and an exists/409
  branch in both adapters. Timestamps give ordering for free and simpler adapters. (§D.)
- **A media method on `PalimpClientBackendAdapter`.** The exact shape the architecture doc
  praises publish for *not* taking. It would force every backend to have storage and put the
  widget's feature detection behind a method-exists check instead of a context.
- **A separate `<PalimpSupabaseMediaProvider url publishableKey bucket>`.** Mirrors the publish
  provider's *form* while repeating the backend's credentials in a second place. The prop
  expresses the truth — same project, same key, same session — and the bare context remains for
  anyone whose media lives elsewhere. (D12.)
- **A fourth `./media` entry per backend package.** A subpath so a hundred-line factory can avoid
  a `./client` it shares a session with; indirection with no beneficiary, and a change to every
  `exports` map for it.
- **Hide Upload when no adapter is mounted.** Indistinguishable from a widget that never had one.
  The drawer's rule is "disabled, and say why", and it has caught one real wiring mistake already
  (the comment at [PalimpPublishContext.ts](../../../libs/core/src/PalimpPublishContext.ts) is its
  record).
- **Firebase `getDownloadURL()` token URLs.** A network call to produce a string, and a token the
  console can revoke — the one way a stored URL could stop working that the design otherwise rules
  out. Public rules make the tokenless form correct.
- **Data URLs in the document.** Zero infrastructure and rejected on sight: a 2 MB photo becomes a
  2.7 MB string in a Firestore document capped at 1 MB, in a `staleDocument` that ships in the
  flight payload, in a `loadMessages()` that reads the whole table per build.
- **A git-backed adapter now** (commit the file through the GitHub Contents API with the publish
  PAT; the URL is the deployed site's own path). Expressible on this seam — which is a point in
  the seam's favour — but its URL is not live until Publish, so the live card would show a broken
  image until then, and it widens the browser-resident PAT from `actions: write` to
  `contents: write`. Noted as a possible third adapter for a host that wants media in the repo;
  not built.
- **Build the Firebase adapter now, unverified.** It is a hundred lines and the design is on the
  page, so the temptation is real. Rejected by D14: there is no bucket to run it against and there
  will not be before publish, and the repo's verification rule exists precisely so that "it
  typechecks" is never reported as "it works". The seam makes it a drop-in later; the firebase
  example's degraded widget makes the wait honest rather than silent.
- **Embedding Sveltia CMS for media now.** §A. Not central; the flip condition and the
  coexistence path are written down for when it is.

## Documentation to update when it lands

- [libs/core/README.md](../../../libs/core/README.md) — the contracts block gains
  `PalimpMediaAdapter`; the contexts section gains `PalimpMediaContext` beside the publish one, as
  the second nullable context; a **Writing a media adapter** section after "Writing an adapter";
  the Collections section gains the `image` widget and the control's behaviour. **Quirks:** an
  upload is public on upload, before Save or Publish; nothing deletes objects, and the four ways
  orphans arise; Duplicate shares a file between two items; `image` clears to absent, never `""`;
  no processing; HEIC.
- [libs/be-supabase/README.md](../../../libs/be-supabase/README.md) — a `## Storage bucket`
  section in the shape of the schema section (§E), the `media` prop in Usage, and the quirks §E
  lists.
- [libs/be-firebase/README.md](../../../libs/be-firebase/README.md) — one **quirk**, not a
  section: the media seam has no Firebase implementation yet, so mount no `media` prop and the
  image widget's upload is disabled with "No media provider" — a URL typed by hand still works.
  The `## Cloud Storage` section in the shape of the Firestore section (rules block,
  `storageBucket` in Usage, the provisioning and plan note, the quirks §E lists) is written by
  the follow-up that builds §E's Firebase subsection.
- [libs/fe-next/README.md](../../../libs/fe-next/README.md) — the Collections section shows an
  `image` field and the card's `<img>`; the provider mounting step shows the `media` prop as
  optional, with the same sentence shape as the publish provider's ("leave it out and the image
  widget's upload is disabled; the drawer says so"). **Quirks:** a photo used in
  `generateMetadata` (`og:image`) is `asString`-like — baked, changing only on publish; the URL
  ships in the payload per item.
- [docs/architecture.md](../../architecture.md) — the contracts section becomes "five seams: four
  adapter interfaces and the context quartet", with `PalimpMediaAdapter` and its context; the
  layers diagram gains the media context and `be-supabase`'s `media.ts`; the collections bullet
  gains one sentence on the image widget; "Why the design is adapter-shaped" gains the third
  re-test from §G; Security posture gains "uploads are public on upload" beside the PAT paragraph.
- README.md here — decision log rows D9–D13 (done with this plan), phase map row, next steps.
- **The publish-github README does not change**, and neither does anything in
  `libs/publish-github`.

## Verification

1. **`pnpm check-types`**, including the `photo: 3` fixture. The `FieldValue` row and the
   validator case are the invariant pair; the review checks both moved.
2. **`pnpm build`** — every `exports` map unchanged and still matched by `dist/`; `ImageControl`
   and `mediaPath` appear in the admin chunk only.
3. **Stub-adapter static export of the supabase example** (the phase-1 item 3 procedure), with
   the `media` prop mounted: no upload code and no storage-API code in any eager chunk (and
   present in a lazy one, so the grep proves something); the eager-JS delta from the provider's
   new shell measured and recorded — expected under 1 KB; a stored document with one `photo` URL
   renders as `<img src>` in `out/index.html` with the URL verbatim; payload delta recorded. The
   same export of the **firebase** example shows zero eager-JS delta from this phase beyond the
   card's `<img>` branch.
4. **Pure-function fixtures, `node -e` against the built `dist`, no backend:** `mediaPath` on a
   filename with spaces, diacritics, uppercase and a 200-character stem (sanitised, capped,
   extension kept, sorts after a path made one second earlier); `url()` from the Supabase factory
   on a path with a slash and a space (joined verbatim onto the public-object prefix, no SDK
   initialised); the validator on `photo: ""` (dropped, "must be a non-empty string"), `photo: 42`
   (dropped), a present valid URL (kept), and an absent optional photo (kept).
5. **The credentialed manual pass — no build covers any of this.** Supabase — the house rule and,
   with D14, the only implementation. Ask rather than report types-and-export verification as
   done. In order:
   - the bucket and policies from §E applied to the demo project exactly as written in the README
     — the docs are "good enough to run without guessing" only if this step needed no guessing;
   - with **no** `media` prop: the Photo field shows the URL input, Upload and Choose existing
     disabled with "No media provider"; a typed `/some/path.jpg` lands in the draft and the live
     card renders the (broken) image; clearing the input removes the key from the document;
   - with the prop: choose a JPEG → one storage request → the object appears in the bucket under
     `varieties/<timestamp>-<rand>-<name>.jpg` with `Cache-Control` `max-age=31536000` and the
     right `Content-Type`; the field's preview and the **live card show the image before any
     Save**; preview mode shows it as a plain card;
   - the badge reads `Save (1)` for the collection; Save writes **one** `setKeys` POST whose
     document carries the URL; the row round-trips; `curl` on the URL **unauthenticated** returns
     200 and the bytes;
   - upload the same file again → a second object, a second URL, no error (§D);
   - a file over the bucket's `file_size_limit` → the storage error text under the field, previous
     value intact; a file over a schema `maxBytes` → rejected before any request; a non-image
     with `accept` left default → the browser filters it, and a forced one is rejected by the
     bucket's MIME list;
   - Choose existing lists both uploads newest first; clicking one sets the URL;
   - upload, then **Discard changes** → the draft is gone and the object remains (the orphan,
     confirmed and README-linked);
   - Duplicate the item → both cards show the same image; delete the original → the copy still
     does;
   - a second signed-in session attempting `update`/`remove` on the object through the SDK is
     refused by the policy (the create-only claim, tested rather than asserted);
   - a full static export against the real table renders the uploaded photo in the visitor HTML;
     Publish stays blocked on the deploy workflow building `main`, as before, and the landing note
     says so;
   - the **firebase example** is the degraded-mode fixture by construction (no `media` prop), but
     its admin UI needs a Firebase session, which the house rule keeps out of scope — so the
     degraded state is verified on Supabase by omitting the prop (second bullet above), and the
     firebase example's own admin rendering is recorded unrun, as its Firestore round-trip has
     been since phase 1.

**If any part of item 5 was not run, the landing note says so, item by item** — the house rule
from [host-adoption.md](../host-adoption.md), kept by both previous phases and the reason their
notes can be trusted.

---

## Divergence note (2026-08-31, implementation)

Built as specified — §G's file list, §G's "what does not change" list intact — with the following
departures. Three were found by measuring, three by driving the widget against a real bucket, and
one by reading an SDK.

1. **The eager-JS delta is +1,336 B, not §E's "a few hundred bytes … expected under 1 KB".**
   Stub-adapter static export, the phase-1 item 3 procedure, uncompressed: eager JS
   643,733 → 645,649. Decomposed against the firebase example, which gains the same card and no
   adapter code, the card's `<img>` branch is +176 B and the **`be-supabase` media shell is
   ≈ 1,160 B**. §E predicted the shell would be eager and it is; it predicted the size and was
   low. A third build settled who pays: with the `media` prop **removed** the eager JS is
   byte-identical (645,649), because `react.tsx` statically imports the provider that builds the
   adapter. So a Supabase host that never mounts media still ships the shell. Recorded as a
   be-supabase quirk rather than fixed — a fourth `./media` subpath is the fix the alternatives
   section already rejects, and the beneficiary would be a host that opted out of a feature.
2. **Supabase serves `cache-control: public, max-age=31536000`; `immutable` is not expressible.**
   §D said the upload sends `public, max-age=31536000, immutable`. Reading `storage-js` showed
   only `max-age=${cacheControl}` being composed, so the first draft of the README said "not
   `public` and not `immutable`" — and `curl` on the real object then showed `public,` present
   after all, added above the storage API. Both the README and the source comment now say what
   the object actually serves. A year is still correct without `immutable`, for §D's reason.
3. **`FieldsEditor` and `FieldControl` gained a `collectionName` prop.** §B costed the widget as
   "one arm in each of three switches plus one row in `FieldValue` and one in the validator", and
   the arms are exactly that — but the control needs the collection's name for `mediaPath`'s
   folder and for the picker's `list` prefix, and neither component had it. It is threaded
   unchanged through the recursion, so an image inside a `list` uploads to its collection's
   folder like a top-level one.
4. **The upload error renders through a *nested* `Form.Item`.** §C said the message lands "through
   `Form.Item`'s `help`, the same place validation messages live". The outer item's `help` is
   computed from the validator's problems in `FieldsEditor`, which the control cannot reach, so
   `ImageControl` renders its own `Form.Item` with `validateStatus`/`help` around its contents.
   Same place on screen, same mechanism; a validation problem and a failed upload can now show
   as two lines, which is right — they are two different facts.
5. **A rejected upload's message outlived the item it belonged to — fixed by keying the form.**
   Found by driving: selecting another item kept the message under *that* item's Photo field,
   because React reconciles the same `ImageControl` instance across a selection change and the
   error is its state. `CollectionEditor`'s `<Form>` now carries `key={selectedIndex}`, so
   switching items remounts the controls. Everything they render comes from props, so the only
   thing this resets is transient control state — the error and the open picker, both of which
   *should* reset.
6. **Two bugs in the widget's own gates, both found by exercising them.** `acceptsType` treated
   `*/*` as the prefix `*/` and therefore rejected everything a wildcard-accepting field was
   given; it now short-circuits `*` and `*/*`. And `formatBytes` rounded anything under 1 KB to
   "0 KB", so a `maxBytes` rejection read "is 0 KB; the limit for this field is 0 KB"; it now
   renders bytes below 1 KB.
7. **`<Space direction>` is deprecated in antd 6** (`Please use `orientation` instead`), which the
   dev overlay reported on the first render of the widget. Changed to `orientation`; it was the
   only `direction` prop in the workspace.

**Small unplanned decisions, recorded:** the media adapter is mounted by rendering
`SupabaseMediaProvider` conditionally rather than §E's `<PalimpMediaContext value={media ?? null}>`
— building the adapter is a `useMemo` and a hook cannot be called conditionally, and not rendering
the context is identical to mounting `null`, which is what the context already defaults to;
`mediaPath` takes `Pick<File, "name">` rather than a `File`, so it is callable from a fixture;
sanitising leaves a trailing separator before the extension when the stem ended in a stripped
character (`(final).JPG` → `-final-.jpg`), which the §D rule as written produces and which nothing
depends on; `CLAUDE.md` and the root `README.md` each had a "four contracts / three contexts"
count that this phase makes wrong, so both were corrected — outside the plan's documentation list,
but leaving them would have left the repo describing itself incorrectly.

**Landing notes.** Verification status, item by item.

**Items 1–4 ran and pass.** Item 1: `check-types` clean, and the new `photo: 3` fixture fails with
**TS2322** as §C predicted — checked to be live by giving it a valid value, which produces TS2578.
Item 2: `pnpm build` clean, every `exports` map unchanged. Item 3 (stub-adapter static export,
final code): supabase visitor `out/index.html` 24,995 → **25,595** and eager JS 643,733 →
**645,649** with the same stored document on both sides; against a document with no photo at all
the html figure is 24,869, so an image costs ≈ 726 B of payload end to end. The stored photo URL
renders as `<img src>` in `out/index.html` **verbatim**. The **firebase** example, which mounts no
`media` prop: `index.html` 21,275 → **21,337** (+62, the schema's new field row) and eager JS
636,647 → **636,823** (+176, the card's `<img>` branch) — and **no adapter code at all**, grepped.
Chunk placement as §E promised: "No media provider" and "Choose existing" appear in the lazy admin
chunk only, the adapter shell (`31536000`, the public-URL template) in the eager provider chunk,
and `StorageApiError` / `GoTrueClient` in a lazy one. Item 4: twelve pure fixtures against the
built `dist` with no backend, all passing — `mediaPath` on spaces, diacritics, uppercase and
parens; a 200-character stem capped at 64 with `.jpeg` kept; a path made one second later sorting
after one made earlier; a leading dot not treated as an extension; `url()` on a path with a slash
and a space, with a trailing-slash base and a custom bucket, no SDK initialised; and the validator
on `photo: ""` (dropped, "must be a non-empty string"), `photo: 42` (dropped), a valid URL (kept),
an absent optional (kept, key still absent) and a missing required (dropped).

**Item 5 ran 2026-08-31 against real Supabase credentials**, CDP-driving a signed-in session in
the dev server, and passes except where noted at the end:

- **The bucket and policies from §E applied to the demo project exactly as written**, from the
  README section, in one go — no guessing, no step the docs left out. `allowed_mime_types` took
  the `image/*` wildcard, which §E flagged as unconfirmed.
- **Degraded mode, with the `media` prop removed:** the Photo field showed its URL input with
  Upload, Choose existing and Clear disabled and **"No media provider"** on hover (confirmed in a
  screenshot). A typed `/some/path.jpg` entered the draft, the badge read `Save (1)`, and the live
  card rendered `<img src="/some/path.jpg">` — the broken image, before any Save. Clearing removed
  the **key**: all five cards survived with zero validity marks, where a stored `""` would have
  failed the new validator case and had `LiveCollectionList` drop the card. Confirmed again after
  a save — the stored document has a `photo` key on exactly one item.
- **With the prop:** choosing a JPEG made **one** upload POST (200); the object landed at
  `varieties/20260831T001013-<rand>-gr-s-michel-photo-final-.jpg` — folder per collection,
  UTC timestamp, random suffix, the filename lowercased and reduced. `curl` **unauthenticated**
  returned **200**, `content-type: image/jpeg`, `cache-control: public, max-age=31536000`. The
  field's preview and the **live card showed the image before any Save**; preview mode showed it
  as a plain card with zero editors.
- **Save** wrote **one** `setKeys` POST to `/rest/v1/inline?on_conflict=key` whose document
  carried the URL, the badge went to `Save (0)`, and the row round-trips as a **string**.
- **Uploading the same file again** produced a second object and a second URL with no error.
- **The three limit layers each behaved as designed:** a file over the bucket's `file_size_limit`
  came back 400 with the storage error **"The object exceeded the maximum allowed size"** shown
  verbatim under the field, previous value intact; a file over a schema `maxBytes` was rejected
  with **zero storage requests**; a forced non-image was rejected by the widget's own `accept`
  gate, also with zero requests. To exercise the *bucket's* MIME list as a backstop the schema
  was temporarily narrowed so the widget would pass a text file — the bucket answered 400,
  **"mime type text/plain is not supported"**, again shown verbatim.
- **Choose existing** listed both uploads **newest first** (the timestamp ordering doing its job
  with no metadata call), including the one no item references; clicking one set the URL and
  closed the picker.
- **Upload, then Discard changes:** the draft went and the object stayed, served 200 — the orphan,
  confirmed and now documented in three READMEs.
- **Duplicate** gave two cards showing the same file; **deleting the original** left the copy
  rendering it and the object still served — the sharpest reason nothing deletes.
- **A full static export against the real table** rendered the uploaded photo in the visitor HTML,
  five cards, and **zero** `data-palimp-editor` occurrences.

**Not run, and why:**

- **The authenticated `update`/`remove` refusal was only half-tested.** What ran: **anonymous**
  `DELETE` → 403 "Access denied", and anonymous `PUT`/`POST` to the existing path with a valid
  image type → 403 **"new row violates row-level security policy"**, with the object still served
  and byte-identical afterwards. What did **not** run: the same attempt from a *second signed-in
  session*, which needs the session's access token; handling that token was out of bounds for
  this session, and the policy set the README ships grants `authenticated` only `insert` and
  `select`, which is the claim the anonymous half already exercises from below.
- **The Publish step**, exactly as in phases 1 and 2: the deploy workflow builds `main`, so
  "the added photo renders after a rebuild" stays unexercisable until a collections branch is what
  it builds. The dispatch path itself was demonstrated in phase 1.
- **The firebase example's own admin rendering**, unrun since phase 1 for want of Firebase
  credentials. Its degraded widget is verified by construction and by the zero-adapter-code grep,
  and the degraded *behaviour* was verified on Supabase by omitting the prop, which is what §E's
  last bullet asks for.

**Test data left in the demo project**, as phases 1 and 2 left theirs: three objects in the
`palimp` bucket under `varieties/` — the one the `gros-michel` item references, and two orphans
(one from the re-upload, one from the upload-then-Discard). The stored document keeps its five
items with a photo on `gros-michel`. Nothing was deleted, because nothing can be.
