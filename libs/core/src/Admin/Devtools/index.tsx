import { Drawer, FloatButton } from "antd";
import { Eye, PencilRuler } from "lucide-react";
import { use, useEffect, useRef, useState } from "react";
import { PalimpGeneralContext } from "../../PalimpGeneralContext";
import { DevtoolsContent } from "./DevtoolsContent";
import { DevtoolsProvider } from "./DevtoolsContext";
import { usePendingEdits } from "../editsStore";

export const Devtools = () => {
  const [expanded, setExpanded] = useState(false);
  const { preview } = use(PalimpGeneralContext);

  const pending = usePendingEdits();

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
            <DevtoolsContent />
          </DevtoolsProvider>
        </Drawer>
      </div>
    </div>
  );
};
