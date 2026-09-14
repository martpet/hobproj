import { Context } from "@shared/context.ts";
import { isWebKit } from "@shared/header/user-agent.ts";
import { MINUTE, SECOND } from "@std/datetime";
import {
  formatCacheControl,
  parseCacheControl,
  ResponseCacheControl,
} from "@std/http/unstable-cache-control";
import { HEADER } from "@std/http/unstable-header";

// Default freshness lifetime, in seconds, for responses that don't set their
// own `max-age`.
export const DEFAULT_MAX_AGE = (5 * MINUTE) / SECOND;

// Parsed response `Cache-Control`. Only our own handlers set this header, so
// a malformed value is a bug and the parser's `SyntaxError` is left to
// propagate.
export function getCacheControl(headers: Headers): ResponseCacheControl {
  return parseCacheControl(headers.get(HEADER.CacheControl));
}

export function setCacheControl(headers: Headers, cc: ResponseCacheControl) {
  headers.set(HEADER.CacheControl, formatCacheControl(cc));
}

export function cacheNoStore(headers: Headers) {
  setCacheControl(headers, { noStore: true });
}

// Call this on any cacheable response that changes a cookie the response
// varies on (via Set-Cookie). WebKit records the `Vary: Cookie` value for a
// stored entry from the cookie jar *after* applying the response's
// Set-Cookie, so it files such a response under the wrong variant and may
// later serve it to a request whose cookies never produced it.
// Upstream bug: https://bugs.webkit.org/show_bug.cgi?id=323342 (remove this
// workaround once it is fixed and the fix has shipped). FIXME in
// headerValueForVary, WebCore/platform/network/CacheValidation.cpp:
// https://github.com/WebKit/WebKit/blob/7d09127ca947791dc0a72109466a9b0433ab898e/Source/WebCore/platform/network/CacheValidation.cpp#L413
// This affects every WebKit browser (Safari, all iOS browsers, Epiphany);
// Blink and Gecko snapshot the request's Cookie header and need nothing.
// `max-age=0, must-revalidate` would be the only equivalent alternative;
// `Vary` tricks are not (Vary only matches *request* headers).
export function cacheNoStoreOnCookieChange(c: Context, headers: Headers) {
  if (isWebKit(c.ua.engine)) {
    cacheNoStore(headers);
  }
}

export function toPrivateCacheControl(headers: Headers) {
  const { public: _public, sMaxage: _sMaxage, ...rest } = getCacheControl(
    headers,
  );

  setCacheControl(headers, { ...rest, private: true });
}

// Freshness lifetime in seconds for a shared cache (`s-maxage` wins over
// `max-age`), or `undefined` when the response does not declare one.
export function getSharedFreshnessLifetime(res: Response) {
  const cc = getCacheControl(res.headers);

  return cc.sMaxage ?? cc.maxAge;
}

// `Vary` is a plain comma-separated list of field names (RFC 9110 §12.5.5),
// not a Structured Field, so it is handled by hand.
export function addVaryCookie(headers: Headers) {
  const fields = (headers.get(HEADER.Vary) ?? "")
    .split(",")
    .map((field) => field.trim())
    .filter(Boolean);

  if (!fields.some((field) => field.toLowerCase() === "cookie")) {
    fields.push("Cookie");
  }

  headers.set(HEADER.Vary, fields.join(", "));
}
