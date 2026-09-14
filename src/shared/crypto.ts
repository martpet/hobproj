import { encodeBase64Url } from "@std/encoding";

export function generateToken() {
  return encodeBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}
