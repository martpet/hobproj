import { assetRoute } from "@shared/asset/handler.ts";
import { Route } from "@shared/router.ts";
import { handleLogInFinish } from "./handlers/login/finish.ts";
import { handleLogInStart } from "./handlers/login/start.ts";
import { handleLogOut } from "./handlers/logout.ts";

export const sessionRoutes: Route[] = [
  assetRoute(import.meta, "/session"),
  {
    pattern: new URLPattern({ pathname: "/login/start" }),
    method: "POST",
    handler: handleLogInStart,
  },
  {
    pattern: new URLPattern({ pathname: "/login/finish" }),
    method: "POST",
    handler: handleLogInFinish,
  },
  {
    pattern: new URLPattern({ pathname: "/logout" }),
    method: "POST",
    handler: handleLogOut,
  },
];
