import {
  createAuthEventRecorder,
  UnauthenticatedReason,
} from "@shared/observability/auth.ts";
import { ForbiddenReason, NotFoundReason } from "@shared/observability/core.ts";

type SessionLoginMode = "login" | "reauthentication";

type SessionEventSpec = {
  "login.start": {
    attributes: { mode?: SessionLoginMode };
  };
  "login.finish": {
    reason:
      | "missing_authentication_response"
      | "authentication_verification_failed"
      | "different_account"
      | "session_create";
    attributes: { mode?: SessionLoginMode };
  };
  "logout": {
    reason: UnauthenticatedReason;
  };
  "revoke": {
    reason: NotFoundReason | ForbiddenReason;
  };
};

export const recordSessionEvent = createAuthEventRecorder<SessionEventSpec>(
  "session",
);
