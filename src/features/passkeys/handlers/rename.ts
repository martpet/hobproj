import { setFlash } from "@features/flash/helpers.ts";
import { Context, isAuthenticatedContext } from "@shared/context.ts";
import { kv } from "@shared/kv/kv.ts";
import { respondBadRequest } from "@shared/responses/bad-request.ts";
import { respondNotFound } from "@shared/responses/not-found.tsx";
import { redirectBack } from "@shared/responses/redirect-back.ts";
import { respondUnauthorized } from "@shared/responses/unauthorized.tsx";
import { passkeys } from "../collection.ts";
import { PASSKEY_NAME_MAX_LENGTH } from "../constants.ts";
import { getDefaultPasskeyName } from "../helpers.ts";
import { recordPasskeyEvent } from "../telemetry.ts";

export async function handlePasskeyRename(c: Context) {
  if (!isAuthenticatedContext(c)) {
    recordPasskeyEvent("rename", "failure", { reason: "unauthenticated" });
    return respondUnauthorized(c);
  }

  const passkey = await passkeys.getById(c.params.passkeyId!);

  if (!passkey) {
    recordPasskeyEvent("rename", "failure", { reason: "not_found" });
    return respondNotFound(c);
  }

  // Return 404 instead of 403 so we don't leak whether passkey IDs exist.
  if (passkey.userId !== c.user.id) {
    recordPasskeyEvent("rename", "failure", { reason: "forbidden" });
    return respondNotFound(c);
  }

  const name = (await c.req.formData()).get("name");
  const trimmed = typeof name === "string" ? name.trim() : null;

  if (trimmed === null || trimmed.length > PASSKEY_NAME_MAX_LENGTH) {
    recordPasskeyEvent("rename", "failure", { reason: "invalid_name" });
    return respondBadRequest({
      detail:
        `A name of up to ${PASSKEY_NAME_MAX_LENGTH} characters is required`,
    });
  }

  // A blank name reverts the passkey to its default authenticator-derived
  // name.
  const usedName = trimmed || getDefaultPasskeyName(passkey);

  if (usedName !== passkey.name) {
    const atomic = kv.atomic();
    await passkeys.stageSet(atomic, { ...passkey, name: usedName });
    await atomic.commit();
  }

  const res = redirectBack(c);
  setFlash(res.headers, "PASSKEY_RENAMED");
  recordPasskeyEvent("rename", "success", {
    changed: usedName !== passkey.name,
  });

  return res;
}
