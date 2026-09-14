import { setFlash } from "@features/flash/helpers.ts";
import { Context, isAuthenticatedContext } from "@shared/context.ts";
import { kv } from "@shared/kv/kv.ts";
import { respondBadRequest } from "@shared/responses/bad-request.ts";
import { respondConflict } from "@shared/responses/conflict.ts";
import { respondForbidden } from "@shared/responses/forbidden.tsx";
import { respondUnauthorized } from "@shared/responses/unauthorized.tsx";
import { verifyRegResponseJson } from "../../ceremony/reg-verify.ts";
import { passkeys } from "../../collection.ts";
import { getDefaultPasskeyName } from "../../helpers.ts";
import { recordPasskeyEvent } from "../../telemetry.ts";

export async function handlePasskeyAddFinish(c: Context) {
  if (!isAuthenticatedContext(c)) {
    recordPasskeyEvent("add.finish", "failure", {
      reason: "unauthenticated",
    });
    return respondUnauthorized(c);
  }

  const regResponseJson = await c.req.json();

  if (!regResponseJson) {
    recordPasskeyEvent("add.finish", "failure", {
      reason: "missing_registration_response",
    });
    return respondBadRequest({
      detail: "The registration response is missing or invalid",
    });
  }

  const headers = new Headers();

  const verification = await verifyRegResponseJson(c, headers, regResponseJson);

  if (!verification.ok) {
    recordPasskeyEvent("add.finish", "failure", {
      reason: "registration_verification_failed",
    });
    return respondForbidden(c, { headers });
  }

  const { passkey } = verification;

  // Second line of defence for one-passkey-per-authenticator: a credential
  // that slipped past `excludeCredentials` (e.g. cloned) is rejected here.
  if (await passkeys.getByCredId(passkey.credId)) {
    recordPasskeyEvent("add.finish", "failure", {
      reason: "credential_conflict",
    });
    return respondConflict({
      detail: "This passkey is already registered",
      headers,
    });
  }

  const atomic = kv.atomic();
  const name = getDefaultPasskeyName(passkey);

  await passkeys.stageSet(atomic, { ...passkey, userId: c.user.id, name });

  await atomic.commit();

  // Shown after the client reloads (see passkeys-table.js).
  setFlash(headers, "PASSKEY_ADDED");
  recordPasskeyEvent("add.finish", "success");

  return new Response(null, { headers });
}
