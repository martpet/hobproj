import { getRequiredEnv } from "@shared/environment.ts";
import { exists } from "@std/fs";
import { dirname, join } from "@std/path";
import {
  BACKUP_ENV_PATH,
  DEPLOY_ENV_PATH,
  SETUP_ENV_PATH,
  TASK_ENV_PATH,
} from "../utils/environment.ts";
import { run } from "../utils/run.ts";
import { fileSha256 } from "./checksum.ts";
import { BACKUP_ROOT_ENV, LOCAL_ENV_BACKUP_DIR } from "./constants.ts";
import { encryptBackupFile } from "./crypto.ts";
import { loadBackupEnv } from "./load-env.ts";
import { resolveEncryptionPassword } from "./password.ts";
import { pruneExpiredBackups } from "./prune.ts";
import { createBackupWorkspace } from "./workspace.ts";

// Backs up the local, plaintext env files (`.env`, `tasks/**/.env.*`) that
// configure these tasks. Separate from `backup-db` because it's not tied to
// a remote staging/prod environment; it archives whatever env files exist
// locally, on whichever machine runs this task.
//
// Usage: deno task backup-local-env
const ENV_FILES = [
  ".env",
  TASK_ENV_PATH,
  DEPLOY_ENV_PATH,
  SETUP_ENV_PATH,
  BACKUP_ENV_PATH,
];

await loadBackupEnv();

const backupRoot = getRequiredEnv(BACKUP_ROOT_ENV);
const encryptionPassword = await resolveEncryptionPassword();
const {
  finalDir,
  publishTempDir: tempDir,
  stagingDir,
} = await createBackupWorkspace(
  backupRoot,
  LOCAL_ENV_BACKUP_DIR,
  "hobproj-local-env-",
);
const localEnvArchive = join(stagingDir, "local-env.tar.gz");
const encryptedArchiveTemp = join(tempDir, "local-env.tar.gz.enc");

try {
  await Deno.mkdir(tempDir, { recursive: true });

  const includedFiles = await createLocalEnvArchive(
    stagingDir,
    localEnvArchive,
  );

  await encryptBackupFile(
    localEnvArchive,
    encryptedArchiveTemp,
    encryptionPassword,
  );

  const localEnvHash = await fileSha256(localEnvArchive);
  const manifest = [
    "scope=local-env",
    `created_at=${new Date().toISOString()}`,
    `local_env_sha256=${localEnvHash}`,
    `local_env=${includedFiles.join(",")}`,
    "",
  ].join("\n");
  await Deno.writeTextFile(join(tempDir, "manifest.txt"), manifest);

  const encryptedArchive = join(finalDir, "local-env.tar.gz.enc");
  await Deno.rename(tempDir, finalDir);
  console.log(`✅ Encrypted env files written to ${encryptedArchive}`);
  await pruneExpiredBackups(join(backupRoot, LOCAL_ENV_BACKUP_DIR));
} finally {
  if (await exists(tempDir)) {
    await Deno.remove(tempDir, { recursive: true });
  }
  await Deno.remove(stagingDir, { recursive: true });
}

async function createLocalEnvArchive(
  stagingDir: string,
  archivePath: string,
): Promise<string[]> {
  const localEnvRoot = join(stagingDir, "local-env");
  const includedFiles: string[] = [];

  for (const relativePath of ENV_FILES) {
    if (!await exists(relativePath)) {
      console.warn(`Skipping missing env file: ${relativePath}`);
      continue;
    }

    const destination = join(localEnvRoot, relativePath);
    const content = await Deno.readTextFile(relativePath);
    await Deno.mkdir(dirname(destination), { recursive: true });
    await Deno.writeTextFile(destination, content);
    includedFiles.push(relativePath);
  }

  await run("tar", ["-czf", archivePath, "-C", stagingDir, "local-env"]);
  return includedFiles;
}
