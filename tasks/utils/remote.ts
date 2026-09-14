import { getRequiredEnv } from "@shared/environment.ts";
import { createScp } from "./scp.ts";
import { createSsh } from "./ssh.ts";

export function createRemoteClients() {
  const host = getRequiredEnv("REMOTE_HOST");
  return {
    host,
    ssh: createSsh(host),
    scp: createScp(host),
  };
}
