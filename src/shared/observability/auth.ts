import {
  commonAttributes,
  currentSpan,
  meter,
  MetricAttributes,
  setSpanFailureReason as setSpanFailureReasonCore,
} from "@shared/observability/core.ts";
import type { Simplify } from "type-fest";

type AuthEventOutcome = "success" | "failure";

type AuthEventOptions = {
  recordMetric?: boolean;
  emitSpanFailure?: boolean;
};

export type UnauthenticatedReason = "unauthenticated";
export type ReauthRequiredReason = "reauth_required";

const authEventCounter = meter.createCounter("hobproj.auth.events", {
  description: "Authentication, session, and passkey events.",
});

function recordAuthEvent(
  event: string,
  outcome: AuthEventOutcome,
  extra: MetricAttributes = {},
  options: AuthEventOptions = {},
): void {
  const { recordMetric = true, emitSpanFailure = true } = options;

  if (recordMetric) {
    authEventCounter.add(1, {
      ...commonAttributes,
      event,
      outcome,
      ...extra,
    });
  }

  if (outcome !== "failure" || !emitSpanFailure) return;

  const span = currentSpan();
  if (!span) return;

  span.addEvent(`${event}.failure`, extra);
  if (typeof extra.reason === "string") {
    setSpanFailureReasonCore(span, extra.reason);
  }
}

type AuthEventSpec = Record<string, {
  reason?: string;
  attributes?: Record<string, unknown>;
}>;

type AuthEventName<Spec extends AuthEventSpec> = keyof Spec & string;

type AuthEventAttributes<
  Spec extends AuthEventSpec,
  EventName extends AuthEventName<Spec>,
> = Spec[EventName] extends { attributes: infer Attributes } ? Attributes
  : unknown;

type AuthEventReason<
  Spec extends AuthEventSpec,
  EventName extends AuthEventName<Spec>,
  Outcome extends AuthEventOutcome,
> = Outcome extends "failure" ? {
    reason: Spec[EventName] extends { reason: infer Reason } ? Reason : never;
  }
  : { reason?: never };

type AuthEventExtra<
  Spec extends AuthEventSpec,
  EventName extends AuthEventName<Spec>,
  Outcome extends AuthEventOutcome,
> = Simplify<
  & MetricAttributes
  & AuthEventAttributes<Spec, EventName>
  & AuthEventReason<Spec, EventName, Outcome>
>;

type RecordAuthEvent<Spec extends AuthEventSpec> = {
  <EventName extends AuthEventName<Spec>>(
    event: EventName,
    outcome: "success",
    extra?: AuthEventExtra<Spec, EventName, "success">,
    options?: AuthEventOptions,
  ): void;
  <EventName extends AuthEventName<Spec>>(
    event: EventName,
    outcome: "failure",
    extra: AuthEventExtra<Spec, EventName, "failure">,
    options?: AuthEventOptions,
  ): void;
};

export function createAuthEventRecorder<Spec extends AuthEventSpec>(
  namespace: string,
): RecordAuthEvent<Spec> {
  const recordEvent: RecordAuthEvent<Spec> = (
    event: AuthEventName<Spec>,
    outcome: AuthEventOutcome,
    extra?: MetricAttributes,
    options: AuthEventOptions = {},
  ) => {
    recordAuthEvent(`${namespace}.${event}`, outcome, extra, options);
  };

  return recordEvent;
}
