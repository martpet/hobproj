import { metrics, Span, SpanStatusCode, trace } from "@opentelemetry/api";
import { DEPLOYMENT_ID, ENV_NAME } from "@shared/constants.ts";

export function setSpanFailureReason(span: Span, reason: string): void {
  span.setAttribute("hobproj.failure.reason", reason);
}

const SERVICE_NAME = "hobproj";
export const SERVICE_VERSION = DEPLOYMENT_ID ?? "dev";

const tracer = trace.getTracer(SERVICE_NAME, SERVICE_VERSION);
export const meter = metrics.getMeter(SERVICE_NAME, SERVICE_VERSION);

export type MetricAttributeValue = string | number | boolean;
export type MetricAttributes = Record<string, MetricAttributeValue>;

export type NotFoundReason = "not_found";
export type ForbiddenReason = "forbidden";

export const commonAttributes = {
  "deployment.environment.name": ENV_NAME,
  // Older OTel semantic convention; some backends (e.g. Grafana Cloud) still
  // key dashboards/alerts/connection checks off this instead of the `.name`
  // suffixed attribute above.
  "deployment.environment": ENV_NAME,
  "service.version": SERVICE_VERSION,
} satisfies MetricAttributes;

export function currentSpan(): Span | undefined {
  return trace.getActiveSpan();
}

export function recordException(error: unknown): void {
  const span = currentSpan();
  if (!span) return;

  if (error instanceof Error) {
    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
  } else {
    span.setStatus({ code: SpanStatusCode.ERROR });
  }
}

export function withSpan<T>(
  name: string,
  attributes: MetricAttributes,
  fn: (span: Span) => T | Promise<T>,
): T | Promise<T> {
  return tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      return await fn(span);
    } catch (error) {
      if (error instanceof Error) {
        span.recordException(error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      } else {
        span.setStatus({ code: SpanStatusCode.ERROR });
      }
      throw error;
    } finally {
      span.end();
    }
  }) as T | Promise<T>;
}
