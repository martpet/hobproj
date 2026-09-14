import { WEBAUTHN_TIMEOUT } from "./constants.ts";
import { IS_DEV } from "@shared/constants.ts";
import { Context } from "@shared/context.ts";
import { generateRandomToken } from "@shared/crypto/random-token.ts";
import { SECOND } from "@std/datetime";
import { deleteCookie, getCookies, setCookie } from "@std/http";

const PASSKEY_REG_COOKIE = "passkey_reg";
const PASSKEY_AUTH_COOKIE = "passkey_auth";

const COOKIE_ATTRIBUTES = {
  path: "/",
  secure: !IS_DEV,
  httpOnly: true,
};

// Both ceremony cookies are `Strict`: they are only ever read by a same-site
// `fetch()` seconds after being set, so there is no cross-site case to allow.
export function setPasskeyRegCookie(headers: Headers) {
  const value = generateRandomToken();

  setCookie(headers, {
    name: PASSKEY_REG_COOKIE,
    value,
    sameSite: "Strict",
    maxAge: WEBAUTHN_TIMEOUT / SECOND,
    ...COOKIE_ATTRIBUTES,
  });

  return value;
}

export function setPasskeyAuthCookie(headers: Headers) {
  const value = generateRandomToken();

  setCookie(headers, {
    name: PASSKEY_AUTH_COOKIE,
    value,
    sameSite: "Strict",
    maxAge: WEBAUTHN_TIMEOUT / SECOND,
    ...COOKIE_ATTRIBUTES,
  });

  return value;
}

export function getPasskeyRegCookie(c: Context) {
  return getCookies(c.req.headers)[PASSKEY_REG_COOKIE];
}

export function getPasskeyAuthCookie(c: Context) {
  return getCookies(c.req.headers)[PASSKEY_AUTH_COOKIE];
}

export function deletePasskeyRegCookie(headers: Headers) {
  deleteCookie(headers, PASSKEY_REG_COOKIE, COOKIE_ATTRIBUTES);
}

export function deletePasskeyAuthCookie(headers: Headers) {
  deleteCookie(headers, PASSKEY_AUTH_COOKIE, COOKIE_ATTRIBUTES);
}
