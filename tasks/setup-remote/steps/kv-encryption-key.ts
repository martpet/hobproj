import { promptSecret } from "@std/cli/prompt-secret";
import { encodeBase64 } from "@std/encoding";
import { run } from "../../utils/run.ts";
import {
  REMOTE_ENV_NAMES,
  type RemoteEnvName,
} from "../../utils/environment.ts";
import { EXECUTABLE_PATHS, REMOTE_PATHS } from "../../utils/remote-paths.ts";
import {
  KV_ENCRYPTION_KEY_CREDENTIAL,
  kvEncryptionKeyPath,
  SECRET_STORE_DIR,
  validateKvEncryptionKey,
} from "../secrets.ts";
import { pathExists, type StepResult } from "../step-helpers.ts";

// The key each environment's app uses to encrypt sensitive KV fields (see
// `src/shared/crypto/`). Generated here rather than entered by hand, because it
// is 32 random bytes rather than a passphrase, and nothing outside the machine
// needs to choose it.
//
// Three rules matter:
//
//   - One key per environment, drawn independently. Prod's key can neither
//     decrypt staging's records nor reproduce its blind indexes, so a leak of
//     one environment's key tells you nothing about the other.
//   - Never regenerated behind your back: an existing file is left untouched,
//     because the old key is the only thing that can read what is stored.
//   - A missing key with a database already on the USB is the dangerous case.
//     It means the credential was lost with the SD card it lived on, and
//     generating a fresh one would orphan every encrypted field. That is the
//     one case this step refuses to decide on its own.
const KEY_LENGTH = 32;

function databasePath(env: RemoteEnvName) {
  return `${REMOTE_PATHS.storageMount}/${env}/db/kv.sqlite`;
}

async function storeKey(env: RemoteEnvName, key: string) {
  const path = kvEncryptionKeyPath(env);
  const tempPath = `${path}.tmp`;

  // Piped on stdin, so the plaintext key never lands in a file or in `ps`.
  await run(EXECUTABLE_PATHS.systemdCreds, [
    "encrypt",
    `--name=${KV_ENCRYPTION_KEY_CREDENTIAL}`,
    "-",
    tempPath,
  ], { input: key });
  await run("chmod", ["0600", tempPath]);
  await run("mv", ["-f", tempPath, path]);
}

// Hidden input, so a restored key stays out of the terminal scrollback.
// `null` means none was given, and a new one should be generated.
function promptForSavedKey(env: RemoteEnvName): string | null {
  const value = promptSecret(
    `Paste the saved ${env} key, or press Enter to generate a new one`,
  )?.trim();

  if (!value) return null;

  validateKvEncryptionKey(value);
  return value;
}

function confirmReplacingLostKey(env: RemoteEnvName): boolean {
  console.log(
    `\n⚠️  ${databasePath(env)} exists, but its encryption key does not.\n` +
      "   The key was lost with the SD card it lived on. Generating a new\n" +
      "   one leaves every encrypted field in that database permanently\n" +
      "   unreadable — every session, though accounts and passkeys survive.\n" +
      "   If the key is in your password manager, abort and restore it.",
  );

  return prompt(`Type 'generate ${env}' to create a new key:`)?.trim() ===
    `generate ${env}`;
}

export async function ensureKvEncryptionKeys(): Promise<StepResult[]> {
  const results: StepResult[] = [];
  const generated: RemoteEnvName[] = [];

  await run("mkdir", ["-p", SECRET_STORE_DIR]);
  await run("chmod", ["0700", SECRET_STORE_DIR]);

  for (const env of REMOTE_ENV_NAMES) {
    const label = `KV encryption key (${env})`;

    if (await pathExists(kvEncryptionKeyPath(env))) {
      results.push({ label, changed: false });
      continue;
    }

    console.log(`\n🔑 No KV encryption key for ${env}.`);
    const savedKey = promptForSavedKey(env);

    if (savedKey !== null) {
      await storeKey(env, savedKey);
      results.push({ label, changed: true, detail: "restored" });
      console.log(`✅ Restored the ${env} key.`);
      continue;
    }

    // A lost key only costs something once there is data encrypted under it.
    if (await pathExists(databasePath(env)) && !confirmReplacingLostKey(env)) {
      throw new Error(
        `No ${label} was provided, and generating a new one was not ` +
          "confirmed. Restore the saved key, then run setup again.",
      );
    }

    const key = encodeBase64(
      crypto.getRandomValues(new Uint8Array(KEY_LENGTH)),
    );
    await storeKey(env, key);
    results.push({ label, changed: true, detail: "generated" });
    generated.push(env);

    // Shown once: this is the only moment the key exists anywhere other than
    // this machine's disk, and nothing can recover it afterwards.
    console.log(
      `\n🔐 New ${env} KV encryption key — copy it into your password ` +
        `manager now:\n\n     ${key}\n`,
    );
  }

  if (generated.length > 0) {
    console.log(
      "\n⚠️  The key(s) above are encrypted to this machine, so a database\n" +
        "   backup is unreadable without them, and reformatting the SD card\n" +
        "   destroys them. To read one again later:\n" +
        generated.map((env) =>
          `     sudo ${EXECUTABLE_PATHS.systemdCreds} decrypt ` +
          `--name=${KV_ENCRYPTION_KEY_CREDENTIAL} ${kvEncryptionKeyPath(env)} -`
        ).join("\n") +
        "\n   A saved key goes back on a rebuilt machine with\n" +
        `   "deno task set-secret ${KV_ENCRYPTION_KEY_CREDENTIAL}_<env>".`,
    );
  }

  return results;
}
