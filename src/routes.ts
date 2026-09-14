import { accountRoutes } from "@features/account/routes.ts";
import { homepageRoutes } from "@features/homepage/routes.ts";
import { passkeyRoutes } from "@features/passkeys/routes.ts";
import { sessionRoutes } from "@features/sessions/routes.ts";
import { assetRoute } from "@shared/asset/handler.ts";
import { healthRoutes } from "@shared/health.ts";
import { Route } from "@shared/router.ts";

export const routes: Route[] = [
  // Site-wide assets in `src/assets/`; features serve their own.
  assetRoute(import.meta),
  ...homepageRoutes,
  ...accountRoutes,
  ...sessionRoutes,
  ...passkeyRoutes,
  ...healthRoutes,
];
