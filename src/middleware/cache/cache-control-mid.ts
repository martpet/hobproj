import { CACHEABLE_METHODS, CACHEABLE_STATUS_CODES } from "./constants.ts";
import {
  addVaryCookie,
  DEFAULT_MAX_AGE,
  getCacheControl,
  setCacheControl,
  toPrivateCacheControl,
} from "@shared/header/cache-control.ts";
import { isAuthenticatedContext } from "@shared/context.ts";
import { Middleware } from "@shared/types.ts";
import { StatusCode } from "@std/http";
import { HEADER } from "@std/http/unstable-header";

// Sets `Cache-Control`/`Vary` on cacheable responses for downstream caches
// (browser, CDN): authenticated responses become `private`, anonymous ones
// without an explicit policy get the public default, and anything revalidated
// against cookies gets `Vary: Cookie`. Composed inside `serverCacheMid` (so
// stored responses carry these headers) and outside `sessionMid` (so
// `isAuthenticatedContext` reflects the resolved session).
export const cacheControlMid: Middleware = (next) => async (c) => {
  const res = await next(c);

  if (
    !CACHEABLE_METHODS.has(c.method) ||
    !CACHEABLE_STATUS_CODES.has(res.status as StatusCode)
  ) {
    return res;
  }

  if (isAuthenticatedContext(c)) {
    toPrivateCacheControl(res.headers);
  } else if (!res.headers.has(HEADER.CacheControl)) {
    // Anonymous responses without a policy of their own default to `public`;
    // never applied when authenticated.
    setCacheControl(res.headers, { public: true, maxAge: DEFAULT_MAX_AGE });
  }

  const cc = getCacheControl(res.headers);

  if (!cc.noStore && !cc.immutable) {
    addVaryCookie(res.headers);
  }

  return res;
};
