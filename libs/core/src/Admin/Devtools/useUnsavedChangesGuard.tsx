import { Button, Modal } from "antd";
import { useState } from "react";
import { editsStore, usePendingEdits } from "../editsStore";

/**
 * Publish builds the site from saved content, and a draft lives only in the
 * browser — so publishing with drafts pending silently leaves them out. The
 * guard asks first, and offers to save them on the way.
 *
 * One instance per drawer, shared by Publish and every action flagged
 * `publishesSavedContent`, so there is one dialog and one Save in flight.
 */
export const useUnsavedChangesGuard = (
  requestSave: () => Promise<boolean>,
) => {
  const pending = usePendingEdits();
  const [proceed, setProceed] = useState<(() => void) | null>(null);

  /** Runs `next` at once when nothing is pending; otherwise asks first. */
  const guard = (next: () => void) => {
    // Read the store, not the render's snapshot: the press can land in the
    // same tick as the last keystroke.
    if (editsStore.entries().length === 0) {
      next();
      return;
    }
    // A function in state has to be wrapped, or React calls it as an updater.
    setProceed(() => next);
  };

  const close = () => setProceed(null);

  const count = pending.length;
  const changes = count === 1 ? "1 unsaved change" : `${count} unsaved changes`;

  const element = (
    <Modal
      open={proceed !== null}
      onCancel={close}
      title={`${changes} won't be published`}
      footer={[
        <Button key="cancel" onClick={close}>
          Cancel
        </Button>,
        <Button
          key="without"
          onClick={() => {
            close();
            proceed?.();
          }}
        >
          Publish without them
        </Button>,
        <Button
          key="save"
          type="primary"
          autoFocus
          onClick={async () => {
            close();
            // Only on a written batch: a failed or cancelled save shows its
            // own state on the Save button and publishes nothing.
            if (await requestSave()) proceed?.();
          }}
        >
          Save and publish
        </Button>,
      ]}
    >
      <p style={{ marginBottom: 0 }}>
        Publish builds the site from saved content. Save them first to include
        them.
      </p>
    </Modal>
  );

  return {
    guard,
    element,
    /** For a `title` on the guarded buttons, so the warning is there before
     *  the press as well as after it. */
    hint: count > 0 ? `${changes} won't be included` : undefined,
  };
};
