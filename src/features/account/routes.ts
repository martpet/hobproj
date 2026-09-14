import { assetRoute } from "@shared/asset/handler.ts";
import { Route } from "@shared/router.ts";
import { handleAccountDelete } from "./handlers/delete.ts";
import { handleSignupFinish } from "./handlers/signup/finish.ts";
import { handleSignUpPage } from "./handlers/signup/page.tsx";
import { handleSignupStart } from "./handlers/signup/start.ts";

export const accountRoutes: Route[] = [
  assetRoute(import.meta, "/account"),
  {
    pattern: new URLPattern({ pathname: "/account/delete" }),
    method: "POST",
    handler: handleAccountDelete,
  },
  {
    pattern: new URLPattern({ pathname: "/signup" }),
    method: "GET",
    handler: handleSignUpPage,
  },
  {
    pattern: new URLPattern({ pathname: "/signup/start" }),
    method: "POST",
    handler: handleSignupStart,
  },
  {
    pattern: new URLPattern({ pathname: "/signup/finish" }),
    method: "POST",
    handler: handleSignupFinish,
  },
];
