import { decodeBase64 } from "@std/encoding";
import { IS_DEV } from "@shared/constants.ts";
import { getEnv } from "@shared/environment.ts";

// Where the key that protects stored data comes from, and the only module that
// knows. Everything else works through `encryption.ts`.

const CREDENTIAL_NAME = "kv_encryption_key";
const MASTER_KEY_LENGTH = 32;

export interface EncryptionKeys {
  /** Encrypts and decrypts stored values. */
  readonly cipherKey: CryptoKey;
  /** Derives blind indexes. */
  readonly indexKey: CryptoKey;
}

function decodeMasterKey(value: string, source: string) {
  let bytes: Uint8Array;

  try {
    bytes = decodeBase64(value.trim());
  } catch {
    throw new Error(`The encryption key from ${source} is not valid base64`);
  }

  if (bytes.length !== MASTER_KEY_LENGTH) {
    throw new Error(
      `The encryption key from ${source} is ${bytes.length} bytes; ` +
        `expected ${MASTER_KEY_LENGTH}`,
    );
  }

  return bytes;
}

// Staging and prod each hold their own independently generated key, handed to
// the unit by systemd (`LoadCredentialEncrypted=`) and readable only by that
// service. Dev has no credential directory: it runs unencrypted unless
// `KV_ENCRYPTION_KEY` is set, which is how a restored staging/prod database is
// read locally.
async function loadMasterKey() {
  if (IS_DEV) {
    const value = getEnv("KV_ENCRYPTION_KEY");
    return value === undefined
      ? null
      : decodeMasterKey(value, "KV_ENCRYPTION_KEY");
  }

  const directory = Deno.env.get("CREDENTIALS_DIRECTORY");

  if (!directory) {
    throw new Error(
      "CREDENTIALS_DIRECTORY is unset, so the encryption key cannot be " +
        `read. The unit needs LoadCredentialEncrypted=${CREDENTIAL_NAME}:...`,
    );
  }

  const path = `${directory}/${CREDENTIAL_NAME}`;
  let value: string;

  try {
    value = await Deno.readTextFile(path);
  } catch (cause) {
    throw new Error(`Cannot read the encryption key at ${path}`, { cause });
  }

  return decodeMasterKey(value, path);
}

// Encryption and blind indexing never touch the same bytes: each gets its own
// subkey, derived from the environment's master key under a distinct label.
async function deriveKeys(master: Uint8Array): Promise<EncryptionKeys> {
  const hkdf = await crypto.subtle.importKey(
    "raw",
    master as BufferSource,
    "HKDF",
    false,
    ["deriveKey"],
  );

  const parameters = (info: string) => ({
    name: "HKDF" as const,
    hash: "SHA-256",
    salt: new Uint8Array(),
    info: new TextEncoder().encode(info),
  });

  const [cipherKey, indexKey] = await Promise.all([
    crypto.subtle.deriveKey(
      parameters("kv-field-encryption"),
      hkdf,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    ),
    crypto.subtle.deriveKey(
      parameters("kv-blind-index"),
      hkdf,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    ),
  ]);

  return { cipherKey, indexKey };
}

const masterKey = await loadMasterKey();

/** The derived keys, or `null` where this environment holds no key at all. */
export const encryptionKeys = masterKey && await deriveKeys(masterKey);
