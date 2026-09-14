import {
  getCacheControl,
  getSharedFreshnessLifetime,
} from "@shared/header/cache-control.ts";
import { APP_ID } from "@shared/constants.ts";
import { Context } from "@shared/context.ts";
import { SECOND } from "@std/datetime";
import { isErrorStatus, StatusCode } from "@std/http";
import { HEADER } from "@std/http/unstable-header";
import {
  BareItem,
  boolean,
  integer,
  item,
  serializeItem,
  token,
} from "@std/http/unstable-structured-fields";
import { STORABLE_STATUS_CODES } from "./constants.ts";
import { CacheStatus } from "./types.ts";

// RFC 9111 §4.4: a non-error response to an unsafe request invalidates the
// stored representation of the request URL and of any same-origin URL named
// by `Location`/`Content-Location`. The Cache API only matches GET, so the
// lookups are rebuilt as plain GET requests.
export async function invalidateAfterUnsafeRequest(
  cache: Cache,
  c: Context,
  res: Response,
) {
  if (isErrorStatus(res.status)) return;

  const targets = new Set([c.url.href]);

  for (const name of [HEADER.Location, HEADER.ContentLocation]) {
    const value = res.headers.get(name);
    if (!value) continue;

    const target = new URL(value, c.url);
    if (target.origin === c.url.origin) targets.add(target.href);
  }

  await Promise.all(
    [...targets].map((href) => cache.delete(new Request(href))),
  );
}

// `Cache-Status` is a Structured Field List (RFC 9211 §2); this app's entry is
// an Item whose value is the cache identifier (a Token, so `APP_ID` must fit
// the RFC 9651 §3.3.4 grammar) and whose parameters carry the status, e.g.
// `hobproj;fwd=miss;stored`.
export function appendCacheStatus(res: Response, status: CacheStatus) {
  const params = new Map<string, BareItem>();

  if ("hit" in status) {
    params.set("hit", boolean(true));
    if (status.ttl !== undefined) params.set("ttl", integer(status.ttl));
  } else {
    params.set("fwd", token(status.fwd));
    if (status.stored) params.set("stored", boolean(true));
    if (status.detail) params.set("detail", token(status.detail));
  }

  res.headers.append(
    HEADER.CacheStatus,
    serializeItem(item(token(APP_ID), params)),
  );

  return res;
}

// Returns why the response must not be stored, or `undefined` if it may be.
export function notStorableReason(res: Response) {
  if (!STORABLE_STATUS_CODES.has(res.status as StatusCode)) {
    return "STATUS";
  }

  if (res.headers.has(HEADER.SetCookie)) {
    return "SET-COOKIE";
  }

  const cc = getCacheControl(res.headers);

  if (cc.noStore) {
    return "NO-STORE";
  }

  if (cc.private) {
    return "PRIVATE";
  }

  if (!cc.public) {
    return "NOT-PUBLIC";
  }
}

// Seconds since the entry was stored, per its `Date` header; `undefined` if
// the header is missing or unparseable.
export function getAge(res: Response) {
  const storedAt = Date.parse(res.headers.get(HEADER.Date) ?? "");

  if (Number.isNaN(storedAt)) {
    return undefined;
  }

  return Math.max(0, Math.floor((Date.now() - storedAt) / SECOND));
}

// Unlike Deno Deploy's hosted cache, the Deno CLI Cache API (used on our
// self-hosted server) ignores `max-age`/`Expires` and never evicts by
// freshness, so it is checked here against the `Date` recorded on store.
// Returns remaining freshness in whole seconds, or `undefined` if unknown.
export function getRemainingTtl(res: Response, age = getAge(res)) {
  const lifetime = getSharedFreshnessLifetime(res);

  if (lifetime === undefined || age === undefined) {
    return undefined;
  }

  return lifetime - age;
}
