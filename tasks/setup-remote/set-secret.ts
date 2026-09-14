import { promptSecret } from "@std/cli/prompt-secret";
import { loadSetupEnv } from "./load-env.ts";
import { credentialPath, SECRET_STORE_DIR, SECRETS } from "./secrets.ts";
import { createRemoteClients } from "../utils/remote.ts";
import { EXECUTABLE_PATHS } from "../utils/remote-paths.ts";

// Sets or rotates one remote secret used during setup, deploy, or telemetry
// export. The value never touches a local file or a remote env file: it is
// read from a hidden prompt and piped directly over SSH into
// `systemd-creds encrypt`, which stores it under `SECRET_STORE_DIR` on the Pi,
// encrypted with a key that exists only there.
//
// This is deliberately separate from `setup-remote`, so a secret's plaintext
// value only ever exists in this one narrow command, and rotating it doesn't
// require re-running the broader (and much noisier) provisioning script.
//
// Usage: deno task set-secret <name>

// Restarting cloudflared picks up a rotated tunnel token immediately; the
// other secrets are read fresh on every use (by geoipupdate's timer or by
// the deployer), so nothing else needs restarting.
const RESTART_UNIT_AFTER: Record<string, string> = {
  cloudflare_tunnel_token: "cloudflared.service",
};

await loadSetupEnv();

const name = Deno.args[0];
const secret = SECRETS.find((s) => s.name === name);
if (secret === undefined) {
  const names = SECRETS.map((s) => `  ${s.name} — ${s.label}`).join("\n");
  throw new Error(
    `Usage: deno task set-secret <name>, where <name> is one of:\n${names}`,
  );
}

const { host: remoteHost, ssh } = createRemoteClients();

console.log(
  `🔐 Verifying SSH connectivity and passwordless sudo on "${remoteHost}"...`,
);
await ssh(["sudo", "-n", "true"]);

const value = promptSecret(`Enter the ${secret.label}`);
if (!value) {
  throw new Error("No value entered; the secret was not changed.");
}

const path = credentialPath(secret.name);
const tempPath = `${path}.tmp`;

console.log(`🔒 Encrypting and storing "${secret.label}" on ${remoteHost}...`);
await ssh([
  "sudo",
  "mkdir",
  "-p",
  SECRET_STORE_DIR,
]);
await ssh([
  "sudo",
  "chmod",
  "0700",
  SECRET_STORE_DIR,
]);
// Piped over the same SSH connection's stdin; the value is never written to
// a file on this laptop and never appears in `ps` on either machine.
await ssh([
  "sudo",
  EXECUTABLE_PATHS.systemdCreds,
  "encrypt",
  `--name=${secret.name}`,
  "-",
  tempPath,
], { input: value });
await ssh(["sudo", "chmod", "0600", tempPath]);
await ssh(["sudo", "mv", "-f", tempPath, path]);

console.log(`✅ Stored "${secret.label}" at ${path} on ${remoteHost}.`);

const unit = RESTART_UNIT_AFTER[secret.name];
if (unit !== undefined) {
  const { code } = await ssh(
    ["sudo", "systemctl", "is-enabled", unit],
    { check: false, stdout: "piped", stderr: "null" },
  );
  if (code === 0) {
    console.log(`🔄 Restarting ${unit} to pick up the new value...`);
    await ssh(["sudo", "systemctl", "restart", unit]);
  }
}
