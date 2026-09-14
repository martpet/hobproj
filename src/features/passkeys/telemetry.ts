import { Span } from "@opentelemetry/api";
import {
  createAuthEventRecorder,
  ReauthRequiredReason,
  UnauthenticatedReason,
} from "@shared/observability/auth.ts";
import {
  ForbiddenReason,
  MetricAttributeValue,
  NotFoundReason,
  withSpan,
} from "@shared/observability/core.ts";
import type { SetRequired } from "type-fest";

type WebAuthnVerifyReason =
  | "challenge_expired"
  | "library_rejected"
  | "not_verified"
  | "commit_conflict";

type WebAuthnCeremony = "registration" | "authentication";
type WebAuthnStep = "options" | "verify";
type WebAuthnCeremonyOperation = `${WebAuthnCeremony}.${WebAuthnStep}`;

type PasskeyEventSpec = SetRequired<{
  "add.start": {
    reason: UnauthenticatedReason | ReauthRequiredReason;
  };
  "add.finish": {
    reason:
      | UnauthenticatedReason
      | ReauthRequiredReason
      | "missing_registration_response"
      | "registration_verification_failed"
      | "credential_conflict";
  };
  "rename": {
    reason:
      | UnauthenticatedReason
      | ReauthRequiredReason
      | NotFoundReason
      | ForbiddenReason
      | "invalid_name";
  };
  "delete": {
    reason:
      | UnauthenticatedReason
      | ReauthRequiredReason
      | NotFoundReason
      | ForbiddenReason
      | "last_passkey";
  };
  "registration.options": {
    reason: UnauthenticatedReason | ReauthRequiredReason;
  };
  "registration.verify": {
    reason:
      | UnauthenticatedReason
      | ReauthRequiredReason
      | WebAuthnVerifyReason;
  };
  "authentication.options": {
    reason: NotFoundReason;
  };
  "authentication.verify": {
    reason:
      | WebAuthnVerifyReason
      | "account_deleted"
      | "credential_unknown";
  };
}, WebAuthnCeremonyOperation>;

export const recordPasskeyEvent = createAuthEventRecorder<PasskeyEventSpec>(
  "passkey",
);

type WebAuthnSpanAttributes = {
  "webauthn.ceremony": WebAuthnCeremony;
  [key: `webauthn.${string}`]: MetricAttributeValue;
};

export function withWebAuthnCeremonySpan<T>(
  name: `webauthn.${WebAuthnCeremonyOperation}`,
  attributes: WebAuthnSpanAttributes,
  fn: (span: Span) => T | Promise<T>,
): T | Promise<T> {
  return withSpan(name, attributes, fn);
}
