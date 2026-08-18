import { Button, Divider, Space } from "antd";
import { useState } from "react";
import { PublishStatusIcon } from "./PublishStatusIcon";
import { PublishStatusModal } from "./PublishStatusModal";
import { usePreviewButton } from "./usePreviewButton";
import { usePublishButton } from "./usePublishButton";
import { usePublishRun } from "./usePublishRun";
import { useSaveButton } from "./useSaveButton";
import { useDevtools } from "./DevtoolsContext";
import { LogOut } from "lucide-react";

export const DevtoolsContent = () => {
  const { user, logout } = useDevtools();

  const save = useSaveButton();
  const preview = usePreviewButton();
  const publish = usePublishButton();
  const { data: run } = usePublishRun();
  const [modalOpen, setModalOpen] = useState(false);

  const publishLabel = !publish.available
    ? "No publish provider"
    : !publish.hasToken
      ? "Missing publish token"
      : publish.isPending
        ? "Dispatching..."
        : publish.isRunning
          ? "Publishing..."
          : "Publish";

  return (
    <>
      <Button {...save.props} block type="primary">
        {save.isPending ? "Saving..." : `Save (${save.length})`}
      </Button>

      <Button {...preview.props} block>
        {preview.preview ? "Edit mode" : "Preview mode"}
      </Button>

      <div style={{ flex: "1 1 0" }} />

      <Space.Compact block>
        <Button
          {...publish.props}
          disabled={
            publish.props.disabled || !publish.available || !publish.hasToken
          }
          style={{ flex: 1 }}
        >
          {publishLabel}
        </Button>
        <Button
          icon={<PublishStatusIcon run={run} isPending={publish.isPending} />}
          onClick={() => setModalOpen(true)}
          disabled={!run && !publish.isPending}
        />
      </Space.Compact>

      <PublishStatusModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      />

      <Divider
        dashed
        titlePlacement="start"
        size="small"
        style={{ marginBottom: 0 }}
      />

      <Space.Compact>
        <div style={{ flex: "1 1 0" }}>
          {user.name ? (
            <>
              <div>{user.name}</div>
              <div style={{ fontSize: "12px" }}>{user.email}</div>
            </>
          ) : (
            user.email
          )}
        </div>
        <Button
          icon={<LogOut size={16} strokeWidth={1.2} />}
          onClick={() => logout()}
        />
      </Space.Compact>
    </>
  );
};
