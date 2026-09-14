import { defineCollection } from "@shared/kv/kv.ts";
import { User } from "./types.ts";

export const users = defineCollection<User>()({
  name: "user",
  key: "id",
  indexes: ["username"],
});
