import { IS_DEV } from "@shared/constants.ts";
import { Context } from "@shared/context.ts";
import { deleteCookie, getCookies, setCookie } from "@std/http";
import { FLASH } from "./constants.ts";
import { FlashKey } from "./types.ts";

const FLASH_COOKIE = "flash";

const COOKIE_ATTRIBUTES = {
  path: "/",
  secure: !IS_DEV,
  httpOnly: true,
};

export function setFlashCookie(
  headers: Headers,
  value: FlashKey,
) {
  setCookie(headers, {
    name: FLASH_COOKIE,
    value,
    sameSite: "Strict",
    ...COOKIE_ATTRIBUTES,
  });
}

export function hasFlashCookie(c: Context) {
  return FLASH_COOKIE in getCookies(c.req.headers);
}

// Returns the flash key only if it is one we know; a stale or tampered value
// (e.g. a key removed in a later deploy) is treated as absent.
export function getFlashCookie(c: Context): FlashKey | undefined {
  const value = getCookies(c.req.headers)[FLASH_COOKIE];

  return value !== undefined && Object.hasOwn(FLASH, value)
    ? value as FlashKey
    : undefined;
}

export function deleteFlashCookie(headers: Headers) {
  deleteCookie(headers, FLASH_COOKIE, COOKIE_ATTRIBUTES);
}
