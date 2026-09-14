import { setFlashCookie } from "./cookie.ts";
import { FlashKey } from "./types.ts";

export function setFlash(headers: Headers, key: FlashKey) {
  setFlashCookie(headers, key);
}
