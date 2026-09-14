import type { DatabaseBackup } from "../backup/database.ts";
import {
  createRemoteDatabaseBackup,
  restoreRemoteDatabaseBackup,
} from "../backup/database.ts";
import { COLORS } from "./constants.ts";
import { getRequiredEnv } from "@shared/environment.ts";
import { exists } from "@std/fs";
import { dirname, join } from "@std/path";
import type { RemoteEnvName } from "../utils/environment.ts";
import { REMOTE_ENV_NAMES } from "../utils/environment.ts";
import type { SshClient } from "../utils/ssh.ts";
import { STORAGE_MAPPER_PATH } from "../utils/remote-paths.ts";
import { appServiceName } from "../utils/infrastructure.ts";
import { BACKUP_ROOT_ENV, MIGRATION_BACKUP_DIR } from "../backup/constants.ts";

export interface StorageMigration {
  readonly allowPlaintextMigration: boolean;
  complete(): Promise<void>;
  fail(): Promise<void>;
}

export async function prepareStorageMigration(
  ssh: SshClient,
  mountPath: string,
  filesystemLabel: string,
): Promise<StorageMigration> {
  const storageType = await detectStorageType(ssh, mountPath, filesystemLabel);
  const statePath = migrationStatePath(filesystemLabel);
  const existingState = await readMigrationState(statePath);
  if (existingState !== undefined) {
    if (storageType === "fresh") {
      throw new Error(
        `Migration journal ${statePath} exists, but the expected USB is absent.`,
      );
    }
    console.log(
      `\n↻ Resuming the recorded encrypted storage migration from ${statePath}.`,
    );
    if (existingState.status === "preparing") {
      if (storageType !== "plaintext") {
        throw new Error(
          "Migration journal is still preparing backups, but storage is no longer plaintext.",
        );
      }
      if (existingState.activeUnits.length > 0) {
        await ssh([
          "sudo",
          "systemctl",
          "stop",
          ...existingState.activeUnits,
        ]);
      }
      return await continuePlaintextMigration(
        ssh,
        mountPath,
        filesystemLabel,
        statePath,
        existingState,
      );
    }
    if (existingState.status === "restored") {
      await restartUnits(ssh, existingState.activeUnits);
      await Deno.remove(statePath).catch(() => {});
      return noMigration();
    }
    const currentlyActive = await activeApplicationUnits(ssh);
    const unitsToStop = [
      ...new Set([...existingState.activeUnits, ...currentlyActive]),
    ];
    if (unitsToStop.length > 0) {
      await ssh(["sudo", "systemctl", "stop", ...unitsToStop]);
    }
    if (storageType === "plaintext") {
      const preparingState: MigrationState = {
        status: "preparing",
        backups: [],
        activeUnits: unitsToStop,
      };
      await writeMigrationState(statePath, preparingState);
      return await continuePlaintextMigration(
        ssh,
        mountPath,
        filesystemLabel,
        statePath,
        preparingState,
      );
    }
    return resumableMigration(
      ssh,
      mountPath,
      statePath,
      { ...existingState, activeUnits: unitsToStop },
      false,
    );
  }
  if (storageType !== "plaintext") {
    return noMigration();
  }

  console.log(
    "\n🔐 Plaintext USB storage detected. Preparing a verified encrypted migration...",
  );
  const activeUnits = await activeApplicationUnits(ssh);
  const state: MigrationState = {
    status: "preparing",
    backups: [],
    activeUnits,
  };
  await writeMigrationState(statePath, state);
  if (activeUnits.length > 0) {
    await ssh(["sudo", "systemctl", "stop", ...activeUnits]);
  }
  return await continuePlaintextMigration(
    ssh,
    mountPath,
    filesystemLabel,
    statePath,
    state,
  );
}

async function continuePlaintextMigration(
  ssh: SshClient,
  mountPath: string,
  filesystemLabel: string,
  statePath: string,
  initialState: MigrationState,
): Promise<StorageMigration> {
  const backups = [...initialState.backups];
  let authorized = false;
  try {
    for (const envName of REMOTE_ENV_NAMES) {
      if (
        !backups.some((backup) => backup.environment === envName) &&
        await remoteDatabaseExists(ssh, mountPath, envName)
      ) {
        backups.push(
          await createRemoteDatabaseBackup(envName, {
            remoteMountPath: mountPath,
            allowPlaintextMount: true,
            backupRoot: dirname(statePath),
            prune: false,
          }),
        );
        await writeMigrationState(statePath, {
          ...initialState,
          backups,
        });
      }
    }

    console.log(
      backups.length === 0
        ? "No SQLite databases exist on the plaintext volume."
        : `Created ${backups.length} verified encrypted migration backup(s).`,
    );
    const answer = prompt(
      `Type 'encrypt ${filesystemLabel}' to erase the plaintext filesystem ` +
        "and migrate it to LUKS2:",
    )?.trim();
    if (answer !== `encrypt ${filesystemLabel}`) {
      throw new Error("Encrypted storage migration was not confirmed.");
    }
    authorized = true;
    const state: MigrationState = {
      status: "prepared",
      backups,
      activeUnits: initialState.activeUnits,
    };
    await writeMigrationState(statePath, state);
  } catch (error) {
    if (!authorized) {
      await restartUnits(ssh, initialState.activeUnits);
      await Deno.remove(statePath).catch(() => {});
    }
    throw error;
  }

  return resumableMigration(
    ssh,
    mountPath,
    statePath,
    { status: "prepared", backups, activeUnits: initialState.activeUnits },
    true,
  );
}

interface MigrationState {
  readonly status: "preparing" | "prepared" | "restored";
  readonly backups: DatabaseBackup[];
  readonly activeUnits: string[];
}

function resumableMigration(
  ssh: SshClient,
  mountPath: string,
  statePath: string,
  initialState: MigrationState,
  allowPlaintextMigration: boolean,
): StorageMigration {
  let state = initialState;
  let completed = false;
  return {
    allowPlaintextMigration,
    async complete(): Promise<void> {
      if (state.status === "prepared") {
        for (const backup of state.backups) {
          console.log(`Restoring ${backup.environment} database...`);
          await restoreRemoteDatabaseBackup(backup, mountPath);
        }
        state = { ...state, status: "restored" };
        await writeMigrationState(statePath, state);
      }
      await restartUnits(ssh, state.activeUnits);
      await Deno.remove(statePath).catch(() => {});
      completed = true;
      console.log("✅ Encrypted storage migration completed.");
    },
    fail(): Promise<void> {
      if (completed) return Promise.resolve();
      console.error(
        "\nStorage migration did not complete. Application services remain " +
          "stopped to prevent writes to an empty or partially restored volume.",
      );
      console.error(
        `Run setup-remote again to resume from migration journal ${statePath}.`,
      );
      if (state.backups.length > 0) {
        console.error(
          "The verified encrypted migration backups remain in BACKUP_LOCAL_PATH.",
        );
      }
      return Promise.resolve();
    },
  };
}

type StorageType = "fresh" | "luks" | "plaintext";

async function detectStorageType(
  ssh: SshClient,
  mountPath: string,
  filesystemLabel: string,
): Promise<StorageType> {
  const mounted = await ssh([
    "findmnt",
    "--noheadings",
    "--output",
    "FSTYPE",
    "--mountpoint",
    mountPath,
  ], { check: false, stdout: "piped", stderr: "null" });
  if (mounted.code === 0) {
    if (mounted.stdout === "ext4") {
      const source = await ssh([
        "findmnt",
        "--noheadings",
        "--output",
        "SOURCE",
        "--mountpoint",
        mountPath,
      ], { stdout: "piped" });
      return source.stdout === STORAGE_MAPPER_PATH ? "luks" : "plaintext";
    }
    throw new Error(
      `${mountPath} uses unsupported filesystem '${mounted.stdout}'.`,
    );
  }

  const device = await ssh([
    "sudo",
    "blkid",
    "-t",
    `LABEL=${filesystemLabel}`,
    "-o",
    "device",
  ], { check: false, stdout: "piped", stderr: "null" });
  if (device.code !== 0 || !device.stdout) return "fresh";
  const devices = device.stdout.split("\n").filter(Boolean);
  if (devices.length !== 1) {
    throw new Error(
      `Expected one device labeled '${filesystemLabel}', found ${devices.length}.`,
    );
  }
  const [storageDevice] = devices;
  if (storageDevice === undefined) return "fresh";

  const filesystemType = await ssh([
    "sudo",
    "blkid",
    "-s",
    "TYPE",
    "-o",
    "value",
    storageDevice,
  ], { stdout: "piped" });
  if (filesystemType.stdout === "crypto_LUKS") return "luks";
  if (filesystemType.stdout !== "ext4") {
    throw new Error(
      `${storageDevice} has unsupported type '${filesystemType.stdout}'.`,
    );
  }

  const mount = await ssh(["sudo", "mount", mountPath], {
    check: false,
    stdout: "piped",
  });
  if (mount.code !== 0) {
    throw new Error(
      `Plaintext storage ${storageDevice} is not mounted and could not be ` +
        `mounted at ${mountPath}; migration cannot create verified backups.`,
    );
  }
  return "plaintext";
}

async function activeApplicationUnits(
  ssh: SshClient,
): Promise<string[]> {
  const active = [];
  for (const envName of REMOTE_ENV_NAMES) {
    for (const color of COLORS) {
      const unit = `${appServiceName(envName, color)}.service`;
      const result = await ssh(
        ["sudo", "systemctl", "is-active", "--quiet", unit],
        { check: false, stdout: "piped", stderr: "null" },
      );
      if (result.code === 0) active.push(unit);
    }
  }
  return active;
}

async function remoteDatabaseExists(
  ssh: SshClient,
  mountPath: string,
  envName: RemoteEnvName,
): Promise<boolean> {
  const result = await ssh([
    "sudo",
    "test",
    "-f",
    `${mountPath}/${envName}/db/kv.sqlite`,
  ], { check: false });
  return result.code === 0;
}

async function restartUnits(
  ssh: SshClient,
  units: string[],
): Promise<void> {
  if (units.length > 0) {
    await ssh(["sudo", "systemctl", "start", ...units]);
  }
}

function noMigration(): StorageMigration {
  return {
    allowPlaintextMigration: false,
    complete: () => Promise.resolve(),
    fail: () => Promise.resolve(),
  };
}

function migrationStatePath(filesystemLabel: string): string {
  return join(
    getRequiredEnv(BACKUP_ROOT_ENV),
    MIGRATION_BACKUP_DIR,
    encodeURIComponent(filesystemLabel),
    "state.json",
  );
}

async function readMigrationState(
  path: string,
): Promise<MigrationState | undefined> {
  if (!await exists(path)) return undefined;
  const value: unknown = JSON.parse(await Deno.readTextFile(path));
  if (
    !isRecord(value) ||
    (value.status !== "preparing" &&
      value.status !== "prepared" &&
      value.status !== "restored") ||
    !Array.isArray(value.backups) ||
    !Array.isArray(value.activeUnits) ||
    !value.activeUnits.every((unit) => typeof unit === "string")
  ) {
    throw new Error(`Migration journal ${path} is invalid.`);
  }
  const backups = value.backups.map(parseDatabaseBackup);
  for (const backup of backups) {
    if (
      !await exists(backup.encryptedArchive) ||
      !await exists(backup.manifest)
    ) {
      throw new Error(
        `Migration backup for ${backup.environment} is missing. Expected ` +
          `${backup.encryptedArchive} and ${backup.manifest}.`,
      );
    }
  }
  return { status: value.status, backups, activeUnits: value.activeUnits };
}

function parseDatabaseBackup(value: unknown): DatabaseBackup {
  if (
    !isRecord(value) ||
    (value.environment !== "staging" && value.environment !== "prod") ||
    typeof value.encryptedArchive !== "string" ||
    typeof value.manifest !== "string"
  ) {
    throw new Error("Migration journal contains an invalid database backup.");
  }
  return {
    environment: value.environment,
    encryptedArchive: value.encryptedArchive,
    manifest: value.manifest,
  };
}

async function writeMigrationState(
  path: string,
  state: MigrationState,
): Promise<void> {
  await Deno.mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp`;
  await Deno.writeTextFile(
    temporaryPath,
    `${JSON.stringify(state, null, 2)}\n`,
  );
  await Deno.rename(temporaryPath, path);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
