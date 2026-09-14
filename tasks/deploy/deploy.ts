import { join } from "@std/path";
import { loadEnv } from "./load-env.ts";
import { REMOTE_PATHS } from "../utils/remote-paths.ts";
import { APP_USER } from "../utils/infrastructure.ts";
import { run } from "../utils/run.ts";
import { createRemoteClients } from "../utils/remote.ts";
import { createSourceArchive } from "./source-archive.ts";

console.log("🔍 Running local checks...");
await run("deno", ["task", "check"]);

const envName = await loadEnv();
const badge = `[${envName.toUpperCase()}]`;
const deploymentId = await createDeploymentId(envName);
const remoteDeployer = join(
  REMOTE_PATHS.deployer,
  envName,
  "deployer",
);
const { host: remoteHost, ssh, scp } = createRemoteClients();
const remoteUploadPath = join(REMOTE_PATHS.upload, envName);
const remoteSourceArchive = join(
  remoteUploadPath,
  `source-${deploymentId}.tar.gz`,
);
const localTempDir = await Deno.makeTempDir({
  prefix: `hobproj-${envName}-deploy-`,
});
const localSourceArchive = join(localTempDir, "source.tar.gz");
let uploadedSourceArchive = false;
let failed = false;

console.log(`🚀 Starting deployment to ${badge}...`);
console.time("✨ Total deployment time");

try {
  console.log(`🗜️  Compressing source for ${badge}...`);
  await createSourceArchive(localSourceArchive);

  console.log(
    `📦 Copying "${localSourceArchive}" to "${remoteHost}:${remoteSourceArchive}"...`,
  );

  await scp.upload(localSourceArchive, remoteSourceArchive);
  uploadedSourceArchive = true;

  console.log(
    "⚙️  Running remote deployer...",
  );

  // The fixed sudoers command lets environment-specific deploy groups run the
  // administrator-owned deployer as `hobproj`, but not replace it.
  await ssh([
    "cd",
    remoteUploadPath,
    "&&",
    "sudo",
    "-n",
    "-u",
    APP_USER,
    remoteDeployer,
    deploymentId,
  ]);

  console.log(`✅ Deployment to ${badge} completed successfully!`);
} catch (error) {
  console.error("❌ Deployment failed!", error);
  failed = true;

  if (uploadedSourceArchive) {
    try {
      await ssh(["rm", "-f", remoteSourceArchive]);
    } catch (cleanupError) {
      console.error(
        `Warning: could not remove ${remoteHost}:${remoteSourceArchive}.`,
        cleanupError,
      );
    }
  }
} finally {
  await Deno.remove(localTempDir, { recursive: true }).catch((error) => {
    console.error(
      `Warning: could not remove local temporary directory ${localTempDir}.`,
      error,
    );
  });
  console.timeEnd("✨ Total deployment time");
}

if (failed) {
  Deno.exit(1);
}

async function createDeploymentId(
  envName: "staging" | "prod",
): Promise<string> {
  const { stdout: gitSha } = await run(
    "git",
    ["rev-parse", "--short", "HEAD"],
    { stdout: "piped" },
  );
  const { stdout: status } = await run(
    "git",
    ["status", "--porcelain", "--untracked-files=all"],
    { stdout: "piped" },
  );

  if (status === "") {
    return gitSha;
  }

  if (envName === "prod") {
    throw new Error(
      "Production deployments require a clean working tree. Commit or stash your changes first.",
    );
  }

  const timestamp = new Date().toISOString()
    .replaceAll("-", "")
    .replaceAll(":", "")
    .replace(".", "");
  return `${gitSha}-dirty-${timestamp}`;
}
