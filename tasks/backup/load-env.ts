import { BACKUP_ENV_PATH, loadTaskEnvironment } from "../utils/environment.ts";

// Loads `tasks/.env.tasks` merged with `tasks/backup/.env.backup` and sets the
// result on the process environment. Used by `backup` and `restore`, which
// aren't tied to a single staging/prod environment.
//
// Values already present in the environment win over the file, so a one-off
// `BACKUP_ENCRYPTION_PASSWORD=... deno task backup-db` overrides the stored one.
// Empty values are skipped so a placeholder key never shadows the Keychain.
export async function loadBackupEnv(): Promise<void> {
  await loadTaskEnvironment([{ path: BACKUP_ENV_PATH }], {
    preserveExisting: true,
    ignoreEmpty: true,
  });
}
