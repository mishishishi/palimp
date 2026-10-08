import { Button, Divider, Space } from "antd";
import { useState } from "react";
import { PublishStatusIcon } from "./PublishStatusIcon";
import { PublishStatusModal } from "./PublishStatusModal";
import { usePreviewButton } from "./usePreviewButton";
import { usePublishButton } from "./usePublishButton";
import { usePublishRun } from "./usePublishRun";
import { useSaveButton } from "./useSaveButton";
import { useDevtools } from "./DevtoolsContext";
import { Boxes, ListChecks, LogOut } from "lucide-react";
import { useFieldGroups } from "../fieldsStore";
import { FieldsModal } from "./FieldsModal";
import { useCollections } from "../collectionsStore";
import { CollectionsModal } from "./CollectionsModal";

export const DevtoolsContent = () => {
  const { user, logout } = useDevtools();

  const save = useSaveButton();
  const preview = usePreviewButton();
  const publish = usePublishButton();
  const { data: run } = usePublishRun();
  const [modalOpen, setModalOpen] = useState(false);
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const [collectionsOpen, setCollectionsOpen] = useState(false);

  const groups = useFieldGroups();
  const fieldCount = groups.reduce((n, g) => n + g.fields.length, 0);

  const collections = useCollections();

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

      {save.contextHolder}

      <Button {...preview.props} block>
        {preview.preview ? "Edit mode" : "Preview mode"}
      </Button>

      <Button
        block
        icon={<ListChecks size={16} strokeWidth={1.2} />}
        onClick={() => setFieldsOpen(true)}
        disabled={fieldCount === 0}
      >
        {fieldCount === 0 ? "No fields" : `Fields (${fieldCount})`}
      </Button>

      <FieldsModal open={fieldsOpen} onClose={() => setFieldsOpen(false)} />

      <Button
        block
        icon={<Boxes size={16} strokeWidth={1.2} />}
        onClick={() => setCollectionsOpen(true)}
        disabled={collections.length === 0}
      >
        {collections.length === 0
          ? "No collections"
          : `Collections (${collections.length})`}
      </Button>

      <CollectionsModal
        open={collectionsOpen}
        onClose={() => setCollectionsOpen(false)}
      />

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
