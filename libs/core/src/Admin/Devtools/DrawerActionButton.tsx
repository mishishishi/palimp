import { Button, Typography } from "antd";
import type { PalimpDrawerAction } from "../../PalimpDrawerAction";
import { dispatchCause } from "./PublishStatusModal";
import { useDrawerAction } from "./useDrawerAction";

interface Props {
  action: PalimpDrawerAction;
}

export const DrawerActionButton = ({ action }: Props) => {
  const state = useDrawerAction(action);

  // Publish's vocabulary, in Publish's order: the "cannot work" case first,
  // then the press in flight, then a failure — which leaves the button
  // enabled, so it doubles as the retry.
  const label = !state.hasToken
    ? "Missing publish token"
    : state.isPending
      ? "Running..."
      : state.error
        ? `${action.label} failed`
        : action.label;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <Button {...state.props} block>
        {label}
      </Button>

      {state.contextHolder}

      {/* Persistent, not a toast: still true when the editor comes back to
          the drawer, and cleared only by the next press. */}
      {state.error ? (
        <>
          <Typography.Text type="danger" style={{ fontSize: 12 }}>
            {state.error.message}
          </Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {dispatchCause(state.error, action.label)}
          </Typography.Text>
        </>
      ) : state.isSuccess ? (
        state.result?.href ? (
          <Typography.Link
            href={state.result.href}
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: 12 }}
          >
            {state.result.message}
          </Typography.Link>
        ) : (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {state.result?.message ?? "Done"}
          </Typography.Text>
        )
      ) : null}
    </div>
  );
};
