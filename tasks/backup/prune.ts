import { join } from "@std/path";
import { DEFAULT_RETENTION, selectExpiredBackups } from "./retention.ts";

export async function pruneExpiredBackups(envRoot: string): Promise<void> {
  const names = [];
  try {
    for await (const entry of Deno.readDir(envRoot)) {
      if (entry.isDirectory && !entry.name.endsWith(".tmp")) {
        names.push(entry.name);
      }
    }
  } catch (error) {
    // The backup itself already succeeded, so a failure to prune must not fail
    // the task. On macOS, listing an iCloud folder raises EPERM until the
    // terminal is granted Full Disk Access, even though writing works.
    console.warn(
      `⚠️  Skipped retention: could not list ${envRoot} ` +
        `(${(error as Error).message}).`,
    );
    if (error instanceof Deno.errors.PermissionDenied) {
      console.warn(
        "⚠️  Grant your terminal Full Disk Access in System Settings > " +
          "Privacy & Security to enable automatic pruning.",
      );
    }
    return;
  }

  const expired = selectExpiredBackups(names, DEFAULT_RETENTION);
  for (const name of expired) {
    await Deno.remove(join(envRoot, name), { recursive: true });
    console.log(`🗑️  Pruned expired backup ${name}`);
  }
  console.log(
    `✅ Retention: kept ${names.length - expired.length} backup(s) ` +
      `(${DEFAULT_RETENTION.daily} daily, ${DEFAULT_RETENTION.weekly} weekly, ` +
      `${DEFAULT_RETENTION.monthly} monthly).`,
  );
}
