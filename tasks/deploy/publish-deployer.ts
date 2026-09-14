import { parseBooleanEnvValue } from "@shared/environment.ts";
import { join } from "@std/path";
import { loadEnv } from "./load-env.ts";
import {
  ETC_ROOT,
  EXECUTABLE_PATHS,
  REMOTE_PATHS,
} from "../utils/remote-paths.ts";
import { run } from "../utils/run.ts";
import { createRemoteClients } from "../utils/remote.ts";
import { loadEnvFile, SETUP_ENV_PATH } from "../utils/environment.ts";
import { COMPILE_TARGET, REMOTE_PORTS } from "../utils/infrastructure.ts";

console.log("🔍 Running task checks...");
await run("deno", ["task", "check"]);

const envName = await loadEnv();
const setupEnv = await loadEnvFile(SETUP_ENV_PATH);
const badge = `[${envName.toUpperCase()}]`;
const remoteDeployerRoot = REMOTE_PATHS.deployer;
const remoteAppRoot = REMOTE_PATHS.app;
const remoteUploadRoot = REMOTE_PATHS.upload;
const remoteCacheRoot = REMOTE_PATHS.cache;
// Shared with remote setup, which writes the per-env active-color file and
// Caddy upstream snippet there.
const remoteEtcRoot = ETC_ROOT;
const remoteDeployer = join(remoteDeployerRoot, envName, "deployer");
const remoteAppPath = join(remoteAppRoot, envName);
const persistentDataPath = join(
  REMOTE_PATHS.storageMount,
  envName,
  "db",
);
const remoteUploadPath = join(remoteUploadRoot, envName);
const remoteEtcEnvPath = join(remoteEtcRoot, envName);
const remoteTempDeployer = `deployer-${envName}.tmp`;
const { host: remoteHost, ssh, scp } = createRemoteClients();
const envPrefix = envName.toUpperCase();
const { blue: bluePort, green: greenPort } = REMOTE_PORTS[envName];
const cloudflarePurgeCacheEnabled = parseBooleanEnvValue(
  setupEnv[`${envPrefix}_CLOUDFLARE_PURGE_CACHE_ENABLED`] ??
    setupEnv[`${envPrefix}_CLOUDFLARE_ENABLED`],
);
const allowNetParts = [
  `127.0.0.1:${bluePort}`,
  `127.0.0.1:${greenPort}`,
];
if (cloudflarePurgeCacheEnabled) {
  allowNetParts.push("api.cloudflare.com:443");
}
const allowNet = allowNetParts.join(",");

console.log(`🔨 Building remote deployer for ${badge}...`);

const localTempDir = await Deno.makeTempDir({
  prefix: `hobproj-${envName}-deployer-`,
});
const localRemoteDeployer = join(localTempDir, "deployer");
let failed = false;

try {
  await run("deno", [
    "compile",
    `--output=${localRemoteDeployer}`,
    `--target=${COMPILE_TARGET}`,
    "--frozen",
    `--allow-read=${remoteDeployerRoot},${remoteAppPath},${remoteUploadPath},${remoteCacheRoot},${persistentDataPath},${remoteEtcEnvPath}`,
    `--allow-write=${remoteAppPath},${remoteUploadPath},${remoteCacheRoot},${persistentDataPath},${remoteEtcEnvPath}`,
    // Scoped to the exact binaries `deployer.ts` spawns (`deno compile`,
    // `sudo systemctl ...`), not a bare --allow-run: an unscoped grant is
    // equivalent to full system access if this binary is ever compromised,
    // since it could then spawn any process, including a new `deno -A`.
    // These are absolute paths (see `remote-paths.ts`), not bare names,
    // so the grant can't be bypassed via a hijacked/reordered `PATH`.
    `--allow-run=${EXECUTABLE_PATHS.deno},${EXECUTABLE_PATHS.sudo},${EXECUTABLE_PATHS.systemctl}`,
    `--allow-net=${allowNet}`,
    "tasks/deploy/deployer.ts",
  ]);

  console.log(
    `📦 Installing remote deployer to "${remoteHost}:${remoteDeployer}"...`,
  );
  await scp.upload(localRemoteDeployer, remoteTempDeployer);
  await ssh([
    "sudo",
    "install",
    "-o",
    "root",
    "-g",
    "root",
    "-m",
    "0755",
    remoteTempDeployer,
    remoteDeployer,
  ]);

  console.log(`✅ Remote deployer installed for ${badge}.`);
  console.log(
    `ℹ️  It will read config from "${remoteDeployerRoot}/.env.deployer" and "${
      join(remoteDeployerRoot, envName, ".env.deployer")
    }".`,
  );
} catch (error) {
  console.error("❌ Remote deployer installation failed!", error);
  failed = true;
} finally {
  await ssh(["rm", "-f", remoteTempDeployer], {
    check: false,
  });
  await Deno.remove(localTempDir, { recursive: true }).catch((error) => {
    console.error(
      `Warning: could not remove local temporary directory ${localTempDir}.`,
      error,
    );
    failed = true;
  });
}

if (failed) {
  Deno.exit(1);
}
