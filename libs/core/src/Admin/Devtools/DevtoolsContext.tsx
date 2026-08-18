import { useQuery } from "@tanstack/react-query";
import { notification } from "antd";
import { LogOut } from "lucide-react";
import { createContext, use, useMemo, type ReactNode } from "react";
import { PalimpClientBackendContext } from "../../PalimpClientBackendContext";
import { PalimpGeneralContext } from "../../PalimpGeneralContext";
import type { User } from "../../types";
import { queryClient } from "../queryClient";
import { Spinner } from "../Spinner";
import { DevtoolsSessionError } from "./DevtoolsSessionError";

interface IDevtoolsContext {
  user: User;
  logout: () => Promise<void>;
}

export const DevtoolsContext = createContext<IDevtoolsContext>(null!);

export const useDevtools = () => use(DevtoolsContext);

export const DevtoolsProvider = (props: { children: ReactNode }) => {
  const ctx = use(PalimpGeneralContext);
  const backend = use(PalimpClientBackendContext);

  const user = useQuery(
    {
      queryKey: ["palimp:getUser()"],
      queryFn: () => backend.getUser(),
    },
    queryClient,
  );

  const value = useMemo(
    () =>
      user.data && {
        user: user.data,
        logout: async () => {
          await backend.logout();
          queryClient.invalidateQueries();
          ctx.reset();
          notification.info({
            icon: <LogOut color={"#108ee9"} strokeWidth={1.2} />,
            title: "Signed out successfully",
            placement: "topRight",
          });
        },
      },
    [user.data],
  );

  if (value) {
    return <DevtoolsContext value={value}>{props.children}</DevtoolsContext>;
  }

  // `hasSession()` only sniffs a cookie or a localStorage flag, so it can put an
  // admin here with a session the server has already dropped. Rendering the
  // spinner and logging to the console left a non-technical client with no way
  // out; the error state has one.
  if (user.error) {
    return <DevtoolsSessionError error={user.error} />;
  }

  return <Spinner />;
};
