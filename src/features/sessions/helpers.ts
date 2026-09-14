import { setFlash } from "@features/flash/helpers.ts";
import { users } from "@features/users/collection.ts";
import { AuthenticatedContext, Context } from "@shared/context.ts";
import { generateRandomToken } from "@shared/crypto/random-token.ts";
import { cacheNoStoreOnCookieChange } from "@shared/header/cache-control.ts";
import { kv } from "@shared/kv/kv.ts";
import { decodeTime } from "@std/ulid";
import { sessions } from "./collection.ts";
import {
  SENSITIVE_ACTION_MAX_AUTH_AGE,
  SESSION_ABSOLUTE_TIMEOUT,
  SESSION_EXPIRY_WARNING_THRESHOLD,
  SESSION_IDLE_TIMEOUT,
} from "./constants.ts";
import { deleteSessionCookie, setSessionCookie } from "./cookie.ts";
import { Session } from "./types.ts";

// The session id is a ULID minted whenever a passkey ceremony completes
// (login or reauth), so decoding it gives the time of last authentication.
export function getSessionAuthTime(session: Session) {
  return decodeTime(session.id);
}

export function getSessionAbsoluteExpiresAt(session: Session) {
  return getSessionAuthTime(session) + SESSION_ABSOLUTE_TIMEOUT;
}

export function isSessionExpiringSoon(session: Session) {
  return getSessionAbsoluteExpiresAt(session) - Date.now() <=
    SESSION_EXPIRY_WARNING_THRESHOLD;
}

export function isReauthRequiredForSensitiveAction(session: Session) {
  return Date.now() - getSessionAuthTime(session) >
    SENSITIVE_ACTION_MAX_AUTH_AGE;
}

// Queues a fresh session for `userId` on `atomic`, built from the request's
// UA/IP. The caller commits and, on success, calls `setNewSessionCookie`.
// Lets signup create user, passkey and session in one commit.
export function stageSession(
  c: Context,
  userId: string,
  passkeyId: string,
  atomic: Deno.AtomicOperation,
) {
  const now = Date.now();

  return sessions.stageSet(atomic, {
    cookie: generateRandomToken(),
    userId,
    passkeyId,
    expiresAt: now + SESSION_IDLE_TIMEOUT,
    lastActive: now,
    browser: c.ua.browser.name,
    os: c.ua.os.name,
    ip: c.ip,
  });
}

export function setNewSessionCookie(headers: Headers, session: Session) {
  setSessionCookie(headers, session.expiresAt - Date.now(), session.cookie);
}

// Standalone login: verifies the user still exists and commits the session
// on its own. Signup uses `stageSession` directly instead.
export async function createSession(
  c: Context,
  headers: Headers,
  userId: string,
  passkeyId: string,
) {
  const userEntry = await users.getEntryById(userId);

  if (!userEntry.value) {
    return false;
  }

  const atomic = kv.atomic();

  // Fails the commit if the user was modified or deleted in between, so a
  // session can't be minted for an account that was just removed.
  atomic.check(userEntry);

  const session = await stageSession(c, userId, passkeyId, atomic);

  const result = await atomic.commit();

  if (!result.ok) {
    return false;
  }

  setNewSessionCookie(headers, session);

  return true;
}

export async function extendCurrentSession(
  c: AuthenticatedContext,
  headers: Headers,
  sessionEntry: Deno.KvEntry<Session>,
) {
  const session = sessionEntry.value;
  const now = Date.now();

  const absoluteExpiresAt = getSessionAbsoluteExpiresAt(session);

  // Sliding idle window, clamped so it never outlives the absolute timeout.
  // Near the end of the week the cookie and KV TTL shrink accordingly.
  const duration = Math.min(
    SESSION_IDLE_TIMEOUT,
    absoluteExpiresAt - now,
  );

  if (duration <= 0) {
    await destroySessionIfUnchanged(sessionEntry);
    deleteSessionCookie(headers);
    setFlash(headers, "SESSION_EXPIRED");
    cacheNoStoreOnCookieChange(c, headers);
    return;
  }

  const updatedSession = {
    ...session,
    expiresAt: now + duration,
    lastActive: now,
    ip: c.ip,
  };

  const atomic = kv.atomic();

  // `lastActive` is part of one index key; `setSession` drops the stale
  // entry itself when given the previous session.
  atomic.check(sessionEntry);
  await sessions.stageSet(atomic, updatedSession, { previous: session });

  const result = await atomic.commit();

  // Lost a race with another request extending the same session; that one
  // already set a fresh cookie, so there is nothing to do.
  if (!result.ok) {
    return;
  }

  setSessionCookie(
    headers,
    duration,
    updatedSession.cookie,
  );
}

// Unconditional delete, for explicit logout/revoke. Prefer
// `destroySessionIfUnchanged` when reacting to state that may be stale.
export async function destroySession(session: Session) {
  const atomic = kv.atomic();

  await sessions.stageDelete(atomic, session);

  const result = await atomic.commit();

  return result.ok;
}

export async function destroySessionIfUnchanged(
  entry: Deno.KvEntry<Session>,
) {
  const atomic = kv.atomic();

  atomic.check(entry);
  await sessions.stageDelete(atomic, entry.value);

  const result = await atomic.commit();

  return result.ok;
}
