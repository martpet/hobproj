import { setFlash } from "@features/flash/helpers.ts";
import { passkeys, passkeyTombstones } from "@features/passkeys/collection.ts";
import { getNoAcceptedCredentialsSignals } from "@features/passkeys/signals.ts";
import { sessions } from "@features/sessions/collection.ts";
import { deleteSessionCookie } from "@features/sessions/cookie.ts";
import { isReauthRequiredForSensitiveAction } from "@features/sessions/helpers.ts";
import { respondReauthRequired } from "@features/sessions/responses/reauth-required.ts";
import { users } from "@features/users/collection.ts";
import { Context, isAuthenticatedContext } from "@shared/context.ts";
import { requestAcceptsHtml } from "@shared/header/negotiation.ts";
import { kv } from "@shared/kv/kv.ts";
import { respondRedirect } from "@shared/responses/redirect.ts";
import { respondUnauthorized } from "@shared/responses/unauthorized.tsx";
import { recordAccountEvent } from "../telemetry.ts";

export async function handleAccountDelete(c: Context) {
  if (!isAuthenticatedContext(c)) {
    recordAccountEvent("delete", "failure", {
      reason: "unauthenticated",
    });
    return respondUnauthorized(c);
  }

  // Deleting an account is irreversible, so require a recent passkey
  // ceremony rather than trusting a possibly long-lived session cookie.
  if (isReauthRequiredForSensitiveAction(c.session)) {
    recordAccountEvent("delete", "failure", {
      reason: "reauth_required",
    });
    return respondReauthRequired(c);
  }

  const { user } = c;
  const atomic = kv.atomic();

  // Everything belonging to the user goes in one atomic op so a crash
  // midway can't leave live sessions or passkeys pointing at a missing user.
  const userSessions = await sessions.listByUserId(user.id);
  for (const session of userSessions) {
    await sessions.stageDelete(atomic, session);
  }

  const userPasskeys = await passkeys.listByUserId(user.id);
  for (const passkey of userPasskeys) {
    await passkeys.stageDelete(atomic, passkey);
    await passkeyTombstones.stageSet(atomic, {
      webauthnUserId: passkey.webauthnUserId,
    });
  }

  await users.stageDelete(atomic, user);

  await atomic.commit();

  // Native form posts get the redirect; the fetch-driven form gets the
  // signals so it can tell the credential manager to drop the passkeys.
  const res = requestAcceptsHtml(c)
    ? respondRedirect("/")
    : Response.json({ signals: getNoAcceptedCredentialsSignals(userPasskeys) });

  deleteSessionCookie(res.headers);
  setFlash(res.headers, "ACCOUNT_DELETED");
  recordAccountEvent("delete", "success", {
    "passkey.count": userPasskeys.length,
    "session.count": userSessions.length,
  });

  return res;
}
