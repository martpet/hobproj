import { recordHttpRequest } from "@shared/observability/http.ts";
import { Middleware } from "@shared/types.ts";
import { SECOND } from "@std/datetime";

export const telemetryMid: Middleware = (next) => async (c) => {
  const start = performance.now();
  const res = await next(c);
  recordHttpRequest(c, res.status, (performance.now() - start) / SECOND);
  return res;
};
