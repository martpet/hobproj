import { verifyRegResponseJson } from "@features/passkeys/ceremony/reg-verify.ts";
import { passkeys } from "@features/passkeys/collection.ts";
import { getDefaultPasskeyName } from "@features/passkeys/helpers.ts";
import {
  setNewSessionCookie,
  stageSession,
} from "@features/sessions/helpers.ts";
import { users } from "@features/users/collection.ts";
import { Context } from "@shared/context.ts";
import { kv } from "@shared/kv/kv.ts";
import { respondBadRequest } from "@shared/responses/bad-request.ts";
import { respondForbidden } from "@shared/responses/forbidden.tsx";
import { respondUsernameTaken } from "../../responses/username-taken.ts";
import { recordAccountEvent } from "../../telemetry.ts";

export async function handleSignupFinish(c: Context) {
  const regResponseJson = await c.req.json();

  if (!regResponseJson) {
    recordAccountEvent("signup.finish", "failure", {
      reason: "missing_registration_response",
    });
    return respondBadRequest({
      detail: "The registration response is missing or invalid",
    });
  }

  const headers = new Headers();

  const verification = await verifyRegResponseJson(c, headers, regResponseJson);

  if (!verification.ok) {
    recordAccountEvent("signup.finish", "failure", {
      reason: "registration_verification_failed",
    });
    return respondForbidden(c, { headers });
  }

  const { username, passkey } = verification;
  const atomic = kv.atomic();

  // `versionstamp: null` asserts the key does not exist, making the username
  // unique even if two signups for it finish at the same moment; the loser
  // gets 409. `handleSignupStart` already checked, but that was a race.
  atomic.check({
    key: users.keyByUsername(username),
    versionstamp: null,
  });

  const user = users.stageSet(atomic, { username });

  // First passkey of a new user, always named after the authenticator.
  const storedPasskey = passkeys.stageSet(atomic, {
    ...passkey,
    userId: user.id,
    name: getDefaultPasskeyName(passkey),
  });

  // User, passkey and session land in one commit, so there is no window in
  // which the account exists but the signup response can't log the user in.
  const session = stageSession(c, user.id, storedPasskey.id, atomic);

  const commit = await atomic.commit();

  // The username check above is the only thing that can fail the commit.
  if (!commit.ok) {
    recordAccountEvent("signup.finish", "failure", {
      reason: "username_taken",
    });
    return respondUsernameTaken(username, { headers });
  }

  setNewSessionCookie(headers, session);
  recordAccountEvent("signup.finish", "success");

  return new Response(null, { headers });
}
