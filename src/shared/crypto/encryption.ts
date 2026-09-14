import { decodeBase64Url, encodeBase64Url } from "@std/encoding";
import { encryptionKeys } from "./key.ts";

// Encryption for values that are stored rather than transmitted: a database
// field, a cached payload, anything that would otherwise sit in the clear in a
// file or a backup. Two primitives, because a value that is only *stored* and a
// value that is also *looked up by* cannot be protected the same way:
//
//   - `encryptValue` is randomized (fresh IV per call), which is what you want
//     for stored data: the same plaintext never looks the same twice.
//   - `blindIndex` is a keyed hash, and therefore deterministic, because a
//     value used to find a record has to match byte-for-byte between the write
//     and the later lookup. It leaks which records share a value, which for a
//     random token reveals nothing.
//
// Both take a `scope` — an arbitrary label such as `"session:cookie"` — that
// pins a value to the place it was written for: ciphertext moved elsewhere
// fails to authenticate, and blind indexes of the same plaintext under two
// scopes don't match.

const IV_LENGTH = 12;
// Tags the stored format so a future key rotation can recognise, and re-write,
// anything written before it.
const FORMAT_VERSION = "v1";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Whether this environment holds a key, and so can encrypt at all. */
export const isEncryptionEnabled = encryptionKeys !== null;

function requireKeys() {
  if (!encryptionKeys) {
    throw new Error("The encryption key is not loaded");
  }
  return encryptionKeys;
}

/** `v1:<base64url(iv + ciphertext)>`, with a fresh IV on every call. */
export async function encryptValue(scope: string, plaintext: string) {
  const { cipherKey } = requireKeys();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: encoder.encode(scope) },
      cipherKey,
      encoder.encode(plaintext),
    ),
  );

  const payload = new Uint8Array(iv.length + ciphertext.length);
  payload.set(iv);
  payload.set(ciphertext, iv.length);

  return `${FORMAT_VERSION}:${encodeBase64Url(payload)}`;
}

/**
 * The plaintext behind `encryptValue`, or `null` when the value is malformed,
 * was written under a different key, or has been tampered with. Returning
 * `null` rather than throwing lets callers treat an unreadable value as a
 * missing one.
 */
export async function decryptValue(scope: string, stored: string) {
  const { cipherKey } = requireKeys();
  const separator = stored.indexOf(":");

  if (stored.slice(0, separator) !== FORMAT_VERSION) {
    return null;
  }

  try {
    const payload = decodeBase64Url(stored.slice(separator + 1));
    const iv = payload.subarray(0, IV_LENGTH);
    const ciphertext = payload.subarray(IV_LENGTH);

    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv as BufferSource,
        additionalData: encoder.encode(scope),
      },
      cipherKey,
      ciphertext as BufferSource,
    );

    return decoder.decode(plaintext);
  } catch {
    return null;
  }
}

/** A deterministic stand-in for `plaintext`, safe to use as a lookup key. */
export async function blindIndex(scope: string, plaintext: string) {
  const { indexKey } = requireKeys();

  const mac = await crypto.subtle.sign(
    "HMAC",
    indexKey,
    encoder.encode(`${scope}:${plaintext}`),
  );

  return `${FORMAT_VERSION}:${encodeBase64Url(new Uint8Array(mac))}`;
}
