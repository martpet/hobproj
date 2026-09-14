import { setFlash } from "@features/flash/helpers.ts";
import { sessions } from "@features/sessions/collection.ts";
import { isReauthRequiredForSensitiveAction } from "@features/sessions/helpers.ts";
import { respondReauthRequired } from "@features/sessions/responses/reauth-required.ts";
import { Context, isAuthenticatedContext } from "@shared/context.ts";
import { requestAcceptsHtml } from "@shared/header/negotiation.ts";
import { kv } from "@shared/kv/kv.ts";
import { respondConflict } from "@shared/responses/conflict.ts";
import { respondNotFound } from "@shared/responses/not-found.tsx";
import { redirectBack } from "@shared/responses/redirect-back.ts";
import { respondUnauthorized } from "@shared/responses/unauthorized.tsx";
import { passkeys } from "../collection.ts";
import { getUnknownCredentialSignal } from "../signals.ts";
import { recordPasskeyEvent } from "../telemetry.ts";

export async function handlePasskeyDelete(c: Context) {
  if (!isAuthenticatedContext(c)) {
    recordPasskeyEvent("delete", "failure", {
      reason: "unauthenticated",
    });
    return respondUnauthorized(c);
  }

  // Deleting a passkey destroys a credential, so require a recent passkey
  // ceremony. A native (no-JS) post past the auth-age limit gets the 403
  // page; the fetch-driven form handles REAUTH_REQUIRED transparently.
  if (isReauthRequiredForSensitiveAction(c.session)) {
    recordPasskeyEvent("delete", "failure", {
      reason: "reauth_required",
    });
    return respondReauthRequired(c);
  }

  const passkey = await passkeys.getById(c.params.passkeyId!);

  if (!passkey) {
    recordPasskeyEvent("delete", "failure", { reason: "not_found" });
    return respondNotFound(c);
  }

  // Return 404 instead of 403 so we don't leak whether passkey IDs exist.
  if (passkey.userId !== c.user.id) {
    recordPasskeyEvent("delete", "failure", { reason: "forbidden" });
    return respondNotFound(c);
  }

  // The last passkey is the only way into the account, so deleting it would
  // lock the user out; deleting the account is the way to do that.
  if ((await passkeys.listByUserId(c.user.id)).length <= 1) {
    recordPasskeyEvent("delete", "failure", { reason: "last_passkey" });
    if (requestAcceptsHtml(c)) {
      const res = redirectBack(c);
      setFlash(res.headers, "PASSKEY_LAST_ONE");
      return res;
    }

    return respondConflict({
      detail: "You can't delete your last passkey — delete the account instead",
    });
  }

  const atomic = kv.atomic();

  passkeys.stageDelete(atomic, passkey);

  // A session's legitimacy is derived from the passkey that minted it, so a
  // revoked credential shouldn't keep granting access. The current session
  // is spared even if it came from this passkey, so routine cleanup doesn't
  // log the user out mid-flow.
  const userSessions = await sessions.listByUserId(c.user.id);
  for (const session of userSessions) {
    if (session.passkeyId === passkey.id && session.id !== c.session.id) {
      sessions.stageDelete(atomic, session);
    }
  }

  await atomic.commit();
  recordPasskeyEvent("delete", "success", {
    "session.revoked_count": userSessions.filter((session) =>
      session.passkeyId === passkey.id && session.id !== c.session.id
    ).length,
  });

  // No tombstone: it is keyed by the account's WebAuthn user handle and
  // exists only for account deletion; a stale login with this key gets
  // "passkey no longer valid" instead, which is the truth here.
  if (requestAcceptsHtml(c)) {
    const res = redirectBack(c);
    setFlash(res.headers, "PASSKEY_DELETED");
    return res;
  }

  // The fetch-driven form sends the signal (so the credential manager drops
  // the passkey right away) and reloads, which is when the flash shows.
  const headers = new Headers();
  setFlash(headers, "PASSKEY_DELETED");

  return Response.json(
    { signal: getUnknownCredentialSignal(passkey.credId) },
    { headers },
  );
}
