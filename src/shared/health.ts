import { DEPLOYMENT_ID } from "@shared/constants.ts";
import { Context } from "@shared/context.ts";
import { cacheNoStore } from "@shared/header/cache-control.ts";
import { respondForbidden } from "@shared/responses/forbidden.tsx";
import { Route } from "@shared/router.ts";
import { METHOD } from "@std/http/unstable-method";

const LOOPBACK_ADDRESSES = new Set(["127.0.0.1", "::1"]);

export function handleHealth(c: Context) {
  if (!LOOPBACK_ADDRESSES.has(c.ip)) {
    return respondForbidden(c);
  }
  const res = Response.json({ deploymentId: DEPLOYMENT_ID ?? null });
  cacheNoStore(res.headers);

  return res;
}

export const healthRoutes: Route[] = [
  {
    pattern: new URLPattern({ pathname: "/health" }),
    method: METHOD.Get,
    handler: handleHealth,
  },
];
