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
import { defineCollection, type CollectionItem } from "@palimp/fe-next";

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
