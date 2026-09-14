import { encodeBase64Url } from "@std/encoding";

const TOKEN_LENGTH = 32;

/** An unguessable opaque string, for cookies and other bearer tokens. */
export function generateRandomToken() {
  return encodeBase64Url(crypto.getRandomValues(new Uint8Array(TOKEN_LENGTH)));
}
