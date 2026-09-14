import {
  CredentialDeviceType,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/server";

export interface Passkey {
  id: string;
  userId: string;
  // The `user.id` handed to the authenticator at registration (the WebAuthn
  // "user handle"). Comes back as `userHandle` in assertions and is what
  // signals and tombstones key on; distinct from our `userId`.
  webauthnUserId: string;
  credId: string;
  credPublicKey: Uint8Array;
  // Display name, unique per user (it identifies the passkey in the sessions
  // table). Derived from the AAGUID at registration; renameable by the user.
  name: string;
  // The authenticator's AAGUID from the attestation; all-zero when the
  // client anonymises it. Used to derive the default `name`.
  aaguid: string;
  // Last assertion (or registration, which counts as a use) with this key.
  lastUsedAt: number;
  // Signature counter reported by the authenticator; stored so the library
  // can flag a clone if it ever goes backwards.
  counter: number;
  deviceType: CredentialDeviceType;
  backedUp: boolean;
  transports?: string[];
}

// Pending challenges, stored server-side and keyed by a per-ceremony cookie.
export interface PasskeyRegOptions {
  cookie: string;
  value: PublicKeyCredentialCreationOptionsJSON;
  expiresAt: number;
}

export interface PasskeyAuthOptions {
  cookie: string;
  value: PublicKeyCredentialRequestOptionsJSON;
  expiresAt: number;
}
