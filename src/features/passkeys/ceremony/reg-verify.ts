import { Context } from "@shared/context.ts";
import { recordException } from "@shared/observability/core.ts";
import {
  RegistrationResponseJSON,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { WEBAUTHN_ORIGIN, WEBAUTHN_RP_ID } from "../constants.ts";
import { deletePasskeyRegCookie, getPasskeyRegCookie } from "../cookie.ts";
import { passkeyRegOptions } from "../kv.ts";
import { recordPasskeyEvent, withWebAuthnCeremonySpan } from "../telemetry.ts";
import { Passkey } from "../types.ts";

type RegVerificationResult = {
  ok: true;
  passkey: Omit<Passkey, "id" | "userId" | "name">;
  username: string;
} | {
  ok: false;
};

// Checks a WebAuthn attestation against the challenge issued by
// `createRegOptions`. Returns the passkey to store minus `id`/`userId`/`name`:
// the user row doesn't exist yet — `handleSignupFinish` creates both together
// — and the name is derived by the caller, which knows the user's other
// passkeys and can keep names unique.
export async function verifyRegResponseJson(
  c: Context,
  headers: Headers,
  regResponseJson: RegistrationResponseJSON,
): Promise<RegVerificationResult> {
  return await withWebAuthnCeremonySpan(
    "webauthn.registration.verify",
    { "webauthn.ceremony": "registration" },
    async () => {
      const cookie = getPasskeyRegCookie(c);

      let regOptions;

      if (cookie) {
        regOptions = await passkeyRegOptions.getByCookie(cookie);
        deletePasskeyRegCookie(headers);
      }

      // Single-use challenge; see `verifiyAuthResponseJson`.
      if (regOptions) {
        await passkeyRegOptions.delete(regOptions);
      }

      if (!regOptions || regOptions.expiresAt < Date.now()) {
        recordPasskeyEvent("registration.verify", "failure", {
          reason: "challenge_expired",
        });
        return { ok: false };
      }

      let regVerification;

      try {
        regVerification = await verifyRegistrationResponse({
          response: regResponseJson,
          expectedRPID: WEBAUTHN_RP_ID,
          expectedOrigin: WEBAUTHN_ORIGIN,
          expectedChallenge: regOptions.value.challenge,
        });
      } catch (error) {
        recordException(error);
        recordPasskeyEvent("registration.verify", "failure", {
          reason: "library_rejected",
        });
        return { ok: false };
      }

      const { verified, registrationInfo } = regVerification;

      if (!verified) {
        recordPasskeyEvent("registration.verify", "failure", {
          reason: "not_verified",
        });
        return { ok: false };
      }

      const { credential, credentialDeviceType, credentialBackedUp, aaguid } =
        registrationInfo;

      recordPasskeyEvent("registration.verify", "success");

      return {
        ok: true,
        // The username was validated and checked for collisions in
        // `handleSignupStart`; taking it from the stored options (not the request
        // body) means the client can't swap it between the two steps.
        username: regOptions.value.user.name,
        passkey: {
          credId: credential.id,
          credPublicKey: credential.publicKey,
          webauthnUserId: regOptions.value.user.id,
          aaguid,
          // Registration counts as a use, so "Last used" is set from the start.
          lastUsedAt: Date.now(),
          counter: credential.counter,
          transports: credential.transports,
          deviceType: credentialDeviceType,
          backedUp: credentialBackedUp,
        },
      };
    },
  );
}
