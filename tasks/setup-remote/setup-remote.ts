import { getEnv, getRequiredEnv } from "@shared/environment.ts";
import { join } from "@std/path";
import { loadSetupEnv } from "./load-env.ts";
import { loadBackupEnv } from "../backup/load-env.ts";
import { backupRemoteLuksHeader } from "../backup/luks-header.ts";
import { REMOTE_PATHS } from "../utils/remote-paths.ts";
import { run } from "../utils/run.ts";
import { createRemoteClients } from "../utils/remote.ts";
import { USB_FILESYSTEM_LABEL } from "../utils/infrastructure.ts";
import {
  prepareStorageMigration,
  type StorageMigration,
} from "./storage-migration.ts";
import { ALLOW_PLAINTEXT_STORAGE_MIGRATION_ENV } from "./constants.ts";

console.log("🔍 Running task checks...");
await run("deno", ["task", "check"]);

// Local orchestrator for `deno task setup-remote`. Verifies SSH/sudo access,
// uploads a generated config file, runs the already-installed remote
// installer interactively over SSH (so confirmation prompts for destructive
// steps reach the developer's terminal; run `publish-installer` first if
// it hasn't been installed yet or `installer.ts` has changed), then
// installs both deployer binaries.
await loadSetupEnv();
await loadBackupEnv();

const { host: remoteHost, ssh, scp } = createRemoteClients();
const remoteInstaller = join(
  REMOTE_PATHS.installer,
  "installer",
);
const REMOTE_CONFIG_TEMP = ".env.setup-remote";

const CONFIG_KEYS = [
  "SSH_ALLOWED_SUBNET",
  "DEPLOY_STAGING_USERS",
  "DEPLOY_PROD_USERS",
  "STAGING_APP_ORIGIN",
  "PROD_APP_ORIGIN",
];

// Optional; each defaults (on the remote installer side) to "false" if
// absent from the uploaded config, so they're read separately below rather
// than via getRequiredEnv.
const OPTIONAL_CONFIG_KEYS = [
  "STAGING_KEEP_IDLE_RUNNING",
  "PROD_KEEP_IDLE_RUNNING",
  "STAGING_OTEL_ENABLED",
  "PROD_OTEL_ENABLED",
  "STAGING_CLOUDFLARE_PURGE_CACHE_ENABLED",
  "PROD_CLOUDFLARE_PURGE_CACHE_ENABLED",
  "STAGING_CLOUDFLARE_ENABLED",
  "PROD_CLOUDFLARE_ENABLED",
  "OTEL_COLLECTOR_VERSION",
  "OTEL_COLLECTOR_EXPORT_ENDPOINT",
  "OTEL_COLLECTOR_EXPORT_PROTOCOL",
];

let uploadedConfig = false;
let migration: StorageMigration | undefined;
let localConfigTemp: string | undefined;

console.log(
  `🔐 Verifying SSH connectivity and passwordless sudo on "${remoteHost}"...`,
);
await ssh(["sudo", "-n", "true"]);

const { code: installerExists } = await ssh(
  ["sudo", "test", "-x", remoteInstaller],
  { check: false },
);
if (installerExists !== 0) {
  console.error(
    `Error: "${remoteInstaller}" doesn't exist on "${remoteHost}". Run \`deno task publish-installer\` first.`,
  );
  Deno.exit(1);
}

try {
  migration = await prepareStorageMigration(
    ssh,
    REMOTE_PATHS.storageMount,
    USB_FILESYSTEM_LABEL,
  );

  console.log("📝 Preparing remote config...");
  const requiredLines = CONFIG_KEYS
    .map((key) => `${key}=${getRequiredEnv(key)}`);
  const optionalLines = OPTIONAL_CONFIG_KEYS
    .map((key) => [key, getEnv(key)] as const)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${value}`);
  const migrationLines = migration.allowPlaintextMigration
    ? [`${ALLOW_PLAINTEXT_STORAGE_MIGRATION_ENV}=true`]
    : [];
  const configContent = [
    ...requiredLines,
    ...optionalLines,
    ...migrationLines,
  ].join("\n") +
    "\n";
  localConfigTemp = await Deno.makeTempFile({
    prefix: "hobproj-setup-",
    suffix: ".env",
  });
  await Deno.writeTextFile(localConfigTemp, configContent);

  console.log(`📦 Uploading config to "${remoteHost}"...`);
  await scp.upload(localConfigTemp, REMOTE_CONFIG_TEMP);
  uploadedConfig = true;

  console.log(
    "⚙️  Running remote setup (interactive; you may be prompted)...\n",
  );
  await ssh(["sudo", remoteInstaller], { tty: true });
  await migration.complete();
  await backupRemoteLuksHeader(USB_FILESYSTEM_LABEL);

  console.log("\n📦 Installing deployer binaries...");
  await run("deno", ["task", "publish-deployer", "staging"]);
  await run("deno", ["task", "publish-deployer", "prod"]);

  console.log(
    "\n✅ Server setup complete. Run `deno task deploy staging` / `deno task deploy prod` to deploy the app.",
  );
} catch (error) {
  try {
    if (await remoteStorageIsLuks()) {
      await backupRemoteLuksHeader(USB_FILESYSTEM_LABEL);
    }
  } catch (headerError) {
    console.error(
      "Warning: failed to create a recovery header backup after setup failure.",
      headerError,
    );
  }
  await migration?.fail();
  throw error;
} finally {
  if (uploadedConfig) {
    await ssh(["rm", "-f", REMOTE_CONFIG_TEMP], { check: false });
  }
  if (localConfigTemp !== undefined) {
    await Deno.remove(localConfigTemp).catch((error) => {
      console.error(
        `Warning: could not remove local temporary config ${localConfigTemp}.`,
        error,
      );
    });
  }
}

async function remoteStorageIsLuks(): Promise<boolean> {
  const device = await ssh([
    "sudo",
    "blkid",
    "-t",
    `LABEL=${USB_FILESYSTEM_LABEL}`,
    "-o",
    "device",
  ], { check: false, stdout: "piped", stderr: "null" });
  const devices = device.stdout.split("\n").filter(Boolean);
  if (device.code !== 0 || devices.length !== 1) return false;
  const type = await ssh([
    "sudo",
    "blkid",
    "-s",
    "TYPE",
    "-o",
    "value",
    devices[0]!,
  ], { check: false, stdout: "piped", stderr: "null" });
  return type.stdout === "crypto_LUKS";
}
