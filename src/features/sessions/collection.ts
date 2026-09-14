import { defineCollection } from "@shared/kv/kv.ts";
import { Session } from "./types.ts";

export const sessions = defineCollection<Session>()({
  name: "session",
  key: "id",
  indexes: ["cookie", ["userId", "id"], ["lastActive", "id"]],
  // `cookie` is a bearer token and `ip` is personal data, so neither is kept
  // in the clear. `cookie` stays indexed: its key part becomes a blind index,
  // which `getByCookie` derives from the plaintext cookie it is given.
  encrypt: ["cookie", "ip"],
  expireIn: (session) => session.expiresAt - Date.now(),
});
