import { dirname, join } from "@std/path";
import { exists } from "@std/fs";
import { run } from "../utils/run.ts";
import { verifyChecksum } from "./checksum.ts";
import { loadBackupEnv } from "./load-env.ts";
import { resolveEncryptionPassword } from "./password.ts";
import { decryptBackupFile } from "./crypto.ts";

// Restores a remote environment's SQLite database from a `backup-db`
// archive, verifying its checksum first. target-dir defaults to
// ./restored-db, relative to the current working directory, if omitted.
//
// Usage: deno task restore-db <database.tar.gz.enc> [target-dir]
const encryptedArchive = Deno.args[0];
if (encryptedArchive === undefined) {
  throw new Error(
    "Usage: deno task restore-db <database.tar.gz.enc> [target-dir].",
  );
}
if (encryptedArchive.endsWith("local-env.tar.gz.enc")) {
  throw new Error(
    "That is the env files archive. Use `deno task restore-local-env` " +
      "to recover env files.",
  );
}

const targetRoot = Deno.args[1] ?? "./restored-db";
if (await exists(targetRoot)) {
  throw new Error(
    `"${targetRoot}" already exists. Remove it or name another directory; ` +
      "never point this at your local dev database.",
  );
}

await loadBackupEnv();

const password = await resolveEncryptionPassword();
const tempDir = await Deno.makeTempDir({ prefix: "hobproj-restore-" });
const decryptedArchive = join(tempDir, "database.tar.gz");

try {
  await decryptBackupFile(encryptedArchive, decryptedArchive, password);

  const manifestPath = join(dirname(encryptedArchive), "manifest.txt");
  await verifyChecksum(decryptedArchive, manifestPath, "archive_sha256");

  await Deno.mkdir(targetRoot, { recursive: true });
  await run("tar", [
    "-xzf",
    decryptedArchive,
    "-C",
    targetRoot,
  ]);

  const entries = [];
  for await (const entry of Deno.readDir(targetRoot)) {
    if (entry.isFile && entry.name.endsWith(".sqlite")) {
      entries.push(entry.name);
    }
  }
  const [fileName] = entries;
  if (entries.length !== 1 || !fileName) {
    throw new Error("Restored archive must contain exactly one SQLite file.");
  }
  const databasePath = join(targetRoot, fileName);
  await run("sqlite3", [databasePath, "PRAGMA integrity_check;"]);
  console.log(`✅ Restored database passed integrity check: ${databasePath}`);
} finally {
  await Deno.remove(tempDir, { recursive: true });
}
