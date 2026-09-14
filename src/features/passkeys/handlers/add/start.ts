import { isReauthRequiredForSensitiveAction } from "@features/sessions/helpers.ts";
import { respondReauthRequired } from "@features/sessions/responses/reauth-required.ts";
import { Context, isAuthenticatedContext } from "@shared/context.ts";
import { respondUnauthorized } from "@shared/responses/unauthorized.tsx";
import { createRegOptions } from "../../ceremony/reg-options.ts";
import { passkeys } from "../../collection.ts";
import { recordPasskeyEvent } from "../../telemetry.ts";

export async function handlePasskeyAddStart(c: Context) {
  if (!isAuthenticatedContext(c)) {
    recordPasskeyEvent("add.start", "failure", {
      reason: "unauthenticated",
    });
    return respondUnauthorized(c);
  }

  // Adding a passkey mints a credential with full account access, so require
  // a recent passkey ceremony rather than trusting the session cookie.
  if (isReauthRequiredForSensitiveAction(c.session)) {
    recordPasskeyEvent("add.start", "failure", {
      reason: "reauth_required",
    });
    return respondReauthRequired(c);
  }

  const userPasskeys = await passkeys.listByUserId(c.user.id);

  const headers = new Headers();
  const regOptions = await createRegOptions(headers, {
    username: c.user.username,
    // Same WebAuthn user handle as the account's other passkeys, so credential
    // managers keep one entry for the account. Absent only if the user
    // somehow has no passkeys (can't happen through the UI).
    webauthnUserId: userPasskeys[0]?.webauthnUserId,
    // One passkey per authenticator: one holding a listed credential refuses
    // to register another.
    excludeCredentials: userPasskeys.map((passkey) => ({
      id: passkey.credId,
      type: "public-key",
      transports: passkey.transports,
    })),
  });

  recordPasskeyEvent("add.start", "success", {
    "passkey.existing_count": userPasskeys.length,
  });

  return Response.json(regOptions, { headers });
}
