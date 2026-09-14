import { kv, kvKeys } from "@shared/kv/kv.ts";
import { ulid } from "@std/ulid";
import { SetOptional } from "type-fest";
import { Session } from "./types.ts";

// Deno KV has no secondary indexes, so the full session is written under
// every key it needs to be found by, and all writes go through one atomic
// operation to keep them in sync. The last two are prefix-listable: by user
// (for the sessions table) and by activity (oldest first; no reader yet,
// intended for a future cleanup job).
const sessionKeys = kvKeys<Session>("session")({
  byId: { prefix: "sessions_by_id", props: "id" },
  byCookie: { prefix: "sessions_by_cookie", props: "cookie" },
  byUserId: { prefix: "sessions_by_user_id", props: ["userId", "id"] },
  byLastActive: {
    prefix: "sessions_by_last_active",
    props: ["lastActive", "id"],
  },
});

export function getSessionById(id: Session["id"]) {
  return kv.get<Session>(sessionKeys.byId(id));
}

export function getSessionByCookie(cookie: Session["cookie"]) {
  return kv.get<Session>(sessionKeys.byCookie(cookie));
}

export function listSessionsByUserId(userId: Session["userId"]) {
  return kv.list<Session>({ prefix: sessionKeys.byUserId(userId) });
}

export function setSession(
  partialSession: SetOptional<Session, "id">,
  atomic: Deno.AtomicOperation,
  previous?: Session,
) {
  const session: Session = {
    ...partialSession,
    id: partialSession.id ?? ulid(),
  };

  // `lastActive` is part of one index key, so the old entry has to go or it
  // would linger as a duplicate until its TTL (see `extendCurrentSession`).
  if (previous && previous.lastActive !== session.lastActive) {
    atomic.delete(sessionKeys.byLastActive(previous.lastActive, previous.id));
  }

  // KV's TTL is best-effort cleanup; `sessionMid` still enforces expiry.
  const expireIn = session.expiresAt - Date.now();

  for (const key of sessionKeys.keys(session)) {
    atomic.set(key, session, { expireIn });
  }

  return session;
}

export function deleteSession(session: Session, atomic: Deno.AtomicOperation) {
  for (const key of sessionKeys.keys(session)) {
    atomic.delete(key);
  }
}
