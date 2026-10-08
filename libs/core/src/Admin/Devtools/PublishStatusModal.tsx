import { Button, Modal, Space, Typography } from "antd";
import { PalimpPublishAuthError } from "../../PalimpPublishAdapter";
import { queryClient } from "../queryClient";
import { PublishStatusIcon } from "./PublishStatusIcon";
import { publishRunQueryKey, usePublishRun } from "./usePublishRun";

interface Props {
  open: boolean;
  onClose: () => void;
  /** The dispatch rejection from `usePublishButton`, passed down rather than
   *  re-read: a second `useMutation` with the same `mutationKey` is a separate
   *  observer with its own state, so calling the hook again here would always
   *  see `null`. */
  dispatchError?: Error | null;
}

const relativeFormat = new Intl.RelativeTimeFormat(undefined, {
  numeric: "auto",
});

const formatRelative = (ms: number) => {
  const diffSeconds = Math.round((ms - Date.now()) / 1000);
  const abs = Math.abs(diffSeconds);
  if (abs < 60) return relativeFormat.format(diffSeconds, "second");
  if (abs < 3600)
    return relativeFormat.format(Math.round(diffSeconds / 60), "minute");
  if (abs < 86400)
    return relativeFormat.format(Math.round(diffSeconds / 3600), "hour");
  return relativeFormat.format(Math.round(diffSeconds / 86400), "day");
};

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
    <div style={{ width: 96, color: "#8c8c8c", flexShrink: 0 }}>{label}</div>
    <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
  </div>
);

/** Plain-language cause, under the status line. The dispatch and the status
 *  query must not share wording: "couldn't load run status" means the run
 *  cannot be seen, and this means there is no run. */
const dispatchCause = (error: Error) =>
  error instanceof PalimpPublishAuthError
    ? "The publish token on your account was refused. A new token is needed; your saved changes are not affected."
    : "The site was not rebuilt. Your saved changes are not affected — fixing the cause and pressing Publish again is the retry.";

export const PublishStatusModal = ({
  open,
  onClose,
  dispatchError,
}: Props) => {
  const { data: run, error, isFetching, refetch } = usePublishRun();

  const conclusionLabel =
    run?.status === "completed"
      ? (run.conclusion ?? "unknown")
      : run?.status;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={
        <Space>
          <span>Publish status</span>
          <PublishStatusIcon run={run} />
        </Space>
      }
      footer={
        <Space>
          <Button
            onClick={() =>
              queryClient.invalidateQueries({ queryKey: publishRunQueryKey })
            }
            loading={isFetching}
            disabled={isFetching}
          >
            Refresh
          </Button>
          <Button onClick={onClose} type="primary">
            Close
          </Button>
        </Space>
      }
    >
      {dispatchError ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            marginBottom: run ? 16 : 0,
          }}
        >
          <Typography.Text strong>Dispatch failed</Typography.Text>
          <Typography.Text type="danger">
            {dispatchError.message}
          </Typography.Text>
          <Typography.Text type="secondary">
            {dispatchCause(dispatchError)}
          </Typography.Text>
        </div>
      ) : null}

      {error ? (
        <div>Couldn't load run status.</div>
      ) : !run ? (
        // The rows below describe the *last* run, which on a failed dispatch is
        // an older one. Suppressed when there is none, but kept when there is —
        // "the site is still serving that build" is the point.
        dispatchError ? null : (
          <div>No publish has been dispatched yet.</div>
        )
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {dispatchError ? (
            // Without this the rows read as the dispatch that just failed, and
            // "Dispatched 2 minutes ago" beside "Dispatch failed" recreates the
            // ambiguity the whole plan is about.
            <Typography.Text type="secondary">
              Last known run — not the publish you just tried to start. The
              site is still serving this build.
            </Typography.Text>
          ) : null}
          <Row label="Dispatched">
            <span title={new Date(run.dispatchedAt).toISOString()}>
              {formatRelative(run.dispatchedAt)}
            </span>
          </Row>
          <Row label="Status">{conclusionLabel}</Row>
          <Row label="Run id">
            <Space>
              <Typography.Text code copyable={{ text: run.id }}>
                {run.id}
              </Typography.Text>
            </Space>
          </Row>
          {run.url ? (
            <Row label="Link">
              <a href={run.url} target="_blank" rel="noreferrer">
                Open in GitHub Actions
              </a>
            </Row>
          ) : null}
        </div>
      )}
    </Modal>
  );
};
