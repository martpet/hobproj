import { DELETED_ACCOUNT_TOMBSTONE_TTL } from "@features/account/constants.ts";
import { kv, kvKeys } from "@shared/kv/kv.ts";
import { ulid } from "@std/ulid";
import { SetOptional } from "type-fest";
import { Passkey, PasskeyAuthOptions, PasskeyRegOptions } from "./types.ts";

const passkeyKeys = kvKeys<Passkey>("passkey")({
  byId: { prefix: "passkeys_by_id", props: "id" },
  byCredId: { prefix: "passkeys_by_cred_id", props: "credId" },
  byUserId: { prefix: "passkeys_by_user_id", props: ["userId", "id"] },
});

const passkeyTombstoneKeys = kvKeys<Passkey>("passkey_tombstone")({
  byWebauthnUserId: {
    prefix: "passkeys_deleted_by_webauthn_user_id",
    props: "webauthnUserId",
  },
});

const passkeyRegOptionsKeys = kvKeys<PasskeyRegOptions>("passkey_reg_options")({
  byCookie: { prefix: "passkeys_reg_options_by_cookie", props: "cookie" },
});

const passkeyAuthOptionsKeys = kvKeys<PasskeyAuthOptions>(
  "passkey_auth_options",
)({
  byCookie: { prefix: "passkeys_auth_options_by_cookie", props: "cookie" },
});

export function getPasskeyById(id: Passkey["id"]) {
  return kv.get<Passkey>(passkeyKeys.byId(id));
}

export function getPasskeyByCredId(credId: Passkey["credId"]) {
  return kv.get<Passkey>(passkeyKeys.byCredId(credId));
}

export function listPasskeysByUserId(userId: Passkey["userId"]) {
  return kv.list<Passkey>({ prefix: passkeyKeys.byUserId(userId) });
}

export function setPasskey(
  partialPasskey: SetOptional<Passkey, "id">,
  atomic: Deno.AtomicOperation,
) {
  const passkey: Passkey = {
    ...partialPasskey,
    id: partialPasskey.id ?? ulid(),
  };

  for (const key of passkeyKeys.keys(passkey)) {
    atomic.set(key, passkey);
  }

  return passkey;
}

export function deletePasskey(passkey: Passkey, atomic: Deno.AtomicOperation) {
  for (const key of passkeyKeys.keys(passkey)) {
    atomic.delete(key);
  }
}

// Remembers that the passkeys for a WebAuthn user handle were deleted, so a
// later login attempt with one of them can say "account deleted" rather than
// a confusing "passkey not found". Set alongside `deletePasskey`.
export function tombstonePasskey(
  passkey: Passkey,
  atomic: Deno.AtomicOperation,
) {
  atomic.set(
    passkeyTombstoneKeys.byWebauthnUserId(passkey.webauthnUserId),
    true,
    { expireIn: DELETED_ACCOUNT_TOMBSTONE_TTL },
  );
}

export function getPasskeyDeletedTombstone(
  webauthnUserId: Passkey["webauthnUserId"],
) {
  return kv.get<boolean>(
    passkeyTombstoneKeys.byWebauthnUserId(webauthnUserId),
  );
}

export function getPasskeyRegOptions(cookie: PasskeyRegOptions["cookie"]) {
  return kv.get<PasskeyRegOptions>(passkeyRegOptionsKeys.byCookie(cookie));
}

export function setPasskeyRegOptions(regOptions: PasskeyRegOptions) {
  const expireIn = regOptions.expiresAt - Date.now();

  return kv.set(
    passkeyRegOptionsKeys.byCookie(regOptions.cookie),
    regOptions,
    { expireIn },
  );
}

export function deletePasskeyRegOptions(regOptions: PasskeyRegOptions) {
  return kv.delete(passkeyRegOptionsKeys.byCookie(regOptions.cookie));
}

export function getPasskeyAuthOptions(cookie: PasskeyAuthOptions["cookie"]) {
  return kv.get<PasskeyAuthOptions>(passkeyAuthOptionsKeys.byCookie(cookie));
}

export function setPasskeyAuthOptions(authOptions: PasskeyAuthOptions) {
  const expireIn = authOptions.expiresAt - Date.now();

  return kv.set(
    passkeyAuthOptionsKeys.byCookie(authOptions.cookie),
    authOptions,
    { expireIn },
  );
}

export function deletePasskeyAuthOptions(authOptions: PasskeyAuthOptions) {
  return kv.delete(passkeyAuthOptionsKeys.byCookie(authOptions.cookie));
}
