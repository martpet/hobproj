import { getRequiredEnv } from "@shared/environment.ts";
import { exists } from "@std/fs";
import { join } from "@std/path";
import type { RemoteEnvName } from "../utils/environment.ts";
import { REMOTE_PATHS } from "../utils/remote-paths.ts";
import { createRemoteDatabaseBackup } from "./database.ts";
import { loadBackupEnv } from "./load-env.ts";
import { BACKUP_ROOT_ENV, MIGRATION_BACKUP_DIR } from "./constants.ts";

const envName = Deno.args[0] as RemoteEnvName | undefined;
if (envName !== "staging" && envName !== "prod") {
  throw new Error("Usage: deno task backup-db <staging|prod>.");
}

await loadBackupEnv();
const migrationRoot = join(
  getRequiredEnv(BACKUP_ROOT_ENV),
  MIGRATION_BACKUP_DIR,
);
if (await exists(migrationRoot)) {
  for await (const label of Deno.readDir(migrationRoot)) {
    if (
      label.isDirectory &&
      await exists(join(migrationRoot, label.name, "state.json"))
    ) {
      throw new Error(
        "A storage migration is in progress. Resume `deno task setup-remote` " +
          "before running routine database backups.",
      );
    }
  }
}
await createRemoteDatabaseBackup(envName, {
  remoteMountPath: REMOTE_PATHS.storageMount,
});
