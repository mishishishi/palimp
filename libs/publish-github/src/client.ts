import { PalimpPublishAuthError } from "@palimp/core";
import type {
  PalimpPublishAdapter,
  PalimpPublishRun,
  PublishRunConclusion,
  PublishRunStatus,
} from "@palimp/core";

/** GitHub refused the token: `401` (revoked, malformed, expired) or `403`
 *  (valid token, no rights on the repo or the workflow). Only those two —
 *  a `404` from a renamed workflow and a `429` from rate limiting stay plain
 *  `Error`s, because the remedy is not a new token.
 *
 *  Exported so a host can produce it too, and subclassed off
 *  `PalimpPublishAuthError` so the drawer narrows without importing this
 *  package. Matching on the message string was the alternative and is the
 *  wrong contract. */
export class GithubAuthError extends PalimpPublishAuthError {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "GithubAuthError";
    this.status = status;
  }
}

const isAuthStatus = (status: number) => status === 401 || status === 403;

export interface GithubPublishOptions {
  owner: string;
  repo: string;
  workflow: string;
  ref?: string;
  inputs?: Record<string, string>;
  /** Report any run of the workflow as the latest publish, not only dispatched
   *  ones. For hosts whose publish target also runs on `push`, where filtering
   *  makes the drawer name an older run as "latest". `findRunSince` always
   *  filters — matching a dispatch by timestamp needs the narrower list. */
  followAllEvents?: boolean;
}

interface GithubRun {
  id: number;
  created_at: string;
  html_url?: string;
  status: string | null;
  conclusion: string | null;
}

const githubHeaders = (token: string) => ({
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "X-GitHub-Api-Version": "2022-11-28",
});

const runsUrl = (
  opts: GithubPublishOptions,
  perPage: number,
  allEvents: boolean,
) =>
  `https://api.github.com/repos/${opts.owner}/${opts.repo}/actions/workflows/${opts.workflow}/runs?${
    allEvents ? "" : "event=workflow_dispatch&"
  }per_page=${perPage}`;

const mapStatus = (s: string | null): PublishRunStatus => {
  switch (s) {
    case "queued":
    case "waiting":
    case "pending":
    case "requested":
      return "queued";
    case "in_progress":
      return "in_progress";
    case "completed":
      return "completed";
    default:
      return "in_progress";
  }
};

const mapConclusion = (c: string | null): PublishRunConclusion | undefined => {
  if (c == null) return undefined;
  switch (c) {
    case "success":
      return "success";
    case "failure":
      return "failure";
    case "cancelled":
      return "cancelled";
    case "timed_out":
      return "timed_out";
    case "skipped":
    case "neutral":
      return "skipped";
    case "action_required":
      return "unknown";
    default:
      return "unknown";
  }
};

const mapRun = (run: GithubRun): PalimpPublishRun => {
  const status = mapStatus(run.status);
  const conclusion =
    status === "completed" ? mapConclusion(run.conclusion) : undefined;
  return {
    id: String(run.id),
    dispatchedAt: new Date(run.created_at).getTime(),
    status,
    ...(run.html_url ? { url: run.html_url } : {}),
    ...(conclusion ? { conclusion } : {}),
  };
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const dispatchWorkflow = async (
  token: string,
  opts: GithubPublishOptions,
): Promise<number> => {
  const dispatchedAt = Date.now();
  const res = await fetch(
    `https://api.github.com/repos/${opts.owner}/${opts.repo}/actions/workflows/${opts.workflow}/dispatches`,
    {
      method: "POST",
      headers: githubHeaders(token),
      body: JSON.stringify({
        ref: opts.ref ?? "main",
        ...(opts.inputs ? { inputs: opts.inputs } : {}),
      }),
    },
  );
  if (!res.ok) {
    const message = `GitHub dispatch failed: ${res.status} ${res.statusText}`;
    throw isAuthStatus(res.status)
      ? new GithubAuthError(message, res.status)
      : new Error(message);
  }
  return dispatchedAt;
};

const fetchRuns = async (
  token: string,
  opts: GithubPublishOptions,
  perPage: number,
  allEvents = false,
): Promise<GithubRun[]> => {
  // `cache: "no-store"` is load-bearing. api.github.com answers this GET with
  // `cache-control: private, max-age=60`, so a default-cache fetch lets the
  // browser satisfy the 10 s poll loop from its own copy for up to a minute —
  // stale status and stale run id, with no request to notice. The cost is the
  // conditional-request rate-limit exemption: every poll now counts.
  const res = await fetch(runsUrl(opts, perPage, allEvents), {
    headers: githubHeaders(token),
    cache: "no-store",
  });
  if (!res.ok) {
    const message = `GitHub get runs failed: ${res.status} ${res.statusText}`;
    throw isAuthStatus(res.status)
      ? new GithubAuthError(message, res.status)
      : new Error(message);
  }
  const json = (await res.json()) as { workflow_runs?: GithubRun[] };
  return json.workflow_runs ?? [];
};

const findRunSince = async (
  token: string,
  opts: GithubPublishOptions,
  dispatchedAt: number,
): Promise<GithubRun> => {
  const tolerance = 5000;
  for (let attempt = 0; attempt < 6; attempt++) {
    if (attempt > 0) await sleep(1000);
    const runs = await fetchRuns(token, opts, 5);
    const match = runs.find(
      (r) => new Date(r.created_at).getTime() >= dispatchedAt - tolerance,
    );
    if (match) return match;
  }
  throw new Error("could not locate dispatched run");
};

export const createGithubPublishAdapter = (
  opts: GithubPublishOptions,
): PalimpPublishAdapter => ({
  publish: async (token: string) => {
    const dispatchedAt = await dispatchWorkflow(token, opts);
    const run = await findRunSince(token, opts, dispatchedAt);
    return mapRun(run);
  },
  getLatestRun: async (token: string) => {
    const runs = await fetchRuns(token, opts, 1, opts.followAllEvents ?? false);
    const run = runs[0];
    return run ? mapRun(run) : null;
  },
});
