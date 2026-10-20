import { useMutation } from "@tanstack/react-query";
import { Modal } from "antd";
import type { PalimpDrawerAction } from "../../PalimpDrawerAction";
import { queryClient } from "../queryClient";
import { useDevtools } from "./DevtoolsContext";

export const useDrawerAction = (
  action: PalimpDrawerAction,
  guardUnsaved: (next: () => void) => void,
) => {
  const { user } = useDevtools();
  const [modal, contextHolder] = Modal.useModal();

  const mutation = useMutation(
    {
      mutationKey: ["palimp:action", action.id],
      mutationFn: () => action.run(user),
    },
    queryClient,
  );

  // `reset()` first, as in `usePublishButton`: a retry clears the previous
  // result or failure rather than leaving it beside a running action.
  const start = () => {
    mutation.reset();
    mutation.mutate();
  };

  const ask = () => {
    if (!action.confirm) {
      start();
      return;
    }

    const { title, content, okText } = action.confirm;
    modal.confirm({
      title,
      content,
      ...(okText ? { okText } : {}),
      // An action is typically something Publish is not allowed to do on its
      // own — rebuilding the live site — so Enter must not be the way in.
      // `focusable.autoFocusButton`, not the top-level prop antd v6 warns on.
      focusable: { autoFocusButton: "cancel" },
      // Returns nothing, so the dialog closes at once and the button shows
      // "Running..." while the action does.
      onOk: start,
    });
  };

  // The unsaved-changes guard first, so the action's own "are you sure" is
  // the last thing asked, after the drafts are dealt with.
  const onClick = () =>
    action.publishesSavedContent ? guardUnsaved(ask) : ask();

  const hasToken = !action.needsPublishToken || !!user.publishToken;

  return {
    props: {
      disabled: !hasToken || mutation.isPending,
      onClick,
    },
    hasToken,
    isPending: mutation.isPending,
    isSuccess: mutation.isSuccess,
    result: mutation.data ?? undefined,
    error: mutation.error,
    // Rendered beside the button, so the confirm inherits the host's antd
    // theme — the reason for the hook form over static Modal.confirm.
    contextHolder,
  };
};
