import { respondConflict } from "@shared/responses/conflict.ts";

export function respondUsernameTaken(
  username: string,
  opts?: { headers?: HeadersInit },
) {
  return respondConflict({
    code: "USERNAME_TAKEN",
    detail: `Username "${username}" is taken`,
    ...opts,
  });
}
