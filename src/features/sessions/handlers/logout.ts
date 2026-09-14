import { setFlash } from "@features/flash/helpers.ts";
import { Context, isAuthenticatedContext } from "@shared/context.ts";
import { respondForbidden } from "@shared/responses/forbidden.tsx";
import { redirectBack } from "@shared/responses/redirect-back.ts";
import { respondRedirect } from "@shared/responses/redirect.ts";
import { respondUnauthorized } from "@shared/responses/unauthorized.tsx";
import { sessions } from "../collection.ts";
import { deleteSessionCookie } from "../cookie.ts";
import { destroySession } from "../helpers.ts";
import { recordSessionEvent } from "../telemetry.ts";

export async function handleLogOut(c: Context) {
  if (!isAuthenticatedContext(c)) {
    recordSessionEvent("logout", "failure", {
      reason: "unauthenticated",
    });
    return respondUnauthorized(c);
  }

  const formData = await c.req.formData();
  const sessionId = formData.get("sessionId");

  // With a `sessionId` this revokes one of the user's *other* sessions from
  // the sessions table and stays on the page; without, it is a plain logout.
  if (typeof sessionId === "string") {
    const session = await sessions.getById(sessionId);

    const res = redirectBack(c);

    // Already gone (expired, or revoked from another tab): nothing to report.
    if (!session) {
      recordSessionEvent("revoke", "failure", { reason: "not_found" });
      return res;
    }

    if (session.userId !== c.user.id) {
      recordSessionEvent("revoke", "failure", { reason: "forbidden" });
      return respondForbidden(c);
    }

    await destroySession(session);
    setFlash(res.headers, "SESSION_REVOKED");
    recordSessionEvent("revoke", "success");

    return res;
  }

  const res = respondRedirect("/");

  await destroySession(c.session);
  deleteSessionCookie(res.headers);
  setFlash(res.headers, "LOGGED_OUT");
  recordSessionEvent("logout", "success");

  return res;
}
