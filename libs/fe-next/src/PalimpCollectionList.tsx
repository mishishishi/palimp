// The `./collections` subpath, not the package root: this is a server
// component, and the root entry drags in `createContext`.
import type {
  CollectionField,
  CollectionItem,
  CollectionSchema,
} from "@palimp/core/collections";
import type { ComponentType, ReactNode } from "react";
import { PalimpCollectionListClient } from "./PalimpCollectionListClient.tsx";
import { resolveRegistration } from "./resolveRegistration.ts";

interface Props<F extends ReadonlyArray<CollectionField>> {
  collection: CollectionSchema<F>;
  /**
   * The host's item renderer, written once as a **client** component and used
   * on both sides (D6): it renders the baked children server-side into the
   * visitor's HTML, and the live admin map. The live map calls it with
   * `{ item }` and nothing else, so every prop beyond `item` must be optional
   * — a card that *needs* a server-supplied prop would render wrongly in the
   * live map, and the compiler rejects it here before the runtime can.
   */
  itemComponent: ComponentType<{ item: CollectionItem<F> }>;
  /**
   * The baked fragment: the host maps the items on the server, so the cards
   * can carry anything only the server knows — row-resolved prose via
   * `p(…, { asString: true })`, `defaultMessage` dictionaries, locale
   * prefixes. Visitors get exactly this; admins get the live map.
   */
  children: ReactNode;
}

/**
 * The live list wrapper: structural changes — add, remove, reorder, a fact
 * edited in the modal — appear on the admin's page immediately, drafts
 * included, while visitors keep the baked fragment the build produced. It is
 * also the collection's registrar (D8), so a page rendering this does not
 * also render <PalimpCollections> for the same collection.
 *
 * An async server component, the <PalimpCollections> shape with two more
 * props — so it inherits the same two quirks: it cannot sit in a
 * "use client" subtree, and it awaits loadMessages(), so setBackendAdapter()
 * must have run. Design record: docs/plans/collections/02-live-rendering.md.
 */
export const PalimpCollectionList = async <
  const F extends ReadonlyArray<CollectionField>,
>({
  collection,
  itemComponent,
  children,
}: Props<F>): Promise<ReactNode> => {
  const registration = await resolveRegistration(collection);

  return (
    <PalimpCollectionListClient
      registration={registration}
      // The one erasure at the host-facing seam: item typing is enforced by
      // this component's Props and plumbed as `unknown` past it, the way
      // AnyCollectionSchema erases the schema's.
      itemComponent={itemComponent as ComponentType<{ item: unknown }>}
    >
      {children}
    </PalimpCollectionListClient>
  );
};
