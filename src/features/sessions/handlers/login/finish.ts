import { setFlash } from "@features/flash/helpers.ts";
import { verifiyAuthResponseJson } from "@features/passkeys/ceremony/auth-verify.ts";
import { getAllAcceptedCredentialsSignal } from "@features/passkeys/signals.ts";
import { recordSessionEvent } from "../../telemetry.ts";
import { Context, isAuthenticatedContext } from "@shared/context.ts";
import { respondBadRequest } from "@shared/responses/bad-request.ts";
import { respondForbidden } from "@shared/responses/forbidden.tsx";
import { createSession, destroySession } from "../../helpers.ts";

// Must match STEP_UP_REAUTH_HEADER in passkeys/assets/passkeys.js — client
// assets can't import server modules, so the name is duplicated rather than
// shared.
const STEP_UP_REAUTH_HEADER = "X-Step-Up-Reauth";

export async function handleLogInFinish(c: Context) {
  const authResponseJson = await c.req.json();

  if (!authResponseJson) {
    recordSessionEvent("login.finish", "failure", {
      reason: "missing_authentication_response",
    });
    return respondBadRequest({
      detail: "The authentication response is missing or invalid",
    });
  }

  const headers = new Headers();

  const verification = await verifiyAuthResponseJson(
    c,
    headers,
    authResponseJson,
  );

  if (!verification.ok) {
    const { detail, signal } = verification;
    recordSessionEvent("login.finish", "failure", {
      reason: "authentication_verification_failed",
    });
    return respondForbidden(c, {
      detail,
      extensions: { signal },
      headers,
    });
  }

  const { passkey } = verification;

  // Same endpoint serves login and reauth; the only difference is whether a
  // session already exists. Reauth swaps the old session for a new one, which
  // is what resets the absolute timeout and the sensitive-action auth age.
  const isReauthenticating = isAuthenticatedContext(c);

  if (isReauthenticating && c.session.userId !== passkey.userId) {
    recordSessionEvent("login.finish", "failure", {
      reason: "different_account",
      mode: "reauthentication",
    });
    return respondForbidden(c, {
      detail: "That passkey belongs to a different account.",
      headers,
    });
  }

  // Fails if the user account was deleted or modified concurrently in KV
  // before the atomic session creation committed.
  if (!await createSession(c, headers, passkey.userId, passkey.id)) {
    recordSessionEvent("login.finish", "failure", {
      reason: "session_create",
    });
    return respondForbidden(c, { headers });
  }

  // Create before destroy, so a failure above leaves the user logged in with
  // the old session rather than with none.
  if (isReauthenticating) {
    await destroySession(c.session);

    // The header marks a reauth the user didn't explicitly ask for — the
    // step-up hop `withReauth` does mid-flow for another action (e.g.
    // deleting a passkey) — as opposed to the "Reauthenticate" button.
    // Flashing here would ride that action's own reload and could outlive
    // it: if the action then fails or is cancelled, nothing overwrites the
    // flash and the user sees a stray "Successfully reauthenticated" later,
    // on an unrelated page.
    if (!c.req.headers.has(STEP_UP_REAUTH_HEADER)) {
      setFlash(headers, "REAUTHENTICATED");
    }
  }

  const signal = await getAllAcceptedCredentialsSignal(passkey);
  recordSessionEvent("login.finish", "success", {
    mode: isReauthenticating ? "reauthentication" : "login",
  });

  return Response.json({ signal }, { headers });
}
