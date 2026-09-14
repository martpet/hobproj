import {
  createAuthEventRecorder,
  ReauthRequiredReason,
  UnauthenticatedReason,
} from "@shared/observability/auth.ts";

type AccountEventSpec = {
  "delete": {
    reason: UnauthenticatedReason | ReauthRequiredReason;
  };
  "signup.start": {
    reason:
      | "authenticated"
      | "missing_username"
      | "invalid_username"
      | "username_taken";
  };
  "signup.finish": {
    reason:
      | "missing_registration_response"
      | "registration_verification_failed"
      | "username_taken";
  };
};

export const recordAccountEvent = createAuthEventRecorder<AccountEventSpec>(
  "account",
);
