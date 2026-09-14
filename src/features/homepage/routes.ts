import { Route } from "@shared/router.ts";
import { handleHomepage } from "./handlers/home.tsx";

export const homepageRoutes: Route[] = [
  {
    pattern: new URLPattern({ pathname: "/" }),
    method: "GET",
    handler: handleHomepage,
  },
];
