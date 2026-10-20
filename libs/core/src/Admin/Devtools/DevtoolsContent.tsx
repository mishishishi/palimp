import { Button, Divider, Space, Typography } from "antd";
import { use, useState, type CSSProperties } from "react";
import { PalimpDrawerActionsContext } from "../../PalimpDrawerActionsContext";
import { DrawerActionButton } from "./DrawerActionButton";
import { PublishStatusIcon } from "./PublishStatusIcon";
import { PublishStatusModal } from "./PublishStatusModal";
import { usePreviewButton } from "./usePreviewButton";
import { usePublishButton } from "./usePublishButton";
import { usePublishRun } from "./usePublishRun";
import { useSaveButton } from "./useSaveButton";
import { useUnsavedChangesGuard } from "./useUnsavedChangesGuard";
import { useDevtools } from "./DevtoolsContext";
import { Boxes, ListChecks, LogOut } from "lucide-react";
import { useFieldGroups } from "../fieldsStore";
import { FieldsModal } from "./FieldsModal";
import { useCollections } from "../collectionsStore";
import { CollectionsModal } from "./CollectionsModal";

const ellipsis: CSSProperties = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

export const DevtoolsContent = () => {
  const { user, logout } = useDevtools();

  const save = useSaveButton();
  const unsaved = useUnsavedChangesGuard(save.requestSave);
  const preview = usePreviewButton();
  const publish = usePublishButton();
  const { data: run } = usePublishRun();
  const [modalOpen, setModalOpen] = useState(false);
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const [collectionsOpen, setCollectionsOpen] = useState(false);

  const groups = useFieldGroups();
  const fieldCount = groups.reduce((n, g) => n + g.fields.length, 0);

  const collections = useCollections();

  const actions = use(PalimpDrawerActionsContext);

  // Order matters. `tokenExpired` sits with the other two "cannot work" cases
  // because the poll proves it without a press; `error` sits above `isPending`
  // because a failure is what the editor needs to read next, and `isPending`
  // goes back to false on failure exactly as it does on success — which is
  // what made the broken press indistinguishable from a working one.
  const publishLabel = !publish.available
    ? "No publish provider"
    : !publish.hasToken
      ? "Missing publish token"
      : publish.tokenExpired
        ? "Publish token expired"
        : publish.error
          ? "Publish failed"
          : publish.isPending
            ? "Dispatching..."
            : publish.isRunning
              ? "Publishing..."
              : "Publish";

  return (
    <>
      <Button {...save.props} block type="primary">
        {save.isPending
          ? "Saving..."
          : save.error
            ? "Save failed"
            : `Save (${save.length})`}
      </Button>

      {/* Persistent until the next press, like Publish's failure: the edits
          are still pending, and the editor needs to know why. */}
      {save.error ? (
        <Typography.Text type="danger" style={{ fontSize: 12 }}>
          {save.error.message}
        </Typography.Text>
      ) : null}

      {save.contextHolder}
      {unsaved.element}

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

      {/* An empty grid row: its extra gap sets Publish apart from the
          editing buttons. It used to grow into the fixed-height drawer. */}
      <div />

      <Space.Compact block>
        <Button
          {...publish.props}
          onClick={() => unsaved.guard(publish.props.onClick)}
          {...(unsaved.hint ? { title: unsaved.hint } : {})}
          disabled={
            publish.props.disabled ||
            !publish.available ||
            !publish.hasToken ||
            publish.tokenExpired
          }
          style={{ flex: 1 }}
        >
          {publishLabel}
        </Button>
        <Button
          icon={<PublishStatusIcon run={run} isPending={publish.isPending} />}
          onClick={() => setModalOpen(true)}
          disabled={!run && !publish.isPending && !publish.error}
        />
      </Space.Compact>

      <PublishStatusModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        dispatchError={publish.error}
      />

      {actions.map((action) => (
        <DrawerActionButton
          key={action.id}
          action={action}
          guardUnsaved={unsaved.guard}
          unsavedHint={unsaved.hint}
        />
      ))}

      <Divider
        dashed
        titlePlacement="start"
        size="small"
        style={{ marginBottom: 0 }}
      />

      <Space.Compact>
        {/* `minWidth: 0` lets a long address ellipsise instead of pushing
            Logout out and scrolling the drawer sideways. */}
        <div style={{ flex: "1 1 0", minWidth: 0 }} title={user.email}>
          {user.name ? (
            <>
              <div style={ellipsis}>{user.name}</div>
              <div style={{ ...ellipsis, fontSize: "12px" }}>{user.email}</div>
            </>
          ) : (
            <div style={ellipsis}>{user.email}</div>
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
