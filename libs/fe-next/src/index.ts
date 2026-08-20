export {
  collection,
  palimp,
  PalimpBackendAdapterUnsetError,
  setBackendAdapter,
  palimp as xcore,
} from "./palimp.tsx";
export type { PalimpP } from "./palimp.tsx";
export { PalimpProvider } from "./PalimpProvider.tsx";
export { PalimpFields } from "./PalimpFields.tsx";
export { PalimpCollections } from "./PalimpCollections.tsx";
export { PalimpCollectionList } from "./PalimpCollectionList.tsx";
// PalimpText is the name documentation teaches; XcoreClientComponent keeps its
// name and module — it is public surface, and renaming is a breaking change.
export { XcoreClientComponent as PalimpText } from "./ClientComponent.tsx";
// Re-exported from the `./collections` subpath rather than the core root —
// this index is imported by server components, and the root entry re-exports
// the React contexts, whose `createContext` is not available there.
export {
  collectionItemKey,
  collectionKey,
  defineCollection,
} from "@palimp/core/collections";
export type {
  CollectionField,
  CollectionItem,
  CollectionSchema,
} from "@palimp/core/collections";
export type { PalimpField } from "@palimp/core";
