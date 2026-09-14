import { ENV_NAME } from "@shared/constants.ts";
import { Context } from "@shared/context.ts";
import {
  commonAttributes,
  currentSpan,
  meter,
  SERVICE_VERSION,
} from "@shared/observability/core.ts";

const httpServerRequests = meter.createCounter(
  "hobproj.http.server.requests",
  { description: "Application HTTP responses by route, method, and status." },
);

const httpServerRequestDuration = meter.createHistogram(
  "hobproj.http.server.request.duration",
  {
    description:
      "Application HTTP request duration by route, method, and status.",
    unit: "s",
  },
);

export function enrichHttpSpan(c: Context, routeLabel: string): void {
  const span = currentSpan();
  if (!span) return;

  span.setAttribute("http.route", routeLabel);
  span.setAttribute("deployment.environment.name", ENV_NAME);
  span.setAttribute("deployment.environment", ENV_NAME);
  span.setAttribute("service.version", SERVICE_VERSION);
  span.updateName(`${c.method} ${routeLabel}`);
}

export function recordHttpRequest(
  c: Context,
  status: number,
  durationSeconds: number,
): void {
  const attributes = {
    ...commonAttributes,
    "http.request.method": c.method,
    "http.response.status_code": status,
    "http.route": c.routeLabel ?? "unmatched",
  };

  httpServerRequests.add(1, attributes);
  httpServerRequestDuration.record(durationSeconds, attributes);
}
