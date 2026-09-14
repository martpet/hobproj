import {
  WEBAUTHN_RP_ID,
  WEBAUTHN_TIMEOUT,
  WEBAUTHN_USER_VERIFICATION,
} from "../constants.ts";
import { setPasskeyAuthCookie } from "../cookie.ts";
import { passkeyAuthOptions } from "../kv.ts";
import { recordPasskeyEvent, withWebAuthnCeremonySpan } from "../telemetry.ts";
import { generateAuthenticationOptions } from "@simplewebauthn/server";

// Issues a challenge with no `allowCredentials`: the authenticator picks any
// discoverable credential for this RP, which is what makes usernameless
// login possible. The challenge is stored server-side and tied to the
// browser by the `passkey_auth` cookie.
export async function createAuthOptions(headers: Headers) {
  const authOptions = await withWebAuthnCeremonySpan(
    "webauthn.authentication.options",
    { "webauthn.ceremony": "authentication" },
    () =>
      generateAuthenticationOptions({
        rpID: WEBAUTHN_RP_ID,
        userVerification: WEBAUTHN_USER_VERIFICATION,
        timeout: WEBAUTHN_TIMEOUT,
      }),
  );

  await passkeyAuthOptions.set({
    cookie: setPasskeyAuthCookie(headers),
    value: authOptions,
    expiresAt: Date.now() + WEBAUTHN_TIMEOUT,
  });

  recordPasskeyEvent("authentication.options", "success");

  return authOptions;
}
