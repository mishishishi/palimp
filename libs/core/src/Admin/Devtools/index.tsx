import { Button, Drawer, FloatButton, notification, Popconfirm, Space } from "antd";
import { Eye, PencilRuler } from "lucide-react";
import { use, useEffect, useRef, useState } from "react";
import { PalimpGeneralContext } from "../../PalimpGeneralContext";
import { ChangesModal } from "./ChangesModal";
import { DevtoolsContent } from "./DevtoolsContent";
import { DevtoolsProvider } from "./DevtoolsContext";
import { editsStore, usePendingEdits } from "../editsStore";
import { startDraftsPersistence } from "../draftsPersistence";

/** Set once the restore notice has shown in this tab, so a reload — or any
 *  other document load — does not repeat it. */
const NOTICED_KEY = "palimp:drafts-noticed";

export const Devtools = () => {
  const [expanded, setExpanded] = useState(false);
  const { preview } = use(PalimpGeneralContext);

  const pending = usePendingEdits();
  const [changesOpen, setChangesOpen] = useState(false);
  const [notices, noticesHolder] = notification.useNotification();

  // Admin-only and client-only by being here, so neither SSR nor the visitor
  // bundle ever reaches storage.
  useEffect(function persistDrafts() {
    const persistence = startDraftsPersistence();
    const { restored } = persistence;

    let noticed = true;
    try {
      noticed = sessionStorage.getItem(NOTICED_KEY) !== null;
      if (restored > 0) sessionStorage.setItem(NOTICED_KEY, "1");
    } catch {}

    // A restored draft can be older than the stored value it shadows; the
    // notice is how the editor learns it exists before a Save writes it.
    if (restored > 0 && !noticed) {
      const key = "palimp:restored";
      notices.info({
        key,
        title:
          restored === 1
            ? "Restored 1 unsaved change"
            : `Restored ${restored} unsaved changes`,
        description: "Typed earlier and not saved yet.",
        placement: "bottomLeft",
        duration: 0,
        actions: (
          <Space>
            <Popconfirm
              title="Discard every unsaved change?"
              description="Saved content is not affected."
              okText="Discard"
              okButtonProps={{ danger: true }}
              onConfirm={() => {
                editsStore.clear();
                notices.destroy(key);
              }}
            >
              <Button size="small">Discard</Button>
            </Popconfirm>
            <Button
              size="small"
              type="primary"
              onClick={() => {
                setChangesOpen(true);
                notices.destroy(key);
              }}
            >
              Review
            </Button>
          </Space>
        ),
      });
    }

    return persistence.stop;
  }, []);

  // "Inside" is the drawer's *React* subtree, not its DOM subtree. antd
  // portals every modal to <body>, so a DOM `contains` test read the OK button
  // of a confirm as a click outside and closed the drawer on every answer.
  // React events bubble through portals to their React parent, so the capture
  // handler below sees those clicks too — confirms, selects, image pickers —
  // without naming an antd class. It runs from React's root listener, which is
  // below `window`, so the flag is set before the listener here reads it.
  const insideRef = useRef(false);

  // The flag is cleared on the way down rather than after the read, so a click
  // whose propagation a handler stops before `window` cannot leave it set and
  // swallow the next genuine outside click.
  useEffect(function closeOnClickOutside() {
    const arm = () => {
      insideRef.current = false;
    };
    const h = () => {
      if (!insideRef.current) setExpanded(false);
    };

    window.addEventListener("click", arm, { capture: true });
    window.addEventListener("click", h);

    return () => {
      window.removeEventListener("click", arm, { capture: true });
      window.removeEventListener("click", h);
    };
  }, []);

  return (
    <div
      style={{
        width: "192px",
        position: "fixed",
        top: 0,
        left: 0,
        height: "100vh",
        display: "flex",
        pointerEvents: "none",
        alignItems: "center",
      }}
    >
      <div
        style={{
          width: "100%",
          position: "relative",
        }}
        onClickCapture={() => {
          insideRef.current = true;
        }}
      >
        <FloatButton.Group
          placement="right"
          shape="square"
          style={{
            position: "fixed",
            top: "50%",
            left: "8px",
          }}
        >
          <FloatButton
            onClick={() => setExpanded((s) => !s)}
            shape="square"
            badge={
              pending.length
                ? { count: pending.length, color: "blue" }
                : undefined!
            }
            // Preview outlives a reload since 1.11.0, so a page with no
            // editors on it has to say why while the drawer is closed.
            icon={
              preview ? (
                <Eye strokeWidth={1.2} size={20} />
              ) : (
                <PencilRuler strokeWidth={1.2} size={20} />
              )
            }
            {...(preview ? { tooltip: "Preview mode" } : {})}
            style={{ pointerEvents: "all" }}
          />
        </FloatButton.Group>

        <Drawer
          open={expanded}
          mask={false}
          placement="left"
          size={192}
          onClose={() => setExpanded(false)}
          getContainer={false}
          style={{ pointerEvents: "all" }}
          title="Palimp"
          closable={{ placement: "end" }}
          // Sized by its content, centred by the fixed column above, and
          // scrolling only past the viewport. Until 1.11.0 the box was a fixed
          // 40vh the drawer filled absolutely, so it scrolled as soon as a
          // drawer action or an error line pushed past it. `relative` on root
          // and wrapper puts the drawer back in flow; antd's slide is a
          // `transform`, which flow doesn't affect.
          styles={{
            root: { position: "relative" },
            header: {
              padding: "8px 8px 8px 12px",
              borderBottomStyle: "dashed",
            },
            wrapper: {
              borderRadius: "var(--ant-border-radius-lg)",
              position: "relative",
            },
            section: {
              borderRadius: "var(--ant-border-radius-lg)",
              maxHeight: "calc(100vh - 32px)",
            },
            // Grid, not a flex column: a flex item shrinks below its content
            // when the body runs out of room, squashing every button rather
            // than scrolling. `minmax(0, 1fr)` keeps the scrollbar from
            // pushing the column wider than the drawer.
            body: {
              padding: "8px",
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr)",
              alignContent: "start",
              gap: "8px",
            },
          }}
        >
          <DevtoolsProvider>
            <DevtoolsContent onReviewChanges={() => setChangesOpen(true)} />
          </DevtoolsProvider>
        </Drawer>

        {/* Outside the drawer so Review can open it from the notice with the
            drawer closed; inside the wrapper so its clicks count as inside. */}
        <ChangesModal
          open={changesOpen}
          onClose={() => setChangesOpen(false)}
        />
        {noticesHolder}
      </div>
    </div>
  );
};
