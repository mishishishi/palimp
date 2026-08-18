import { createContext } from "react";
import type { PalimpPublishAdapter } from "./PalimpPublishAdapter";

// Nullable on purpose, unlike the other contexts: publishing is optional, so
// `null` is a state consumers have to handle rather than a default that never
// survives to a read. Under a non-nullable type the Publish button rendered
// enabled with no provider mounted and did nothing.
export const PalimpPublishContext = createContext<PalimpPublishAdapter | null>(
  null,
);
