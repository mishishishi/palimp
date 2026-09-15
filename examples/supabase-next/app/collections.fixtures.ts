/**
 * Compile-time fixtures for the collection item-type inference — the five §A
 * failure cases from docs/plans/collections/01-core.md. The repo has no test
 * runner, so `@ts-expect-error` inside a compiled example is the only way to
 * make a type guarantee something that breaks when it stops holding: if any
 * annotated line starts compiling, the inference has regressed and this file
 * fails the build.
 *
 * Nothing imports this module; it exists to be typechecked.
 */
import {
  defineCollection,
  PalimpCollectionList,
  type CollectionItem,
} from "@palimp/fe-next";
import type { ComponentType } from "react";

const fixture = defineCollection({
  name: "fixture",
  idField: "slug",
  fields: [
    { name: "slug", widget: "string", required: true },
    { name: "year", widget: "number" },
    {
      name: "segment",
      widget: "select",
      options: ["residential", "civic", "retail"],
    },
  ],
});

type FixtureItem = CollectionItem<typeof fixture.fields>;

// 1 — exactOptionalPropertyTypes: an optional number accepts absence, never an
// explicit undefined (TS2375). Absent-means-absent is also all the wire format
// can express.
// @ts-expect-error — `undefined` is not assignable to `number` (the error is
// reported on the declaration, which is why the directive sits up here)
export const case1: FixtureItem = {
  slug: "a",
  year: undefined,
};

// 2 — idField must name a declared field; a typo is a compile error, not a
// collection without a stable identity (TS2322).
export const case2 = defineCollection({
  name: "fixture-id",
  // @ts-expect-error — `"nope"` is not assignable to `"slug"`
  idField: "nope",
  fields: [{ name: "slug", widget: "string", required: true }],
});

// 3 — defaultItems is checked against the inferred item type: a seed missing a
// required field fails check-types rather than failing at build (TS2741).
export const case3 = defineCollection({
  name: "fixture-missing",
  idField: "slug",
  fields: [
    { name: "slug", widget: "string", required: true },
    { name: "year", widget: "number" },
  ],
  defaultItems: [
    // @ts-expect-error — `slug` is missing
    { year: 2020 },
  ],
});

// 4 — and a wrongly typed seed value fails the same way (TS2322).
export const case4 = defineCollection({
  name: "fixture-wrong-type",
  idField: "slug",
  fields: [
    { name: "slug", widget: "string", required: true },
    { name: "year", widget: "number" },
  ],
  defaultItems: [
    // @ts-expect-error — `string` is not assignable to `number`
    { slug: "a", year: "2020" },
  ],
});

// 5 — a select value narrows to its options union without an `as const` at the
// call site (TS2322).
// @ts-expect-error — `"nope"` is not assignable to the options union
export const case5: FixtureItem = { slug: "a", segment: "nope" };

// --- Phase 2: the <PalimpCollectionList> boundary, the three §A cases from
// docs/plans/collections/02-live-rendering.md. The component is called as a
// plain (async) function because this file is .ts — the props typecheck is the
// same either way.

// 6 — extra *optional* props are the pattern: the baked side supplies them,
// the live map supplies only `item`, and the card behaves sensibly without.
declare const goodCard: ComponentType<{ item: FixtureItem; staleBody?: string }>;
export const case6 = PalimpCollectionList({
  collection: fixture,
  itemComponent: goodCard,
  children: null,
});

// 7 — a card that *requires* a server-supplied prop would render wrongly in
// the live map, which can never supply it; the compiler rejects it here.
declare const needyCard: ComponentType<{ item: FixtureItem; staleBody: string }>;
export const case7 = PalimpCollectionList({
  collection: fixture,
  // @ts-expect-error — the live map cannot supply the required `staleBody`
  itemComponent: needyCard,
  children: null,
});

// 8 — the card's item type must match the schema's inference.
declare const wrongItemCard: ComponentType<{ item: { slug: number } }>;
export const case8 = PalimpCollectionList({
  collection: fixture,
  // @ts-expect-error — `slug` is a string in the inferred item type
  itemComponent: wrongItemCard,
  children: null,
});

// --- Phase 3: the image widget, docs/plans/collections/03-media.md §C.

// 9 — an `image` field is a string in the item type (it stores the file's
// public URL), so a numeric seed fails like any other wrong type (TS2322).
export const case9 = defineCollection({
  name: "fixture-image",
  idField: "slug",
  fields: [
    { name: "slug", widget: "string", required: true },
    { name: "photo", widget: "image" },
  ],
  defaultItems: [
    // @ts-expect-error — `number` is not assignable to `string`
    { slug: "a", photo: 3 },
  ],
});
