import { kv, kvKeys } from "@shared/kv/kv.ts";
import { ulid } from "@std/ulid";
import { SetOptional } from "type-fest";
import { User } from "./types.ts";

// Exported so `handleSignupFinish` can check username uniqueness atomically
// via `atomic.check({ key: userKeys.byUsername(username), versionstamp: null })`.
export const userKeys = kvKeys<User>("user")({
  byId: { prefix: "users_by_id", props: "id" },
  byUsername: { prefix: "users_by_username", props: "username" },
});

export function getUserById(id: User["id"]) {
  return kv.get<User>(userKeys.byId(id));
}

export function getUserByUsername(username: User["username"]) {
  return kv.get<User>(userKeys.byUsername(username));
}

export function setUser(
  partialUser: SetOptional<User, "id">,
  atomic: Deno.AtomicOperation,
) {
  const user: User = {
    ...partialUser,
    id: partialUser.id ?? ulid(),
  };

  for (const key of userKeys.keys(user)) {
    atomic.set(key, user);
  }

  return user;
}

export function deleteUser(user: User, atomic: Deno.AtomicOperation) {
  for (const key of userKeys.keys(user)) {
    atomic.delete(key);
  }
}
