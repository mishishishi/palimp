export interface PalimpPublishAdapter {
  publish: (token: string) => Promise<PalimpPublishRun>;
  getLatestRun: (token: string) => Promise<PalimpPublishRun | null>;
}

export interface PalimpPublishRun {
  id: string;
  dispatchedAt: number;
  url?: string;
  status: PublishRunStatus;
  conclusion?: PublishRunConclusion;
}

export type PublishRunStatus = "queued" | "in_progress" | "completed";

export type PublishRunConclusion =
  | "success"
  | "failure"
  | "cancelled"
  | "timed_out"
  | "skipped"
  | "unknown";

/** A publish call refused the credential it was given — GitHub's `401`/`403`,
 *  and whatever the equivalent is for another provider. Generic rather than
 *  GitHub's own for the same reason `PublishRunConclusion` is: the drawer
 *  narrows on this with `instanceof`, so a second publish adapter reports a
 *  dead token without any consumer learning what GitHub is.
 *
 *  Adapters subclass it — see `GithubAuthError` in `@palimp/publish-github`.
 *  It lives here, beside the contract, rather than in the adapter, because
 *  dependencies point inward: `core` cannot import a class from a package
 *  that imports `core`. */
export class PalimpPublishAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PalimpPublishAuthError";
  }
}
