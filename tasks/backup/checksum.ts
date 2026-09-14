import { run } from "../utils/run.ts";

export async function fileSha256(path: string): Promise<string> {
  const { stdout } = await run("shasum", ["-a", "256", path], {
    stdout: "piped",
  });
  const [hash] = stdout.trim().split(/\s+/);
  if (!hash) {
    throw new Error(`shasum produced no output for ${path}.`);
  }
  return hash;
}

// Backups are only trustworthy if the archive matches what was written, so
// both restore paths verify before extracting anything.
export async function verifyChecksum(
  archivePath: string,
  manifestPath: string,
  key: "archive_sha256" | "local_env_sha256",
): Promise<void> {
  const manifest = await Deno.readTextFile(manifestPath);
  const expected = manifest.match(new RegExp(`^${key}=(\\S+)$`, "m"))?.[1];
  if (expected === undefined) {
    throw new Error(`Backup manifest does not contain ${key}.`);
  }

  const actual = await fileSha256(archivePath);
  if (actual !== expected) {
    throw new Error("Backup archive checksum does not match its manifest.");
  }
}
