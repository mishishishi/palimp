import { createContext } from "react";
import type { PalimpDrawerAction } from "./PalimpDrawerAction";

// An empty array rather than `null`, unlike the other optional seams: "no
// actions" needs no state of its own in the drawer — it renders none. A
// provider concatenates with the value above it rather than replacing it, so
// nesting adds actions.
export const PalimpDrawerActionsContext = createContext<
  ReadonlyArray<PalimpDrawerAction>
>([]);
