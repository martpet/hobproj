import { promptSecret } from "@std/cli/prompt-secret";
import { loadSetupEnv } from "./load-env.ts";
import {
  credentialPath,
  KV_ENCRYPTION_KEY_CREDENTIAL,
  KV_ENCRYPTION_SECRETS,
  SECRET_STORE_DIR,
  SECRETS,
} from "./secrets.ts";
import { createRemoteClients } from "../utils/remote.ts";
import { EXECUTABLE_PATHS } from "../utils/remote-paths.ts";
import { REMOTE_ENV_NAMES } from "../utils/environment.ts";
import { appServiceName } from "../utils/infrastructure.ts";
import { COLORS } from "./constants.ts";

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

interface RestartAfter {
  readonly units: readonly string[];
  /** Leaves a unit that is enabled but deliberately stopped alone. */
  readonly onlyIfRunning?: boolean;
}

// Restarting cloudflared picks up a rotated tunnel token immediately; the
// provider secrets are read fresh on every use (by geoipupdate's timer or by
// the deployer), so nothing else needs restarting. An app unit, by contrast,
// reads its encryption key once at startup, and only the color currently
// serving traffic should be brought back up.
const RESTART_AFTER: Record<string, RestartAfter> = {
  cloudflare_tunnel_token: { units: ["cloudflared.service"] },
  ...Object.fromEntries(REMOTE_ENV_NAMES.map((env) => [
    `${KV_ENCRYPTION_KEY_CREDENTIAL}_${env}`,
    {
      units: COLORS.map((color) => `${appServiceName(env, color)}.service`),
      onlyIfRunning: true,
    },
  ])),
};

const SETTABLE_SECRETS = [...SECRETS, ...KV_ENCRYPTION_SECRETS];

await loadSetupEnv();

const name = Deno.args[0];
const secret = SETTABLE_SECRETS.find((s) => s.name === name);
if (secret === undefined) {
  const names = SETTABLE_SECRETS
    .map((s) => `  ${s.name} — ${s.label}`)
    .join("\n");
  throw new Error(
    `Usage: deno task set-secret <name>, where <name> is one of:\n${names}`,
  );
}

const { host: remoteHost, ssh } = createRemoteClients();

console.log(
  `🔐 Verifying SSH connectivity and passwordless sudo on "${remoteHost}"...`,
);
await ssh(["sudo", "-n", "true"]);

const path = credentialPath(secret.name);

// Overwriting a key orphans everything encrypted with the current one, so the
// only safe use of this is restoring a backup onto a machine that has none.
if (secret.overwriteDestroysData) {
  const { code } = await ssh(["sudo", "test", "-e", path], {
    check: false,
    stdout: "piped",
    stderr: "null",
  });

  if (code === 0) {
    console.log(
      `\n⚠️  ${remoteHost} already has a ${secret.label}. Replacing it makes\n` +
        "   every value encrypted with the current key permanently\n" +
        "   unreadable — sessions, and anything else a collection encrypts.",
    );
    const answer = prompt(`Type 'replace ${secret.name}' to continue:`)?.trim();

    if (answer !== `replace ${secret.name}`) {
      throw new Error("Not confirmed; the secret was not changed.");
    }
  }
}

const value = promptSecret(`Enter the ${secret.label}`);
if (!value) {
  throw new Error("No value entered; the secret was not changed.");
}

secret.validate?.(value);

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
  `--name=${secret.credentialName ?? secret.name}`,
  "-",
  tempPath,
], { input: value });
await ssh(["sudo", "chmod", "0600", tempPath]);
await ssh(["sudo", "mv", "-f", tempPath, path]);

console.log(`✅ Stored "${secret.label}" at ${path} on ${remoteHost}.`);

const restart = RESTART_AFTER[secret.name];
if (restart !== undefined) {
  for (const unit of restart.units) {
    const { code } = await ssh(
      ["sudo", "systemctl", "is-enabled", unit],
      { check: false, stdout: "piped", stderr: "null" },
    );
    if (code !== 0) continue;

    const verb = restart.onlyIfRunning ? "try-restart" : "restart";
    console.log(`🔄 Running systemctl ${verb} ${unit}...`);
    await ssh(["sudo", "systemctl", verb, unit]);
  }
}
