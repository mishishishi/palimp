import { Button, Empty, Modal, Typography } from "antd";
import { EditComponent } from "../EditComponent.tsx";
import { useFieldGroups } from "../fieldsStore.ts";

interface Props {
  open: boolean;
  onClose: () => void;
}

export const FieldsModal = ({ open, onClose }: Props) => {
  const groups = useFieldGroups();

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title="Fields"
      footer={
        <Button onClick={onClose} type="primary">
          Close
        </Button>
      }
    >
      {groups.length === 0 ? (
        <Empty description="No fields are declared on this page." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {groups.map((group) => (
            <div key={group.group}>
              <Typography.Title level={5} style={{ marginTop: 0 }}>
                {group.group}
              </Typography.Title>

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {group.fields.map((field) => (
                  <label
                    key={field.key}
                    style={{ display: "flex", flexDirection: "column", gap: 4 }}
                  >
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {field.label}
                    </Typography.Text>

                    {/*
                      The same EditComponent the page uses, and `textarea` for
                      the same reason p() passes it: a field edited here should
                      behave and resolve identically to one edited inline, since
                      a key can legitimately appear in both places. staleValue
                      falls back the way p() does — the fetched row wins anyway.
                    */}
                    <EditComponent
                      messageKey={field.key}
                      staleValue={field.defaultMessage ?? field.key}
                      textarea
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
};
