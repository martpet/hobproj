import { setFlash } from "@features/flash/helpers.ts";
import { users } from "@features/users/collection.ts";
import { isAuthenticatedContext } from "@shared/context.ts";
import { cacheNoStoreOnCookieChange } from "@shared/header/cache-control.ts";
import { Middleware } from "@shared/types.ts";
import { sessions } from "./collection.ts";
import { SESSION_ACTIVITY_INTERVAL } from "./constants.ts";
import { deleteSessionCookie, getSessionCookie } from "./cookie.ts";
import {
  destroySessionIfUnchanged,
  extendCurrentSession,
  getSessionAbsoluteExpiresAt,
} from "./helpers.ts";

// Paths that never need a user and would otherwise cost a KV read (and a
// possible session write) per request. Substring/regex matched against the
// pathname.
const SKIP = [
  "/assets/",
  "^/webhook/",
  "^/favicon.ico$",
  "^/apple-touch-icon",
];

// Resolves the session cookie into `c.session`/`c.user` for everything
// downstream, cleans up dead cookies, and slides the idle expiry on activity.
// Runs inside `cacheMid` so `cacheControlMid` can see whether the request
// ended up authenticated.
export const sessionMid: Middleware = (next) => async (c) => {
  if (SKIP.some((rule) => c.url.pathname.match(rule))) {
    return next(c);
  }

  const cookie = getSessionCookie(c);

  if (!cookie) {
    return next(c);
  }

  const sessionEntry = await sessions.getEntryByCookie(cookie);
  const session = sessionEntry.value;

  // Cookie for a session that no longer exists (revoked elsewhere, KV TTL
  // expired, DB reset): let the request through anonymously and drop it.
  if (!session) {
    const res = await next(c);
    deleteSessionCookie(res.headers);
    cacheNoStoreOnCookieChange(c, res.headers);
    return res;
  }

  const now = Date.now();
  const absoluteExpiresAt = getSessionAbsoluteExpiresAt(session);

  // The KV TTL is only a backstop and can lag, so expiry is checked here too.
  // Deletion is conditional on the entry being unchanged: if a concurrent
  // request has already extended it, this one must not tear it down, and
  // must not tell the browser to drop a cookie that is valid again.
  if (
    session.expiresAt <= now ||
    absoluteExpiresAt <= now
  ) {
    const destroyed = await destroySessionIfUnchanged(sessionEntry);

    const res = await next(c);

    if (destroyed) {
      deleteSessionCookie(res.headers);
      setFlash(res.headers, "SESSION_EXPIRED");
      cacheNoStoreOnCookieChange(c, res.headers);
    }

    return res;
  }

  // Account deleted while a session was still around (e.g. a race with the
  // atomic delete): treat it like an expired session, minus the flash.
  const user = await users.getById(session.userId);

  if (!user) {
    const destroyed = await destroySessionIfUnchanged(sessionEntry);

    const res = await next(c);

    if (destroyed) {
      deleteSessionCookie(res.headers);
      cacheNoStoreOnCookieChange(c, res.headers);
    }

    return res;
  }

  c.session = session;
  c.user = user;

  const res = await next(c);

  // Extend *after* the handler ran: the refreshed cookie has to go on the
  // response, and a handler that logged out (clearing `c.session`) must not
  // have its session resurrected — hence re-checking `isAuthenticatedContext`.
  // Throttled by `SESSION_ACTIVITY_INTERVAL` so a burst of requests doesn't
  // rewrite four KV keys each time.
  const shouldExtendSession = isAuthenticatedContext(c) &&
    Date.now() - session.lastActive >= SESSION_ACTIVITY_INTERVAL;

  if (shouldExtendSession) {
    await extendCurrentSession(c, res.headers, sessionEntry);
  }

  return res;
};
