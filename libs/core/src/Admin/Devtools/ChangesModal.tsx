import { Button, Empty, Modal, Popconfirm, Typography } from "antd";
import { useMemo } from "react";
import { readCollectionDocument } from "../../collections.ts";
import { useCollections } from "../collectionsStore.ts";
import { editQueryKey, editsStore, usePendingEdits } from "../editsStore.ts";
import { useFieldGroups } from "../fieldsStore.ts";
import { queryClient } from "../queryClient.ts";

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Every pending draft, whichever page it was typed on. Once drafts survive
 * navigation and reloads, `Save (N)` routinely counts edits that are not on
 * the current page; this is where the editor sees them, before a Save writes
 * them. Discarding here drops a *draft* — local, no backend call.
 */
export const ChangesModal = ({ open, onClose }: Props) => {
  const pending = usePendingEdits();
  const groups = useFieldGroups();
  const collections = useCollections();

  // Labels come from what this page registered; a key typed on another page
  // has none here, and shows as itself.
  const labels = useMemo(() => {
    const byKey = new Map<string, string>();
    for (const group of groups) {
      for (const field of group.fields) {
        byKey.set(field.key, `${group.group} › ${field.label}`);
      }
    }
    return byKey;
  }, [groups]);

  const collectionLabels = useMemo(
    () =>
      new Map(
        collections.map((c) => [
          c.key,
          c.declaration.label ?? c.declaration.name,
        ]),
      ),
    [collections],
  );

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={
        pending.length === 1
          ? "1 unsaved change"
          : `${pending.length} unsaved changes`
      }
      footer={[
        <Popconfirm
          key="discard"
          title="Discard every unsaved change?"
          description="Saved content is not affected."
          okText="Discard all"
          okButtonProps={{ danger: true }}
          onConfirm={() => editsStore.clear()}
          disabled={pending.length === 0}
        >
          <Button danger disabled={pending.length === 0}>
            Discard all
          </Button>
        </Popconfirm>,
        <Button key="close" type="primary" onClick={onClose}>
          Close
        </Button>,
      ]}
    >
      {pending.length === 0 ? (
        <Empty description="Nothing waiting to be saved." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {pending.map(([key, value]) => {
            const collection = collectionLabels.get(key);
            // A collection registered on another page has no label here, but
            // its value still parses as a document.
            const isCollection =
              collection !== undefined || readCollectionDocument(value).ok;
            const previous = queryClient.getQueryData<string | null>(
              editQueryKey(key),
            );

            return (
              <div
                key={key}
                style={{ display: "flex", gap: 8, alignItems: "flex-start" }}
              >
                <div style={{ flex: "1 1 0", minWidth: 0 }}>
                  <Typography.Text strong style={{ display: "block" }}>
                    {collection
                      ? `${collection} (collection)`
                      : (labels.get(key) ?? key)}
                  </Typography.Text>
                  {(collection || labels.has(key)) && (
                    <Typography.Text
                      type="secondary"
                      style={{ display: "block", fontSize: 12 }}
                    >
                      {key}
                    </Typography.Text>
                  )}
                  <Typography.Paragraph
                    ellipsis={{ rows: 2 }}
                    style={{ marginBottom: 0 }}
                  >
                    {isCollection ? describeDocument(value) : value || "(empty)"}
                  </Typography.Paragraph>
                  {!isCollection && typeof previous === "string" && (
                    <Typography.Text
                      type="secondary"
                      delete
                      ellipsis
                      style={{ display: "block", fontSize: 12 }}
                    >
                      {previous || "(empty)"}
                    </Typography.Text>
                  )}
                </div>
                <Button size="small" onClick={() => editsStore.delete(key)}>
                  Discard
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
};

/** A collection draft is a whole JSON document; its text means nothing to
 *  an editor, its item count does. */
const describeDocument = (value: string): string => {
  const document = readCollectionDocument(value);
  if (!document.ok) return `Unreadable — ${document.reason}`;
  return document.items.length === 1
    ? "1 item"
    : `${document.items.length} items`;
};
