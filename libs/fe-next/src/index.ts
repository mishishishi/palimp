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
// Re-exported from the `./collections` subpath rather than the core root —
// this index is imported by server components, and the root entry re-exports
// the React contexts, whose `createContext` is not available there.
export { collectionKey, defineCollection } from "@palimp/core/collections";
export type {
  CollectionField,
  CollectionItem,
  CollectionSchema,
} from "@palimp/core/collections";
export type { PalimpField } from "@palimp/core";
