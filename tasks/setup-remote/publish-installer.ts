import { join } from "@std/path";
import { loadSetupEnv } from "./load-env.ts";
import { REMOTE_PATHS } from "../utils/remote-paths.ts";
import { run } from "../utils/run.ts";
import { createRemoteClients } from "../utils/remote.ts";
import { COMPILE_TARGET } from "../utils/infrastructure.ts";

console.log("🔍 Running task checks...");
await run("deno", ["task", "check"]);

// Compiles the remote setup installer and installs it persistently on the
// remote host, so `setup-remote` doesn't need to recompile/upload it on
// every run. Only needs to be re-run when `installer.ts` changes.
await loadSetupEnv();

const { host: remoteHost, ssh, scp } = createRemoteClients();
const remoteInstaller = join(REMOTE_PATHS.installer, "installer");
const localTempDir = await Deno.makeTempDir({
  prefix: "hobproj-installer-",
});
const localInstaller = join(localTempDir, "installer");
const REMOTE_TEMP_INSTALLER = "installer-setup-remote.tmp";

console.log("🔨 Building remote setup installer...");

let failed = false;

try {
  await run("deno", [
    "compile",
    `--output=${localInstaller}`,
    `--target=${COMPILE_TARGET}`,
    "--frozen",
    "-A",
    "tasks/setup-remote/installer.ts",
  ]);

  console.log(
    `📦 Installing remote setup installer to "${remoteHost}:${remoteInstaller}"...`,
  );
  await scp.upload(localInstaller, REMOTE_TEMP_INSTALLER);
  await ssh([
    "sudo",
    "mkdir",
    "-p",
    REMOTE_PATHS.installer,
    "&&",
    "sudo",
    "install",
    "-o",
    "root",
    "-g",
    "root",
    "-m",
    "0700",
    REMOTE_TEMP_INSTALLER,
    remoteInstaller,
  ]);

  console.log("✅ Remote setup installer installed.");
  console.log("ℹ️  Run `deno task setup-remote` to run it.");
} catch (error) {
  console.error("❌ Remote setup installer installation failed!", error);
  failed = true;
} finally {
  await ssh(["rm", "-f", REMOTE_TEMP_INSTALLER], {
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
