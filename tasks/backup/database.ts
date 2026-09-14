import { getRequiredEnv } from "@shared/environment.ts";
import { exists } from "@std/fs";
import { join } from "@std/path";
import type { RemoteEnvName } from "../utils/environment.ts";
import { createRemoteClients } from "../utils/remote.ts";
import { APP_GROUP, APP_USER } from "../utils/infrastructure.ts";
import { SYSTEM_PATHS } from "../utils/remote-paths.ts";
import type { SshClient } from "../utils/ssh.ts";
import { STORAGE_MAPPER_PATH } from "../utils/remote-paths.ts";
import { run } from "../utils/run.ts";
import { fileSha256, verifyChecksum } from "./checksum.ts";
import { resolveEncryptionPassword } from "./password.ts";
import { pruneExpiredBackups } from "./prune.ts";
import { decryptBackupFile, encryptBackupFile } from "./crypto.ts";
import { BACKUP_ROOT_ENV } from "./constants.ts";
import { createBackupWorkspace } from "./workspace.ts";

export interface DatabaseBackup {
  readonly environment: RemoteEnvName;
  readonly encryptedArchive: string;
  readonly manifest: string;
}

export interface DatabaseBackupOptions {
  readonly remoteMountPath: string;
  readonly allowPlaintextMount?: boolean;
  readonly backupRoot?: string;
  readonly prune?: boolean;
}

export async function createRemoteDatabaseBackup(
  envName: RemoteEnvName,
  options: DatabaseBackupOptions,
): Promise<DatabaseBackup> {
  const remoteMountPath = options.remoteMountPath;
  const allowPlaintextMount = options.allowPlaintextMount ?? false;
  const { ssh, scp } = createRemoteClients();
  const backupRoot = options.backupRoot ?? getRequiredEnv(BACKUP_ROOT_ENV);
  const encryptionPassword = await resolveEncryptionPassword();
  const { finalDir, publishTempDir, stagingDir } = await createBackupWorkspace(
    backupRoot,
    envName,
    `hobproj-${envName}-backup-`,
  );
  const localArchive = join(stagingDir, "database.tar.gz");
  const encryptedArchiveTemp = join(stagingDir, "database.tar.gz.enc");
  const dbPath = `${remoteMountPath}/${envName}/db`;
  let remoteTempDir: string | undefined;

  try {
    await assertRemoteStorageMounted(
      ssh,
      remoteMountPath,
      allowPlaintextMount,
      "backup",
    );
    const sourceExists = await ssh([
      "sudo",
      "test",
      "-s",
      `${dbPath}/kv.sqlite`,
    ], { check: false });
    if (sourceExists.code !== 0) {
      throw new Error(
        `Database ${dbPath}/kv.sqlite is missing or empty; refusing backup.`,
      );
    }
    remoteTempDir = (await ssh([
      "sudo",
      "mktemp",
      "-d",
      `${SYSTEM_PATHS.temp}/hobproj-backup.XXXXXX`,
    ], { stdout: "piped" })).stdout;
    if (!remoteTempDir.startsWith(`${SYSTEM_PATHS.temp}/hobproj-backup.`)) {
      throw new Error("Remote mktemp returned an unexpected backup path.");
    }
    await ssh(["sudo", "chmod", "0711", remoteTempDir]);
    const remoteArchive = `${remoteTempDir}/database.tar.gz`;
    const remoteSnapshot = `${remoteTempDir}/database.sqlite`;

    console.log(`Creating an online SQLite snapshot for ${envName}...`);
    await ssh(["sudo", "sqlite3", `${dbPath}/kv.sqlite`], {
      input: `.backup ${remoteSnapshot}\n`,
    });
    const snapshotCheck = await ssh(["sudo", "sqlite3", remoteSnapshot], {
      input: "PRAGMA integrity_check;\n",
      stdout: "piped",
    });
    if (snapshotCheck.stdout !== "ok") {
      throw new Error(
        `${envName} snapshot failed integrity check: ${snapshotCheck.stdout}`,
      );
    }
    await ssh([
      "sudo",
      "tar",
      "-czf",
      remoteArchive,
      "-C",
      remoteTempDir,
      remoteSnapshot.split("/").at(-1)!,
    ]);
    const remoteUser = (await ssh(["id", "-un"], {
      stdout: "piped",
    })).stdout;
    await ssh(["sudo", "chown", remoteUser, remoteArchive]);
    await ssh(["sudo", "chmod", "0600", remoteArchive]);
    await scp.download(remoteArchive, localArchive);
    const archiveListing = (await run("tar", ["-tzf", localArchive], {
      stdout: "piped",
    })).stdout.split("\n").filter(Boolean);
    if (
      archiveListing.length !== 1 ||
      archiveListing[0] !== "database.sqlite"
    ) {
      throw new Error(
        `The ${envName} backup archive does not contain database.sqlite.`,
      );
    }

    const archiveBytes = await Deno.readFile(localArchive);
    const archiveHash = await fileSha256(localArchive);
    const manifestContent = [
      `environment=${envName}`,
      `created_at=${new Date().toISOString()}`,
      `source_path=${dbPath}`,
      `archive_sha256=${archiveHash}`,
      `archive_bytes=${archiveBytes.byteLength}`,
      "database_format=sqlite",
      "consistency=sqlite online backup snapshot",
      "",
    ].join("\n");
    await encryptBackupFile(
      localArchive,
      encryptedArchiveTemp,
      encryptionPassword,
    );

    await Deno.remove(localArchive);
    await Deno.mkdir(publishTempDir, { recursive: true });
    const encryptedArchive = join(finalDir, "database.tar.gz.enc");
    await Deno.rename(
      encryptedArchiveTemp,
      join(publishTempDir, "database.tar.gz.enc"),
    );
    await Deno.writeTextFile(
      join(publishTempDir, "manifest.txt"),
      `${manifestContent}encrypted_archive=${encryptedArchive}\n`,
    );
    await Deno.rename(publishTempDir, finalDir);
    console.log(`✅ Encrypted backup written to ${encryptedArchive}`);
    if (options.prune ?? true) {
      await pruneExpiredBackups(join(backupRoot, envName));
    }
    return {
      environment: envName,
      encryptedArchive,
      manifest: join(finalDir, "manifest.txt"),
    };
  } finally {
    if (remoteTempDir !== undefined) {
      await ssh(["sudo", "rm", "-rf", remoteTempDir], { check: false });
    }
    await Deno.remove(stagingDir, { recursive: true }).catch(() => {});
    if (await exists(publishTempDir)) {
      await Deno.remove(publishTempDir, { recursive: true });
    }
  }
}

export async function restoreRemoteDatabaseBackup(
  backup: DatabaseBackup,
  remoteMountPath: string,
): Promise<void> {
  const password = await resolveEncryptionPassword();
  const { ssh, scp } = createRemoteClients();
  const tempDir = await Deno.makeTempDir({ prefix: "hobproj-migration-" });
  const decryptedArchive = join(tempDir, "database.tar.gz");
  const extractedDir = join(tempDir, "database");
  let remoteTempDir: string | undefined;
  let remoteTemp: string | undefined;
  const target = `${remoteMountPath}/${backup.environment}/db/kv.sqlite`;

  try {
    await assertRemoteStorageMounted(
      ssh,
      remoteMountPath,
      false,
      "restore",
    );
    await decryptBackupFile(
      backup.encryptedArchive,
      decryptedArchive,
      password,
    );
    await verifyChecksum(
      decryptedArchive,
      backup.manifest,
      "archive_sha256",
    );
    await Deno.mkdir(extractedDir);
    await run("tar", ["-xzf", decryptedArchive, "-C", extractedDir]);

    const sqliteFiles = [];
    for await (const entry of Deno.readDir(extractedDir)) {
      if (entry.isFile && entry.name.endsWith(".sqlite")) {
        sqliteFiles.push(join(extractedDir, entry.name));
      }
    }

    const [database] = sqliteFiles;
    if (sqliteFiles.length !== 1 || database === undefined) {
      throw new Error(
        `The ${backup.environment} migration backup must contain one SQLite file.`,
      );
    }
    const { stdout } = await run("sqlite3", [
      database,
      "PRAGMA integrity_check;",
    ], { stdout: "piped" });
    if (stdout !== "ok") {
      throw new Error(
        `${backup.environment} migration backup failed integrity check: ${stdout}`,
      );
    }

    remoteTempDir = (await ssh([
      "mktemp",
      "-d",
      `${SYSTEM_PATHS.temp}/hobproj-${backup.environment}-restore.XXXXXX`,
    ], { stdout: "piped" })).stdout;
    if (
      !remoteTempDir.startsWith(
        `${SYSTEM_PATHS.temp}/hobproj-${backup.environment}-restore.`,
      )
    ) {
      throw new Error("Remote mktemp returned an unexpected restore path.");
    }
    remoteTemp = `${remoteTempDir}/database.sqlite`;
    await scp.upload(database, remoteTemp);
    await ssh(["chmod", "0600", remoteTemp]);
    await ssh([
      "sudo",
      "rm",
      "-f",
      `${target}-wal`,
      `${target}-shm`,
    ]);
    await ssh([
      "sudo",
      "install",
      "-o",
      APP_USER,
      "-g",
      APP_GROUP,
      "-m",
      "0600",
      remoteTemp,
      target,
    ]);
    const remoteCheck = await ssh([
      "sudo",
      "sqlite3",
      target,
    ], {
      input: "PRAGMA integrity_check;\n",
      stdout: "piped",
    });
    if (remoteCheck.stdout !== "ok") {
      throw new Error(
        `Restored ${backup.environment} database failed integrity check: ` +
          remoteCheck.stdout,
      );
    }
  } finally {
    if (remoteTempDir !== undefined) {
      await ssh(["rm", "-rf", remoteTempDir], { check: false });
    }
    await Deno.remove(tempDir, { recursive: true });
  }
}

async function assertRemoteStorageMounted(
  ssh: SshClient,
  remoteMountPath: string,
  allowPlaintextMount: boolean,
  operation: string,
): Promise<void> {
  const mountedSource = await ssh([
    "findmnt",
    "--noheadings",
    "--output",
    "SOURCE",
    "--mountpoint",
    remoteMountPath,
  ], { check: false, stdout: "piped", stderr: "null" });
  if (mountedSource.code !== 0) {
    throw new Error(
      `Persistent storage is not mounted at ${remoteMountPath}; refusing ${operation}.`,
    );
  }
  if (
    !allowPlaintextMount &&
    mountedSource.stdout !== STORAGE_MAPPER_PATH
  ) {
    throw new Error(
      `${remoteMountPath} is mounted from ${mountedSource.stdout}, not the ` +
        `expected encrypted storage; refusing ${operation}.`,
    );
  }
}
