import { createContext } from "react";
import type { PalimpMediaAdapter } from "./PalimpMediaAdapter";

// Nullable for the same reason PalimpPublishContext is: media is optional, so
// `null` is a state the image widget renders — Upload and Choose existing
// disabled, "No media provider" on hover, the URL input still live — rather
// than a default that never survives to a read.
export const PalimpMediaContext = createContext<PalimpMediaAdapter | null>(
  null,
);
