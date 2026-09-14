import {
  SendSignalAllAcceptedCredentialsOpts,
  SendSignalUnknownCredentialOpts,
} from "@simplewebauthn/server";
import { passkeys } from "./collection.ts";
import { WEBAUTHN_RP_ID } from "./constants.ts";
import { Passkey } from "./types.ts";

// Tells the credential manager the passkey it just offered is not one this
// RP recognizes, so it can be hidden from future sign-in prompts.
export function getUnknownCredentialSignal(
  credId: Passkey["credId"],
): SendSignalUnknownCredentialOpts {
  return {
    signalName: "unknownCredential",
    rpID: WEBAUTHN_RP_ID,
    credentialID: credId,
  };
}

// Options for @simplewebauthn/browser's sendSignal(), so the credential
// manager can hide passkeys this RP no longer recognizes for the user.
export async function getAllAcceptedCredentialsSignal(
  passkey: Passkey,
): Promise<SendSignalAllAcceptedCredentialsOpts> {
  const userPasskeys = await passkeys.listByUserId(passkey.userId);

  return {
    signalName: "allAcceptedCredentials",
    rpID: WEBAUTHN_RP_ID,
    userID: passkey.webauthnUserId,
    allAcceptedCredentialIDs: userPasskeys
      .filter((p) => p.webauthnUserId === passkey.webauthnUserId)
      .map((p) => p.credId),
  };
}

// One signal per webauthn user ID with an empty accepted list, so the
// credential manager drops every passkey it holds for a deleted account.
export function getNoAcceptedCredentialsSignals(
  deletedPasskeys: Passkey[],
): SendSignalAllAcceptedCredentialsOpts[] {
  const webauthnUserIds = new Set(deletedPasskeys.map((p) => p.webauthnUserId));

  return [...webauthnUserIds].map((userID) => ({
    signalName: "allAcceptedCredentials",
    rpID: WEBAUTHN_RP_ID,
    userID,
    allAcceptedCredentialIDs: [],
  }));
}
