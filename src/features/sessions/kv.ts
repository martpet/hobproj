import { defineCollection } from "@shared/kv/kv.ts";
import { Session } from "./types.ts";

export const sessions = defineCollection<Session>()({
  name: "session",
  key: "id",
  indexes: ["cookie", ["userId", "id"], ["lastActive", "id"]],
  expireIn: (session) => session.expiresAt - Date.now(),
});
