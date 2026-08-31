import { defineCollection } from "@palimp/fe-next";

// The three variety cards, previously hardcoded in page.tsx as a
// fixed-cardinality set of p() calls, as a real collection: `name` is a fact,
// modal-edited only; each card's body is prose, edited inline where it sits,
// through a key derived from the item's id (`varieties.<id>.body`).
export const varieties = defineCollection({
  name: "varieties",
  idField: "id",
  fields: [
    {
      name: "id",
      widget: "string",
      required: true,
      pattern: "^[a-z0-9-]+$",
      label: "Id (slug)",
    },
    { name: "name", widget: "string", required: true, label: "Name" },
    // Optional, and `defaultItems` seeds none: the seed has to work against
    // an empty database with no bucket, which is the whole point of having
    // one. A card renders without an image until the owner adds one.
    { name: "photo", widget: "image", label: "Photo" },
    { name: "featured", widget: "boolean", label: "Featured" },
  ],
  defaultItems: [
    { id: "gros-michel", name: "Gros Michel", featured: true },
    { id: "manzano", name: "Manzano" },
    { id: "red-dacca", name: "Red Dacca" },
  ],
});

// The documented adoption pattern: keep the host's dictionary, pass its value
// as defaultMessage, let rows be overrides. A fresh item has no entry here and
// no row, so its body renders as its own key until typed into.
export const varietyBodies: Record<string, string> = {
  "gros-michel":
    "The pre-1950s 'original' banana. Creamier, sweeter, and more aromatic than what you'll find at the supermarket.",
  manzano:
    "Small, firm, and faintly apple-flavoured. A favourite of local bakers and cocktail bars.",
  "red-dacca":
    "Dense, raspberry-tinted flesh under a deep maroon skin. Wonderful grilled or eaten ripe with sharp cheese.",
};
