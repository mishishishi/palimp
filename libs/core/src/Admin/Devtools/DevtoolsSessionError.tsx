import { useMutation } from "@tanstack/react-query";
import { Alert, Button, notification, Typography } from "antd";
import { LogOut } from "lucide-react";
import { use } from "react";
import { PalimpClientBackendContext } from "../../PalimpClientBackendContext";
import { PalimpGeneralContext } from "../../PalimpGeneralContext";
import { queryClient } from "../queryClient";

interface Props {
  error: Error;
}

export const DevtoolsSessionError = ({ error }: Props) => {
  const ctx = use(PalimpGeneralContext);
  const backend = use(PalimpClientBackendContext);

  const recover = useMutation(
    {
      mutationKey: ["palimp:session:recover"],
      // `logout()` is the recovery: it is the only method on
      // PalimpClientBackendAdapter that clears the hint `hasSession()` reads —
      // the Supabase auth cookie and the Firebase localStorage flag alike — and
      // both backends clear it even when the server has already dropped the
      // session. `reset()` then re-arms the check in PalimpProvider, which now
      // sees false and drops the page back to the visitor view.
      mutationFn: () => backend.logout(),
      onSuccess: () => {
        queryClient.invalidateQueries();
        ctx.reset();
        notification.info({
          icon: <LogOut color={"#108ee9"} strokeWidth={1.2} />,
          title: "Session cleared",
          description: "Sign in again from the login page to keep editing.",
          placement: "topRight",
        });
      },
    },
    queryClient,
  );

  return (
    <>
      <Alert
        type="warning"
        showIcon
        title="Session expired"
        description="Your sign-in is no longer valid. Sign out here, then sign in again from the login page."
      />

      <Button
        block
        type="primary"
        icon={<LogOut size={16} strokeWidth={1.2} />}
        loading={recover.isPending}
        onClick={() => recover.mutate()}
      >
        Sign out
      </Button>

      {recover.error && (
        <Alert type="error" showIcon title={recover.error.message} />
      )}

      <div style={{ flex: "1 1 0" }} />

      <Typography.Text type="secondary" style={{ fontSize: "11px" }}>
        {error.message}
      </Typography.Text>
    </>
  );
};
