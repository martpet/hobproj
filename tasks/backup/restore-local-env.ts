import { exists } from "@std/fs";
import { dirname, join } from "@std/path";
import { run } from "../utils/run.ts";
import { verifyChecksum } from "./checksum.ts";
import { resolveEncryptionPassword } from "./password.ts";
import { decryptBackupFile } from "./crypto.ts";

// Recovers the env files from a backup's `local-env.tar.gz.enc`. target-dir
// defaults to ./restored-local-env, relative to the current working
// directory, if omitted.
//
// Usage: deno task restore-local-env <local-env.tar.gz.enc> [target-dir]

const encryptedArchive = Deno.args[0];
if (encryptedArchive === undefined) {
  throw new Error(
    "Usage: deno task restore-local-env <local-env.tar.gz.enc> [target-dir].",
  );
}
if (!encryptedArchive.endsWith("local-env.tar.gz.enc")) {
  throw new Error(
    "Expected a local-env.tar.gz.enc archive. Use `deno task restore-db` " +
      "for the database.",
  );
}

const targetRoot = Deno.args[1] ?? "./restored-local-env";
if (await exists(targetRoot)) {
  throw new Error(
    `"${targetRoot}" already exists. Remove it or name another directory so ` +
      "recovered secrets never overwrite existing files.",
  );
}

const password = await resolveEncryptionPassword();
const tempDir = await Deno.makeTempDir({ prefix: "hobproj-local-env-" });
const decryptedArchive = join(tempDir, "local-env.tar.gz");

try {
  await decryptBackupFile(encryptedArchive, decryptedArchive, password);

  const manifestPath = join(dirname(encryptedArchive), "manifest.txt");
  await verifyChecksum(decryptedArchive, manifestPath, "local_env_sha256");

  await Deno.mkdir(targetRoot, { recursive: true });
  await run("tar", [
    "-xzf",
    decryptedArchive,
    "-C",
    targetRoot,
    "--strip-components=1",
  ]);
  await Deno.chmod(targetRoot, 0o700);

  const recovered: string[] = [];
  for await (const path of walk(targetRoot)) {
    await Deno.chmod(path, 0o600);
    recovered.push(path);
  }
  recovered.sort();

  console.log(`✅ Recovered ${recovered.length} env file(s) to ${targetRoot}:`);
  for (const path of recovered) {
    console.log(`   ${path}`);
  }
  console.log(
    "⚠️  These are plaintext secrets. Move them into place, then delete the " +
      "directory.",
  );
} finally {
  await Deno.remove(tempDir, { recursive: true });
}

async function* walk(dir: string): AsyncGenerator<string> {
  for await (const entry of Deno.readDir(dir)) {
    const path = join(dir, entry.name);
    if (entry.isDirectory) {
      yield* walk(path);
    } else if (entry.isFile) {
      yield path;
    }
  }
}
