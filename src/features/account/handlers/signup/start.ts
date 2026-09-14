import { createRegOptions } from "@features/passkeys/ceremony/reg-options.ts";
import { users } from "@features/users/collection.ts";
import {
  USERNAME_PATTERN_DESCRIPTION,
  USERNAME_PATTERN_REGEX,
} from "@features/users/constants.ts";
import { Context } from "@shared/context.ts";
import { respondBadRequest } from "@shared/responses/bad-request.ts";
import { respondForbidden } from "@shared/responses/forbidden.tsx";
import { respondUsernameTaken } from "../../responses/username-taken.ts";
import { recordAccountEvent } from "../../telemetry.ts";

export async function handleSignupStart(c: Context) {
  if (c.user) {
    recordAccountEvent("signup.start", "failure", {
      reason: "authenticated",
    });
    return respondForbidden(c);
  }

  const { username } = await c.req.json();

  if (!username) {
    recordAccountEvent("signup.start", "failure", {
      reason: "missing_username",
    });
    return respondBadRequest({ detail: "A username is required" });
  }

  if (!USERNAME_PATTERN_REGEX.test(username)) {
    recordAccountEvent("signup.start", "failure", {
      reason: "invalid_username",
    });
    return respondBadRequest({ detail: USERNAME_PATTERN_DESCRIPTION });
  }

  // Early rejection for UX only; the authoritative uniqueness check is the
  // atomic commit in `handleSignupFinish`.
  const existingUser = await users.getByUsername(username);

  if (existingUser) {
    recordAccountEvent("signup.start", "failure", {
      reason: "username_taken",
    });
    return respondUsernameTaken(username);
  }

  const headers = new Headers();
  const regOptions = await createRegOptions(headers, { username });

  recordAccountEvent("signup.start", "success");

  return Response.json(regOptions, { headers });
}
