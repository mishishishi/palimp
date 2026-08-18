import type { PalimpField, PalimpP } from "@palimp/fe-next";

// One declaration, two consumers: `generateMetadata` reads these through
// `asString`, and <PalimpFields> hands the same array to the Devtools modal so
// they can be edited. Neither consumer can drift from the other.
export const seoFields = [
  {
    key: "meta.title",
    label: "Page title",
    defaultMessage: "Sunny Grove Bananas",
  },
  {
    key: "meta.description",
    label: "Meta description",
    defaultMessage:
      "A small independent farm growing rare and heritage bananas on the slopes of the Sierra Verde.",
  },
] as const satisfies ReadonlyArray<PalimpField>;

// `PalimpP` is exported for exactly this — naming `p` so a helper can take it.
// The spread rather than `defaultMessage: field.defaultMessage` is the
// exactOptionalPropertyTypes house pattern.
export const asString = (p: PalimpP, field: PalimpField): string =>
  p(field.key, {
    ...(field.defaultMessage ? { defaultMessage: field.defaultMessage } : {}),
    asString: true,
  });
