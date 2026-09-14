import { createAuthOptions } from "@features/passkeys/ceremony/auth-options.ts";
import { recordSessionEvent } from "../../telemetry.ts";

export async function handleLogInStart() {
  const headers = new Headers();
  const authOptions = await createAuthOptions(headers);

  recordSessionEvent("login.start", "success");

  return Response.json(authOptions, { headers });
}
