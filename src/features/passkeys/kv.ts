import { DELETED_ACCOUNT_TOMBSTONE_TTL } from "@features/account/constants.ts";
import { defineCollection } from "@shared/kv/kv.ts";
import {
  Passkey,
  PasskeyAuthOptions,
  PasskeyRegOptions,
  PasskeyTombstone,
} from "./types.ts";

export const passkeys = defineCollection<Passkey>()({
  name: "passkey",
  key: "id",
  indexes: ["credId", ["userId", "id"]],
});

export const passkeyTombstones = defineCollection<PasskeyTombstone>()({
  name: "passkey_thombstone",
  key: "webauthnUserId",
  expireIn: DELETED_ACCOUNT_TOMBSTONE_TTL,
});

export const passkeyRegOptions = defineCollection<PasskeyRegOptions>()({
  name: "passkey_reg_options",
  key: "cookie",
  expireIn: (options) => options.expiresAt - Date.now(),
});

export const passkeyAuthOptions = defineCollection<PasskeyAuthOptions>()({
  name: "passkey_auth_options",
  key: "cookie",
  expireIn: (options) => options.expiresAt - Date.now(),
});
