import type {
  PalimpPublishAdapter,
  PalimpPublishRun,
  PublishRunConclusion,
  PublishRunStatus,
} from "@palimp/core";

export interface GithubPublishOptions {
  owner: string;
  repo: string;
  workflow: string;
  ref?: string;
  inputs?: Record<string, string>;
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

const runsUrl = (opts: GithubPublishOptions, perPage: number) =>
  `https://api.github.com/repos/${opts.owner}/${opts.repo}/actions/workflows/${opts.workflow}/runs?event=workflow_dispatch&per_page=${perPage}`;

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
    throw new Error(`GitHub dispatch failed: ${res.status} ${res.statusText}`);
  }
  return dispatchedAt;
};

const fetchRuns = async (
  token: string,
  opts: GithubPublishOptions,
  perPage: number,
): Promise<GithubRun[]> => {
  const res = await fetch(runsUrl(opts, perPage), {
    headers: githubHeaders(token),
  });
  if (!res.ok) {
    throw new Error(`GitHub get runs failed: ${res.status} ${res.statusText}`);
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
    const runs = await fetchRuns(token, opts, 1);
    const run = runs[0];
    return run ? mapRun(run) : null;
  },
});
