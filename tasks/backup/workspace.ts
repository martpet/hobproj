import { join } from "@std/path";

export interface BackupWorkspace {
  readonly finalDir: string;
  readonly publishTempDir: string;
  readonly stagingDir: string;
}

export async function createBackupWorkspace(
  backupRoot: string,
  category: string,
  stagingPrefix: string,
): Promise<BackupWorkspace> {
  const timestamp = new Date().toISOString().replaceAll(":", "-");
  const finalDir = join(backupRoot, category, timestamp);
  return {
    finalDir,
    publishTempDir: `${finalDir}.tmp`,
    stagingDir: await Deno.makeTempDir({ prefix: stagingPrefix }),
  };
}
