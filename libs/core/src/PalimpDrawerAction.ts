import type { User } from "./types";

/** One host-configured button in the Devtools drawer, below Publish. A sibling
 *  of Publish rather than a mode of it: it reports a one-line result and an
 *  optional link, and nothing polls it afterwards.
 *
 *  `run` is a function, so a Server Component cannot pass one of these. A
 *  host configuring from its layout wants a serializable form instead — see
 *  `extraTargets` on `PalimpGithubPublishProvider`, which builds these. */
export interface PalimpDrawerAction {
  /** React key, and the suffix of the action's mutation key. Unique across
   *  every action in the tree, nested providers included. */
  id: string;
  label: string;
  /** Asked before `run`, with Cancel focused. Omit for no confirm. */
  confirm?: { title: string; content: string; okText?: string };
  /** Disable the button with "Missing publish token" when the signed-in user
   *  has none — for an action that dispatches with `user.publishToken`. */
  needsPublishToken?: boolean;
  /** Ask before `run` — and before `confirm` — when the drawer holds unsaved
   *  edits, offering to save them first. For an action that builds the site
   *  from saved content, which would otherwise leave the drafts out. */
  publishesSavedContent?: boolean;
  /** The result stays under the button until the next press. Returning
   *  nothing reads as "Done"; throwing reads as "<label> failed", narrowed on
   *  `PalimpPublishAuthError` exactly as Publish's dispatch is. */
  run: (user: User) => Promise<PalimpDrawerActionResult | void>;
}

export interface PalimpDrawerActionResult {
  message: string;
  href?: string;
}
