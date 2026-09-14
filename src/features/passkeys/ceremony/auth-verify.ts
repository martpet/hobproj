import { Context } from "@shared/context.ts";
import { kv } from "@shared/kv/kv.ts";
import { recordException } from "@shared/observability/core.ts";
import {
  AuthenticationResponseJSON,
  SendSignalUnknownCredentialOpts,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import {
  passkeyAuthOptions,
  passkeys,
  passkeyTombstones,
} from "../collection.ts";
import { WEBAUTHN_ORIGIN, WEBAUTHN_RP_ID } from "../constants.ts";
import { deletePasskeyAuthCookie, getPasskeyAuthCookie } from "../cookie.ts";
import { getUnknownCredentialSignal } from "../signals.ts";
import { recordPasskeyEvent, withWebAuthnCeremonySpan } from "../telemetry.ts";
import { Passkey } from "../types.ts";

type AuthVerificationResult = {
  ok: true;
  passkey: Passkey;
} | {
  ok: false;
  detail?: string;
  signal?: SendSignalUnknownCredentialOpts;
};

// Checks a WebAuthn assertion against the challenge issued by
// `createAuthOptions`, looked up via the short-lived `passkey_auth` cookie.
export async function verifiyAuthResponseJson(
  c: Context,
  headers: Headers,
  authResponseJson: AuthenticationResponseJSON,
): Promise<AuthVerificationResult> {
  return await withWebAuthnCeremonySpan(
    "webauthn.authentication.verify",
    { "webauthn.ceremony": "authentication" },
    async () => {
      const cookie = getPasskeyAuthCookie(c);

      let authOptions;

      if (cookie) {
        authOptions = await passkeyAuthOptions.getByCookie(cookie);
        deletePasskeyAuthCookie(headers);
      }

      // A challenge is single-use: consume it before verifying so a replayed
      // assertion, or a second attempt with the same options, is always rejected.
      if (authOptions) {
        await passkeyAuthOptions.delete(authOptions);
      }

      if (!authOptions || authOptions.expiresAt < Date.now()) {
        recordPasskeyEvent("authentication.verify", "failure", {
          reason: "challenge_expired",
        });
        return { ok: false };
      }

      const passkeyEntry = await passkeys.getEntryByCredId(
        authResponseJson.id,
      );
      const passkey = passkeyEntry.value;

      // Discoverable credentials mean the browser may offer a passkey whose
      // account was deleted here. The tombstone tells those users what happened,
      // and the signal lets the credential manager stop offering it.
      if (!passkey) {
        const userHandle = authResponseJson.response.userHandle;
        const tombstoned = userHandle &&
          await passkeyTombstones.getByWebauthnUserId(userHandle);

        recordPasskeyEvent("authentication.verify", "failure", {
          reason: tombstoned ? "account_deleted" : "credential_unknown",
        });

        return {
          ok: false,
          detail: tombstoned
            ? "This account was deleted. You can remove this passkey from your device or password manager."
            : "This passkey was removed from your account. Try another passkey.",
          signal: getUnknownCredentialSignal(authResponseJson.id),
        };
      }

      let authVerification;

      // The library throws on malformed input or a bad signature (rather than
      // returning `verified: false`), so a reject here is expected, not a bug.
      try {
        authVerification = await verifyAuthenticationResponse({
          response: authResponseJson,
          expectedRPID: WEBAUTHN_RP_ID,
          expectedOrigin: WEBAUTHN_ORIGIN,
          expectedChallenge: authOptions.value.challenge,
          credential: {
            id: passkey.credId,
            publicKey: passkey.credPublicKey as Uint8Array<ArrayBuffer>,
            counter: passkey.counter,
            transports: passkey.transports,
          },
        });
      } catch (error) {
        recordException(error);
        recordPasskeyEvent("authentication.verify", "failure", {
          reason: "library_rejected",
        });
        return { ok: false };
      }

      const { verified, authenticationInfo } = authVerification;

      if (!verified) {
        recordPasskeyEvent("authentication.verify", "failure", {
          reason: "not_verified",
        });
        return { ok: false };
      }

      // Persist the new signature counter (used by the library to detect cloned
      // authenticators; many passkey providers keep it at 0) and the time of this
      // assertion. The check makes two concurrent assertions with the same
      // passkey fail one of them, so the counter can't be rolled back.
      const atomic = kv.atomic();
      const updatedPasskey = {
        ...passkey,
        counter: authenticationInfo.newCounter,
        lastUsedAt: Date.now(),
      };

      atomic.check(passkeyEntry);
      passkeys.stageSet(atomic, updatedPasskey);

      const result = await atomic.commit();

      if (!result.ok) {
        recordPasskeyEvent("authentication.verify", "failure", {
          reason: "commit_conflict",
        });
        return { ok: false };
      }

      recordPasskeyEvent("authentication.verify", "success");

      return {
        ok: true,
        passkey: updatedPasskey,
      };
    },
  );
}
