import { getRequiredEnv } from "@shared/environment.ts";
import { exists } from "@std/fs";
import { join } from "@std/path";
import { createRemoteClients } from "../utils/remote.ts";
import { SYSTEM_PATHS } from "../utils/remote-paths.ts";
import { fileSha256 } from "./checksum.ts";
import { resolveEncryptionPassword } from "./password.ts";
import { decryptBackupFile, encryptBackupFile } from "./crypto.ts";
import { BACKUP_ROOT_ENV, LUKS_HEADER_BACKUP_DIR } from "./constants.ts";
import { createBackupWorkspace } from "./workspace.ts";

export async function backupRemoteLuksHeader(
  filesystemLabel: string,
): Promise<string | undefined> {
  const backupRoot = getRequiredEnv(BACKUP_ROOT_ENV);
  const { ssh, scp } = createRemoteClients();
  const password = await resolveEncryptionPassword();
  const { finalDir, publishTempDir, stagingDir } = await createBackupWorkspace(
    backupRoot,
    LUKS_HEADER_BACKUP_DIR,
    "hobproj-luks-header-",
  );
  const localHeader = join(stagingDir, "luks-header.bin");
  const encryptedHeader = join(stagingDir, "luks-header.bin.enc");
  const verifiedHeader = join(stagingDir, "luks-header.verified.bin");
  let remoteTempDir: string | undefined;

  const deviceOutput = (await ssh([
    "sudo",
    "blkid",
    "-t",
    `LABEL=${filesystemLabel}`,
    "-o",
    "device",
  ], { stdout: "piped" })).stdout;
  const devices = deviceOutput.split("\n").filter(Boolean);
  if (devices.length !== 1) {
    throw new Error(`No remote device has label '${filesystemLabel}'.`);
  }
  const device = devices[0]!;
  const uuid = (await ssh(["sudo", "cryptsetup", "luksUUID", device], {
    stdout: "piped",
  })).stdout;
  const remoteUser = (await ssh(["id", "-un"], { stdout: "piped" })).stdout;

  try {
    remoteTempDir = (await ssh([
      "sudo",
      "mktemp",
      "-d",
      `${SYSTEM_PATHS.temp}/hobproj-luks-header.XXXXXX`,
    ], { stdout: "piped" })).stdout;
    if (
      !remoteTempDir.startsWith(`${SYSTEM_PATHS.temp}/hobproj-luks-header.`)
    ) {
      throw new Error("Remote mktemp returned an unexpected header path.");
    }
    await ssh(["sudo", "chmod", "0711", remoteTempDir]);
    const remoteHeader = `${remoteTempDir}/luks-header.bin`;
    await ssh([
      "sudo",
      "cryptsetup",
      "luksHeaderBackup",
      device,
      "--header-backup-file",
      remoteHeader,
    ]);
    await ssh(["sudo", "chown", remoteUser, remoteHeader]);
    await ssh(["sudo", "chmod", "0600", remoteHeader]);
    await scp.download(remoteHeader, localHeader);
    const hash = await fileSha256(localHeader);

    if (await existingHeaderBackupMatches(backupRoot, uuid, hash)) {
      console.log("✓ Current LUKS header already has an encrypted backup.");
      return undefined;
    }

    await encryptBackupFile(localHeader, encryptedHeader, password);
    await decryptBackupFile(encryptedHeader, verifiedHeader, password);
    const verifiedHash = await fileSha256(verifiedHeader);
    if (verifiedHash !== hash) {
      throw new Error("Encrypted LUKS header failed round-trip verification.");
    }

    const encryptedHash = await fileSha256(encryptedHeader);
    await Deno.mkdir(publishTempDir, { recursive: true });
    await Deno.rename(
      encryptedHeader,
      join(publishTempDir, "luks-header.bin.enc"),
    );
    await Deno.remove(localHeader);
    await Deno.writeTextFile(
      join(publishTempDir, "manifest.txt"),
      [
        `created_at=${new Date().toISOString()}`,
        `luks_uuid=${uuid}`,
        `source_device=${device}`,
        `header_sha256=${hash}`,
        `encrypted_header_sha256=${encryptedHash}`,
        "format=luks2-header",
        "",
      ].join("\n"),
    );
    await Deno.rename(publishTempDir, finalDir);
    console.log(`✅ Encrypted LUKS header backup written to ${finalDir}`);
    return finalDir;
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

async function existingHeaderBackupMatches(
  backupRoot: string,
  uuid: string,
  hash: string,
): Promise<boolean> {
  const root = join(backupRoot, LUKS_HEADER_BACKUP_DIR);
  if (!await exists(root)) return false;

  for await (const entry of Deno.readDir(root)) {
    if (!entry.isDirectory || entry.name.endsWith(".tmp")) continue;
    const manifestPath = join(root, entry.name, "manifest.txt");
    try {
      const manifest = await Deno.readTextFile(manifestPath);
      if (
        manifest.includes(`luks_uuid=${uuid}\n`) &&
        manifest.includes(`header_sha256=${hash}\n`) &&
        await exists(join(root, entry.name, "luks-header.bin.enc"))
      ) {
        return true;
      }
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
    }
  }
  return false;
}
