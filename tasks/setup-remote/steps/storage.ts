import { promptSecret } from "@std/cli/prompt-secret";
import { run } from "../../utils/run.ts";
import {
  ETC_ROOT,
  REMOTE_PATHS,
  STORAGE_MAPPER_NAME,
  STORAGE_MAPPER_PATH,
  SYSTEM_PATHS,
} from "../../utils/remote-paths.ts";
import { USB_FILESYSTEM_LABEL } from "../../utils/infrastructure.ts";
import type { Config } from "../load-config.ts";
import { ensureFile, pathExists, type StepResult } from "../step-helpers.ts";

const AUTOMATIC_KEY_SLOT = "1";

export async function ensureStorageMounted(
  config: Config,
): Promise<StepResult> {
  await ensureMountPoint(REMOTE_PATHS.storageMount);

  const mountedSource = await findMountedSource(REMOTE_PATHS.storageMount);
  const device = await labeledDevice(USB_FILESYSTEM_LABEL);
  if (mountedSource === STORAGE_MAPPER_PATH) {
    if (device === undefined || !await deviceIsLuks(device)) {
      throw new Error(
        `${STORAGE_MAPPER_PATH} is mounted, but no matching LUKS device ` +
          `has label '${USB_FILESYSTEM_LABEL}'.`,
      );
    }
    const replacedAutomaticKey = await ensureAutomaticKey(device);
    await ensureBootConfiguration(device);
    return {
      label: `Encrypted storage mounted at ${REMOTE_PATHS.storageMount}`,
      changed: replacedAutomaticKey,
      detail: replacedAutomaticKey ? "automatic key replaced" : undefined,
    };
  }

  if (device === undefined) {
    return await provisionFreshStorage();
  }

  const isLuks = await deviceIsLuks(device);
  if (isLuks) {
    if (mountedSource !== undefined) {
      throw new Error(
        `${REMOTE_PATHS.storageMount} is mounted from unexpected source ${mountedSource}.`,
      );
    }
    return await recoverOrMountLuksStorage(device);
  }

  if (mountedSource !== undefined && mountedSource !== device) {
    throw new Error(
      `${REMOTE_PATHS.storageMount} is mounted from ${mountedSource}, but label ` +
        `'${USB_FILESYSTEM_LABEL}' resolves to ${device}.`,
    );
  }
  if (!config.allowPlaintextStorageMigration) {
    throw new Error(
      `Plaintext storage ${device} requires the verified migration workflow. ` +
        "Run setup through `deno task setup-remote`; the remote installer " +
        "will not reformat it directly.",
    );
  }

  if (mountedSource !== undefined) {
    await run("umount", [REMOTE_PATHS.storageMount]);
  }
  return await formatEncryptedStorage(device, "migrated");
}

async function provisionFreshStorage(): Promise<StepResult> {
  console.log(
    `\nNo device labeled '${USB_FILESYSTEM_LABEL}' was found. Candidate disks:`,
  );
  await run("lsblk", [
    "-o",
    "NAME,PATH,SIZE,TYPE,FSTYPE,LABEL,MOUNTPOINTS",
  ]);

  const device = prompt(
    `\nEnter the partition to encrypt and format (for example ${SYSTEM_PATHS.devices}/sda1), ` +
      "or leave blank to abort:",
  )?.trim();
  if (!device) {
    throw new Error("No persistent-storage device was provided.");
  }
  if (
    !device.startsWith(`${SYSTEM_PATHS.devices}/`) ||
    !await pathExists(device)
  ) {
    throw new Error(`Storage device '${device}' does not exist under /dev.`);
  }
  console.log(
    `\nWARNING: This will erase all data on ${device} and create a LUKS2 volume.`,
  );
  const confirmation = prompt(
    `Type the exact device path '${device}' to continue:`,
  )
    ?.trim();
  if (confirmation !== device) {
    throw new Error("Storage formatting was not confirmed.");
  }

  return await formatEncryptedStorage(device, "formatted");
}

async function formatEncryptedStorage(
  device: string,
  detail: string,
): Promise<StepResult> {
  const passphrase = promptRecoveryPassphrase();
  if (await pathExists(STORAGE_MAPPER_PATH)) {
    throw new Error(
      `${STORAGE_MAPPER_PATH} already exists; refusing to format while an ` +
        "ambiguous device-mapper mapping is active.",
    );
  }
  await assertSafeFormattingTarget(device);

  await run("cryptsetup", [
    "luksFormat",
    "--type",
    "luks2",
    "--batch-mode",
    "--label",
    USB_FILESYSTEM_LABEL,
    "--key-slot",
    "0",
    "--key-file",
    "-",
    "--keyfile-size",
    passphraseByteLength(passphrase),
    device,
  ], { input: `${passphrase}\n` });

  await createAutomaticKey();
  await addAutomaticKey(device, passphrase);
  await verifyAutomaticKey(device);
  await openStorage(device);
  await run("mkfs.ext4", ["-F", STORAGE_MAPPER_PATH]);
  await ensureBootConfiguration(device);
  await activateConfiguredStorage(REMOTE_PATHS.storageMount);

  return {
    label: `Encrypted storage mounted at ${REMOTE_PATHS.storageMount}`,
    changed: true,
    detail,
  };
}

async function recoverOrMountLuksStorage(device: string): Promise<StepResult> {
  let replacedAutomaticKey = false;
  replacedAutomaticKey = await ensureAutomaticKey(device);

  await ensureBootConfiguration(device);
  await activateConfiguredStorage(REMOTE_PATHS.storageMount);

  return {
    label: `Encrypted storage mounted at ${REMOTE_PATHS.storageMount}`,
    changed: true,
    detail: replacedAutomaticKey ? "automatic key replaced" : "mounted",
  };
}

async function ensureAutomaticKey(device: string): Promise<boolean> {
  if (
    await pathExists(REMOTE_PATHS.storageKey) &&
    await automaticKeyWorks(device)
  ) {
    return false;
  }

  const passphrase = promptSecret(
    "Enter the LUKS recovery passphrase for the existing USB",
  );
  if (!passphrase) {
    throw new Error("A recovery passphrase is required to recover storage.");
  }
  await verifyPassphrase(device, passphrase);

  if (await keySlotIsActive(device, AUTOMATIC_KEY_SLOT)) {
    await run("cryptsetup", [
      "luksKillSlot",
      "--batch-mode",
      "--key-file",
      "-",
      "--keyfile-size",
      passphraseByteLength(passphrase),
      device,
      AUTOMATIC_KEY_SLOT,
    ], { input: `${passphrase}\n` });
  }
  await createAutomaticKey();
  await addAutomaticKey(device, passphrase);
  await verifyAutomaticKey(device);
  return true;
}

function promptRecoveryPassphrase(): string {
  const first = promptSecret(
    "Create a LUKS recovery passphrase (store it in your password manager)",
  );
  if (!first || first.length < 16) {
    throw new Error(
      "The LUKS recovery passphrase must be at least 16 characters.",
    );
  }
  const second = promptSecret("Repeat the LUKS recovery passphrase");
  if (first !== second) {
    throw new Error("The LUKS recovery passphrases did not match.");
  }
  return first;
}

async function createAutomaticKey(): Promise<void> {
  if (!await pathExists(ETC_ROOT)) {
    await run("install", [
      "-d",
      "-o",
      "root",
      "-g",
      "root",
      "-m",
      "0755",
      ETC_ROOT,
    ]);
  }
  const temporaryPath = `${REMOTE_PATHS.storageKey}.setup-tmp`;
  try {
    await run("install", [
      "-o",
      "root",
      "-g",
      "root",
      "-m",
      "0400",
      SYSTEM_PATHS.devNull,
      temporaryPath,
    ]);
    await run("dd", [
      `if=${SYSTEM_PATHS.randomDevice}`,
      `of=${temporaryPath}`,
      "bs=64",
      "count=1",
      "status=none",
    ]);
    await run("install", [
      "-o",
      "root",
      "-g",
      "root",
      "-m",
      "0400",
      temporaryPath,
      REMOTE_PATHS.storageKey,
    ]);
  } finally {
    await Deno.remove(temporaryPath).catch(() => {});
  }
}

async function assertSafeFormattingTarget(device: string): Promise<void> {
  const type = (await run("lsblk", [
    "--noheadings",
    "--nodeps",
    "--output",
    "TYPE",
    device,
  ], { stdout: "piped" })).stdout;
  if (type !== "disk" && type !== "part") {
    throw new Error(
      `${device} has unsupported block-device type '${type}'.`,
    );
  }

  const mounted = await run("lsblk", [
    "--noheadings",
    "--output",
    "MOUNTPOINTS",
    device,
  ], { stdout: "piped" });
  if (mounted.stdout !== "") {
    throw new Error(
      `${device} or one of its children is mounted; refusing to format it.`,
    );
  }

  const rootSource = (await run("findmnt", [
    "--noheadings",
    "--output",
    "SOURCE",
    "--target",
    "/",
  ], { stdout: "piped" })).stdout;
  const rootParent = (await run("lsblk", [
    "--noheadings",
    "--nodeps",
    "--output",
    "PKNAME",
    rootSource,
  ], { stdout: "piped", check: false })).stdout;
  const deviceName = device.split("/").at(-1);
  if (
    device === rootSource ||
    deviceName === rootParent ||
    rootSource.startsWith(`${device}`)
  ) {
    throw new Error(
      `${device} backs the root filesystem; refusing to format.`,
    );
  }
}

async function addAutomaticKey(
  device: string,
  passphrase: string,
): Promise<void> {
  await run("cryptsetup", [
    "luksAddKey",
    "--batch-mode",
    "--key-slot",
    AUTOMATIC_KEY_SLOT,
    "--key-file",
    "-",
    "--keyfile-size",
    passphraseByteLength(passphrase),
    device,
    REMOTE_PATHS.storageKey,
  ], { input: `${passphrase}\n` });
}

async function verifyAutomaticKey(device: string): Promise<void> {
  if (!await automaticKeyWorks(device)) {
    throw new Error("The generated automatic LUKS key failed verification.");
  }
}

async function automaticKeyWorks(device: string): Promise<boolean> {
  if (!await pathExists(REMOTE_PATHS.storageKey)) return false;
  const { code } = await run("cryptsetup", [
    "open",
    "--test-passphrase",
    "--key-file",
    REMOTE_PATHS.storageKey,
    device,
  ], { check: false, stdin: "null", stdout: "piped", stderr: "null" });
  return code === 0;
}

async function verifyPassphrase(
  device: string,
  passphrase: string,
): Promise<void> {
  const { code } = await run("cryptsetup", [
    "open",
    "--test-passphrase",
    "--key-file",
    "-",
    "--keyfile-size",
    passphraseByteLength(passphrase),
    device,
  ], {
    input: `${passphrase}\n`,
    check: false,
    stdout: "piped",
    stderr: "null",
  });
  if (code !== 0) {
    throw new Error("The LUKS recovery passphrase is not valid for this USB.");
  }
}

function passphraseByteLength(passphrase: string): string {
  return new TextEncoder().encode(passphrase).byteLength.toString();
}

async function keySlotIsActive(
  device: string,
  slot: string,
): Promise<boolean> {
  const { stdout } = await run("cryptsetup", [
    "luksDump",
    "--dump-json-metadata",
    device,
  ], { stdout: "piped" });
  const metadata: unknown = JSON.parse(stdout);
  if (!isRecord(metadata) || !isRecord(metadata.keyslots)) {
    throw new Error(`Could not read LUKS keyslot metadata from ${device}.`);
  }
  return Object.hasOwn(metadata.keyslots, slot);
}

async function openStorage(device: string): Promise<void> {
  if (await pathExists(STORAGE_MAPPER_PATH)) {
    if (!await mapperBacksDevice(device)) {
      throw new Error(
        `${STORAGE_MAPPER_PATH} exists but does not map ${device}.`,
      );
    }
    return;
  }
  await run("cryptsetup", [
    "open",
    "--key-file",
    REMOTE_PATHS.storageKey,
    device,
    STORAGE_MAPPER_NAME,
  ]);
}

async function mapperBacksDevice(device: string): Promise<boolean> {
  const { stdout } = await run("cryptsetup", [
    "status",
    STORAGE_MAPPER_NAME,
  ], { stdout: "piped" });
  const mappedDevice = stdout.match(/^\s*device:\s*(\S+)\s*$/m)?.[1];
  if (mappedDevice === undefined) return false;
  const expected =
    (await run("realpath", [device], { stdout: "piped" })).stdout;
  const actual = (await run("realpath", [mappedDevice], {
    stdout: "piped",
  })).stdout;
  return expected === actual;
}

async function activateConfiguredStorage(mountPath: string): Promise<void> {
  const escapedMapperName = STORAGE_MAPPER_NAME.replaceAll("-", "\\x2d");
  const unit = `systemd-cryptsetup@${escapedMapperName}.service`;
  await run("systemctl", ["stop", unit], { check: false });
  if (await pathExists(STORAGE_MAPPER_PATH)) {
    await run("cryptsetup", ["close", STORAGE_MAPPER_NAME]);
  }
  const start = await run("systemctl", ["start", unit], {
    check: false,
    stdout: "piped",
  });
  if (start.code !== 0) {
    throw new Error(
      `Could not start ${unit}. Verify the systemd-cryptsetup package is ` +
        `installed and ${SYSTEM_PATHS.crypttab} contains the ${STORAGE_MAPPER_NAME} entry.`,
    );
  }
  await run("mount", [mountPath]);
  await verifyMountedSource(mountPath);
}

async function ensureBootConfiguration(device: string): Promise<void> {
  const uuid = (await run("cryptsetup", ["luksUUID", device], {
    stdout: "piped",
  })).stdout;
  if (!uuid) {
    throw new Error(`Could not determine the LUKS UUID for ${device}.`);
  }

  const crypttab = await readSystemFile(SYSTEM_PATHS.crypttab);
  const crypttabLine =
    `${STORAGE_MAPPER_NAME} UUID=${uuid} ${REMOTE_PATHS.storageKey} luks,nofail`;
  await ensureFile(
    SYSTEM_PATHS.crypttab,
    replaceTableEntry(crypttab, STORAGE_MAPPER_NAME, 0, crypttabLine),
    "root",
    "root",
    "600",
  );

  const fstab = await readSystemFile(SYSTEM_PATHS.fstab);
  const fstabLine =
    `${STORAGE_MAPPER_PATH} ${REMOTE_PATHS.storageMount} ext4 ` +
    "defaults,noatime,nofail,x-systemd.device-timeout=30s 0 2";
  await ensureFile(
    SYSTEM_PATHS.fstab,
    replaceTableEntry(fstab, REMOTE_PATHS.storageMount, 1, fstabLine),
    "root",
    "root",
    "644",
  );
  await run("systemctl", ["daemon-reload"]);
}

export function replaceTableEntry(
  current: string,
  identity: string,
  fieldIndex: number,
  replacement: string,
): string {
  const retained = current
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return true;
      return trimmed.split(/\s+/)[fieldIndex] !== identity;
    });
  while (retained.at(-1) === "") retained.pop();
  return [...retained, replacement, ""].join("\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function readSystemFile(path: string): Promise<string> {
  try {
    return await Deno.readTextFile(path);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return "";
    throw error;
  }
}

async function ensureMountPoint(path: string): Promise<void> {
  await run("install", [
    "-d",
    "-o",
    "root",
    "-g",
    "root",
    "-m",
    "0755",
    path,
  ]);
}

async function findMountedSource(path: string): Promise<string | undefined> {
  const { code, stdout } = await run("findmnt", [
    "--noheadings",
    "--output",
    "SOURCE",
    "--mountpoint",
    path,
  ], { stdout: "piped", check: false, stderr: "null" });
  return code === 0 && stdout ? stdout : undefined;
}

async function verifyMountedSource(path: string): Promise<void> {
  const source = await findMountedSource(path);
  if (source !== STORAGE_MAPPER_PATH) {
    throw new Error(
      `${path} was expected to be mounted from ${STORAGE_MAPPER_PATH}, got ${
        source ?? "nothing"
      }.`,
    );
  }
}

async function labeledDevice(label: string): Promise<string | undefined> {
  const { code, stdout } = await run("blkid", [
    "-t",
    `LABEL=${label}`,
    "-o",
    "device",
  ], {
    stdout: "piped",
    check: false,
    stderr: "null",
  });
  if (code !== 0 || !stdout) return undefined;
  const devices = stdout.split("\n").filter(Boolean);
  if (devices.length !== 1) {
    throw new Error(
      `Expected one device labeled '${label}', found ${devices.length}.`,
    );
  }
  return devices[0];
}

async function deviceIsLuks(device: string): Promise<boolean> {
  const { code } = await run("cryptsetup", ["isLuks", device], {
    check: false,
    stdout: "piped",
    stderr: "null",
  });
  return code === 0;
}
