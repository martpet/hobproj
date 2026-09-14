import { Context } from "@shared/context.ts";
import { relativeTime } from "@shared/intl.ts";
import { Alert } from "@shared/jsx/Alert.tsx";
import {
  getSessionAbsoluteExpiresAt,
  isSessionExpiringSoon,
} from "../helpers.ts";
import { LogInButton } from "./LogInButton.tsx";

export function SessionExpiryWarning(_props: unknown, c: Context) {
  if (!c.session || !isSessionExpiringSoon(c.session)) {
    return;
  }

  const expiryDelta = getSessionAbsoluteExpiresAt(c.session) - Date.now();
  const expiresIn = relativeTime(c, expiryDelta);

  return (
    <Alert id="session-expiry-alert" type="warning">
      Your session will expire {expiresIn}.
      <LogInButton>Reauthenticate</LogInButton>
    </Alert>
  );
}
